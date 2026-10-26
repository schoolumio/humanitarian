import { createHash } from "node:crypto";
import type { FilePurpose, StoredFile } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { newStorageKey } from "@/lib/ids";
import { storage, SIGNED_URL_TTL_SECONDS } from "@/lib/storage";
import {
  ALLOWED_TYPES,
  EXTENSION_FOR,
  MAX_UPLOAD_BYTES,
  safeDisplayName,
  sniffFileType,
} from "@/lib/storage/files";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireActor, type Actor } from "../actor";

const UPLOADABLE: FilePurpose[] = [
  "APPLICATION_EVIDENCE",
  "VERIFICATION_EVIDENCE",
  "DELIVERY_EVIDENCE",
  "INVOICE",
  "MEDIA_ORIGINAL",
];

/** Authorise an upload for a purpose (and target application where relevant). */
async function authoriseUpload(actor: Actor, purpose: FilePurpose, applicationId: string | null) {
  switch (purpose) {
    case "APPLICATION_EVIDENCE": {
      if (!applicationId) throw invalid("Missing application.");
      const app = await db.application.findUnique({ where: { id: applicationId } });
      if (!app || app.applicantId !== actor.userId) throw notFound();
      if (
        ![
          "DRAFT",
          "SUBMITTED",
          "INITIAL_REVIEW",
          "ADDITIONAL_INFORMATION_REQUIRED",
          "VERIFICATION_IN_PROGRESS",
          "FIELD_VISIT_REQUIRED",
        ].includes(app.status)
      ) {
        throw conflict("Evidence can no longer be added to this request.");
      }
      return;
    }
    case "VERIFICATION_EVIDENCE": {
      if (!applicationId) throw invalid("Missing application.");
      const app = await db.application.findUnique({ where: { id: applicationId } });
      if (!app || app.status === "DRAFT") throw notFound();
      if (app.applicantId === actor.userId) throw forbidden();
      if (actor.permissions.has("application.triage")) return;
      const assigned = await db.investigatorAssignment.findFirst({
        where: { applicationId, investigatorId: actor.userId, active: true },
      });
      if (assigned && actor.permissions.has("investigation.record")) return;
      throw forbidden();
    }
    case "DELIVERY_EVIDENCE":
      if (actor.permissions.has("intervention.manage")) return;
      throw forbidden();
    case "INVOICE":
      if (
        actor.permissions.has("finance.disbursement.request") ||
        actor.permissions.has("intervention.manage")
      )
        return;
      throw forbidden();
    case "MEDIA_ORIGINAL":
      if (actor.permissions.has("media.manage")) return;
      throw forbidden();
    default:
      throw forbidden();
  }
}

export async function uploadFile(
  actorIn: Actor | null,
  input: {
    purpose: string;
    applicationId?: string | null;
    file: { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };
  },
): Promise<Pick<StoredFile, "id" | "originalName" | "mimeType" | "sizeBytes">> {
  const actor = requireActor(actorIn);
  const purpose = input.purpose as FilePurpose;
  if (!UPLOADABLE.includes(purpose)) throw invalid("Unsupported upload type.");
  await enforceRateLimit(`upload:${actor.userId}`, 60, 3600);
  if (input.file.size <= 0) throw invalid("The file is empty.");
  if (input.file.size > MAX_UPLOAD_BYTES)
    throw invalid("Files must be 4 MB or smaller. Try a smaller photo or a PDF.");
  await authoriseUpload(actor, purpose, input.applicationId ?? null);

  const buf = Buffer.from(await input.file.arrayBuffer());
  if (buf.length > MAX_UPLOAD_BYTES) throw invalid("Files must be 4 MB or smaller.");
  const type = sniffFileType(buf);
  if (!type || !ALLOWED_TYPES[purpose].includes(type)) {
    throw invalid("This file type is not accepted. Upload a JPEG, PNG or WebP photo, or a PDF document.");
  }
  const key = newStorageKey();
  const baseName = safeDisplayName(input.file.name).replace(/\.[^.]*$/, "");
  const originalName = `${baseName}.${EXTENSION_FOR[type]}`;
  await storage().put(key, buf, type, "PRIVATE");
  const scanMode = env().MALWARE_SCAN_MODE;
  const record = await db.storedFile.create({
    data: {
      storageKey: key,
      visibility: "PRIVATE",
      purpose,
      originalName,
      mimeType: type,
      sizeBytes: buf.length,
      sha256: createHash("sha256").update(buf).digest("hex"),
      scanStatus: scanMode === "external" ? "PENDING" : "NOT_SCANNED_DEV",
      uploadedById: actor.userId,
      applicationId:
        purpose === "APPLICATION_EVIDENCE" || purpose === "VERIFICATION_EVIDENCE"
          ? (input.applicationId ?? null)
          : null,
    },
    select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
  });
  await audit({
    actorId: actor.userId,
    action: "file.upload",
    entityType: "StoredFile",
    entityId: record.id,
    metadata: { purpose, type, size: buf.length },
  });
  return record;
}

