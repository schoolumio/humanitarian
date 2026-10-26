import type { Severity } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit, recordStatusChange } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { newComplaintReference } from "@/lib/ids";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { notify, notifyRole } from "../notifications";
import { requireAnyPermission, requirePermission, type Actor } from "../actor";

export const complaintSchema = z.object({
  contactName: z.string().trim().min(2).max(120),
  contactEmail: z.email().trim().toLowerCase(),
  complainantRole: z.enum(["APPLICANT", "BENEFICIARY", "DONOR", "SPONSOR", "PUBLIC", "STAFF"]),
  category: z.enum(["SAFEGUARDING", "FRAUD", "MISCONDUCT", "PRIVACY", "PAYMENT", "SERVICE", "OTHER"]),
  subject: z.string().trim().min(5).max(200),
  description: z.string().trim().min(20, "Please describe what happened.").max(8000),
  relatedReference: z.string().trim().max(60).optional().transform((v) => v || null),
});

/** Anyone may complain, signed in or not. Safeguarding concerns route only to safeguarding officers. */
export async function submitComplaint(actor: Actor | null, raw: unknown, ctx: { ipHash: string | null }) {
  await enforceRateLimit(`complaint:${ctx.ipHash ?? "unknown"}`, 10, 3600);
  const d = complaintSchema.parse(raw);
  const isSafeguarding = d.category === "SAFEGUARDING" || d.category === "MISCONDUCT";
  const severity: Severity = isSafeguarding ? "HIGH" : d.category === "FRAUD" ? "HIGH" : "MEDIUM";
  return db.$transaction(async (tx) => {
    const c = await tx.complaint.create({ data: { ...d, reference: newComplaintReference(), submittedById: actor?.userId ?? null, isSafeguarding, severity } });
    await recordStatusChange(tx, { entityType: "COMPLAINT", entityId: c.id, from: null, to: "RECEIVED", actorId: actor?.userId ?? null });
    await audit({ actorId: actor?.userId ?? null, action: "complaint.submit", entityType: "Complaint", entityId: c.id, metadata: { category: d.category } }, tx);
    await notify(tx, { userId: actor?.userId, to: d.contactEmail, template: "complaint_received", params: { name: d.contactName, reference: c.reference }, dedupeKey: `complaint:${c.id}` });
    await notifyRole(tx, isSafeguarding ? "SAFEGUARDING_OFFICER" : "ADMIN", {
      title: isSafeguarding ? "Safeguarding concern received" : "New complaint received",
      body: `Complaint ${c.reference} (${d.category}).`, path: `/staff/complaints/${c.id}`, dedupeKey: `complaint-staff:${c.id}`,
    });
    return c;
  });
}

function scope(actor: Actor) {
  // Admins handle ordinary complaints; safeguarding complaints are restricted to safeguarding officers.
  return actor.permissions.has("safeguarding.manage") ? {} : { isSafeguarding: false };
}

export async function listComplaints(actor: Actor, status?: string) {
  const a = requirePermission(actor, "complaint.manage");
  return db.complaint.findMany({
    where: { ...scope(a), ...(status ? { status: status as never } : { status: { in: ["RECEIVED", "INVESTIGATING"] } }) },
    orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
    take: 100,
    select: { id: true, reference: true, category: true, subject: true, severity: true, status: true, isSafeguarding: true, createdAt: true, complainantRole: true },
  });
}

export async function getComplaint(actor: Actor, id: string) {
  const a = requirePermission(actor, "complaint.manage");
  const c = await db.complaint.findFirst({ where: { id, ...scope(a) }, include: { safeguarding: true } });
  if (!c) throw notFound();
  if (c.isSafeguarding) await audit({ actorId: a.userId, action: "safeguarding.view", entityType: "Complaint", entityId: id });
  const history = await db.statusHistory.findMany({ where: { entityType: "COMPLAINT", entityId: id }, orderBy: { createdAt: "desc" } });
  return { c, history };
}

