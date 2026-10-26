import type { Severity } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { invalid, notFound } from "@/lib/errors";
import { requirePermission, type Actor } from "../actor";

/**
 * Risk indicators route records to a human for review. They never decide eligibility,
 * never reject an application and never block a payment on their own.
 */
export async function raiseRiskAlert(
  tx: Tx,
  input: { type: string; severity: Severity; details: string; applicationId?: string; campaignId?: string; paymentId?: string; dedupeKey: string },
) {
  const existing = await tx.riskAlert.findUnique({ where: { dedupeKey: input.dedupeKey } });
  if (existing) return existing;
  return tx.riskAlert.create({ data: input });
}

export async function listRiskAlerts(actor: Actor, opts: { status?: "OPEN" | "REVIEWED" | "DISMISSED"; page?: number }) {
  requirePermission(actor, "risk.review");
  const page = Math.max(1, opts.page ?? 1);
  const where = { status: opts.status ?? "OPEN" } as const;
  // Safeguarding-type alerts are only visible to safeguarding officers.
  const restrict = actor.permissions.has("safeguarding.manage") ? {} : { type: { not: "URGENT_SAFETY_CONCERN" } };
  const [rows, total] = await Promise.all([
    db.riskAlert.findMany({ where: { ...where, ...restrict }, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * 25, take: 25 }),
    db.riskAlert.count({ where: { ...where, ...restrict } }),
  ]);
  return { rows, total, page, pageSize: 25 };
}

export async function reviewRiskAlert(actor: Actor, id: string, outcome: "REVIEWED" | "DISMISSED", note: string) {
  requirePermission(actor, "risk.review");
  if (note.trim().length < 5) throw invalid("Record what you checked and why.");
  const alert = await db.riskAlert.findUnique({ where: { id } });
  if (!alert) throw notFound();
  if (alert.type === "URGENT_SAFETY_CONCERN" && !actor.permissions.has("safeguarding.manage")) throw notFound();
  await db.$transaction(async (tx) => {
    await tx.riskAlert.update({ where: { id }, data: { status: outcome, reviewNote: note.trim(), reviewedById: actor.userId, reviewedAt: new Date() } });
    await audit({ actorId: actor.userId, action: "risk.review", entityType: "RiskAlert", entityId: id, metadata: { outcome } }, tx);
  });
}
