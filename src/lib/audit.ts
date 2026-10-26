import type { Prisma } from "@prisma/client";
import type { Tx } from "./db";
import { db } from "./db";

export type AuditInput = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipHash?: string | null;
};

/**
 * Append an audit record. Never pass passwords, tokens, identity documents, or
 * applicant narratives in metadata – record ids and field names instead.
 */
export async function audit(input: AuditInput, tx: Tx = db) {
  await tx.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata,
      ipHash: input.ipHash ?? null,
    },
  });
}

export async function recordStatusChange(
  tx: Tx,
  input: {
    entityType: Prisma.StatusHistoryCreateInput["entityType"];
    entityId: string;
    from: string | null;
    to: string;
    actorId: string | null;
    reason?: string | null;
  },
) {
  await tx.statusHistory.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      fromStatus: input.from,
      toStatus: input.to,
      actorId: input.actorId,
      reason: input.reason ?? null,
    },
  });
}