/** Decide whether an actor may download a private file. */
export async function canAccessFile(actor: Actor, file: StoredFile): Promise<boolean> {
  if (file.deletedAt) return false;
  if (file.uploadedById === actor.userId && file.purpose === "APPLICATION_EVIDENCE") return true;
  switch (file.purpose) {
    case "APPLICATION_EVIDENCE":
    case "VERIFICATION_EVIDENCE": {
      if (!file.applicationId) return false;
      const app = await db.application.findUnique({ where: { id: file.applicationId } });
      if (!app || app.applicantId === actor.userId)
        return file.uploadedById === actor.userId && file.purpose === "APPLICATION_EVIDENCE";
      if (actor.permissions.has("application.view_all")) return true;
      if (actor.permissions.has("application.view_assigned")) {
        return !!(await db.investigatorAssignment.findFirst({
          where: { applicationId: app.id, investigatorId: actor.userId, active: true },
        }));
      }
      return false;
    }
    case "DELIVERY_EVIDENCE":
      return (
        actor.permissions.has("intervention.manage") ||
        actor.permissions.has("finance.view") ||
        actor.permissions.has("intervention.outcome_review")
      );
    case "INVOICE":
      return actor.permissions.has("finance.view") || actor.permissions.has("intervention.manage");
    case "MEDIA_ORIGINAL":
      return actor.permissions.has("media.manage") || actor.permissions.has("safeguarding.manage");
    default:
      return false;
  }
}

/** Issue a short-lived signed URL after an authorisation check. Every access is audited. */
export async function getDownloadUrl(actorIn: Actor | null, fileId: string): Promise<string> {
  const actor = requireActor(actorIn);
  const file = await db.storedFile.findUnique({ where: { id: fileId } });
  // Same response for missing and forbidden files (no existence oracle).
  if (!file || file.visibility !== "PRIVATE" || !(await canAccessFile(actor, file))) {
    await audit({
      actorId: actor.userId,
      action: "file.access_denied",
      entityType: "StoredFile",
      entityId: fileId,
    });
    throw notFound("File not found.");
  }
  if (file.scanStatus === "PENDING")
    throw conflict("This file is still being checked for malware. Try again shortly.");
  if (file.scanStatus === "INFECTED")
    throw conflict("This file failed the malware check and cannot be opened.");
  await audit({
    actorId: actor.userId,
    action: "file.download",
    entityType: "StoredFile",
    entityId: file.id,
    metadata: { purpose: file.purpose },
  });
  return storage().signedDownloadUrl(file.storageKey, {
    filename: file.originalName,
    contentType: file.mimeType,
    ttlSeconds: SIGNED_URL_TTL_SECONDS,
  });
}

/** Malware scanner callback (external scanner integration). */
export async function recordScanResult(fileId: string, clean: boolean) {
  const file = await db.storedFile.findUnique({ where: { id: fileId } });
  if (!file) throw notFound();
  await db.storedFile.update({ where: { id: fileId }, data: { scanStatus: clean ? "CLEAN" : "INFECTED" } });
  await audit({
    actorId: null,
    action: "file.scan_result",
    entityType: "StoredFile",
    entityId: fileId,
    metadata: { clean },
  });
  if (!clean) await storage().delete(file.storageKey, file.visibility);
}

export async function deleteOwnEvidence(actorIn: Actor | null, fileId: string) {
  const actor = requireActor(actorIn);
  const file = await db.storedFile.findUnique({ where: { id: fileId } });
  if (
    !file ||
    file.uploadedById !== actor.userId ||
    file.purpose !== "APPLICATION_EVIDENCE" ||
    !file.applicationId
  )
    throw notFound();
  const app = await db.application.findUniqueOrThrow({ where: { id: file.applicationId } });
  if (app.status !== "DRAFT")
    throw conflict(
      "Evidence cannot be removed after submission. Contact us if you uploaded something by mistake.",
    );
  await db.storedFile.update({ where: { id: fileId }, data: { deletedAt: new Date() } });
  await storage().delete(file.storageKey, "PRIVATE");
  await audit({ actorId: actor.userId, action: "file.delete", entityType: "StoredFile", entityId: fileId });
}