export async function updateComplaint(actor: Actor, id: string, input: { status: "INVESTIGATING" | "RESOLVED" | "CLOSED"; resolution?: string; severity?: Severity }) {
  const a = requirePermission(actor, "complaint.manage");
  await db.$transaction(async (tx) => {
    const c = await tx.complaint.findFirst({ where: { id, ...scope(a) } });
    if (!c) throw notFound();
    if (c.submittedById === a.userId) throw forbidden("You cannot handle a complaint you submitted.");
    if ((input.status === "RESOLVED" || input.status === "CLOSED") && (!input.resolution || input.resolution.trim().length < 20)) {
      throw invalid("Document the resolution, actions taken and how the complainant was informed.");
    }
    if (c.isSafeguarding && input.status !== "INVESTIGATING") {
      const open = await tx.safeguardingRecord.count({ where: { complaintId: id, status: { not: "RESOLVED" } } });
      if (open) throw conflict("Resolve the linked safeguarding record(s) first.");
    }
    await tx.complaint.update({
      where: { id },
      data: { status: input.status, severity: input.severity ?? c.severity, assignedToId: c.assignedToId ?? a.userId, ...(input.resolution ? { resolution: input.resolution.trim(), resolvedById: a.userId, resolvedAt: new Date() } : {}) },
    });
    await recordStatusChange(tx, { entityType: "COMPLAINT", entityId: id, from: c.status, to: input.status, actorId: a.userId });
    await audit({ actorId: a.userId, action: "complaint.update", entityType: "Complaint", entityId: id, metadata: { status: input.status } }, tx);
  });
}

// ─── Safeguarding (restricted) ───

export const safeguardingSchema = z.object({
  complaintId: z.string().optional().transform((v) => v || null),
  applicationId: z.string().optional().transform((v) => v || null),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  summary: z.string().trim().min(20).max(8000),
  actionsTaken: z.string().trim().max(8000).optional().transform((v) => v || null),
  restrictPublication: z.preprocess((v) => v === "on" || v === true, z.boolean()),
});

export async function createSafeguardingRecord(actor: Actor, raw: unknown) {
  const a = requirePermission(actor, "safeguarding.manage");
  const d = safeguardingSchema.parse(raw);
  if (!d.complaintId && !d.applicationId) throw invalid("Link the record to a complaint or a case.");
  return db.$transaction(async (tx) => {
    const r = await tx.safeguardingRecord.create({ data: { ...d, createdById: a.userId } });
    await audit({ actorId: a.userId, action: "safeguarding.create", entityType: "SafeguardingRecord", entityId: r.id, metadata: { severity: d.severity } }, tx);
    return r;
  });
}

export async function listSafeguarding(actor: Actor) {
  const a = requirePermission(actor, "safeguarding.manage");
  await audit({ actorId: a.userId, action: "safeguarding.list_view", entityType: "SafeguardingRecord" });
  return db.safeguardingRecord.findMany({ orderBy: [{ status: "asc" }, { severity: "desc" }, { createdAt: "desc" }], take: 100, include: { complaint: { select: { reference: true } }, application: { select: { reference: true } } } });
}

/** Serious incidents (HIGH/CRITICAL) need a documented resolution before closing. */
export async function resolveSafeguardingRecord(actor: Actor, id: string, resolution: string, status: "MONITORING" | "RESOLVED") {
  const a = requirePermission(actor, "safeguarding.manage");
  const r = await db.safeguardingRecord.findUnique({ where: { id } });
  if (!r) throw notFound();
  const min = r.severity === "HIGH" || r.severity === "CRITICAL" ? 50 : 10;
  if (resolution.trim().length < min) throw invalid(`Document the resolution in detail (at least ${min} characters for ${r.severity} incidents).`);
  await db.$transaction(async (tx) => {
    await tx.safeguardingRecord.update({ where: { id }, data: { status, resolution: resolution.trim(), ...(status === "RESOLVED" ? { resolvedById: a.userId, resolvedAt: new Date() } : {}) } });
    await audit({ actorId: a.userId, action: "safeguarding.update", entityType: "SafeguardingRecord", entityId: id, metadata: { status } }, tx);
  });
}

export async function submitContactMessage(raw: unknown, ctx: { ipHash: string | null }) {
  await enforceRateLimit(`contact:${ctx.ipHash ?? "unknown"}`, 10, 3600);
  const d = z.object({
    name: z.string().trim().min(2).max(120),
    email: z.email().trim().toLowerCase(),
    topic: z.enum(["GENERAL", "APPLY_HELP", "DONATION", "PARTNERSHIP", "MEDIA", "OTHER"]),
    message: z.string().trim().min(10).max(4000),
  }).parse(raw);
  return db.contactMessage.create({ data: d });
}

export async function listContactMessages(actor: Actor) {
  requireAnyPermission(actor, ["admin.contact"]);
  return db.contactMessage.findMany({ orderBy: [{ handled: "asc" }, { createdAt: "desc" }], take: 100 });
}

export async function markContactHandled(actor: Actor, id: string) {
  const a = requirePermission(actor, "admin.contact");
  await db.contactMessage.update({ where: { id }, data: { handled: true } });
  await audit({ actorId: a.userId, action: "contact.handled", entityType: "ContactMessage", entityId: id });
}
