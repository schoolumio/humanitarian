import type { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { PRIVILEGED_ROLES } from "@/lib/permissions";
import { invalidateAllUserSessions } from "@/lib/auth/session";
import { requirePermission, type Actor } from "../actor";

export async function listUsers(actor: Actor, q?: string, page = 1) {
  requirePermission(actor, "admin.users");
  const where: Prisma.UserWhereInput = q ? { OR: [{ email: { contains: q.toLowerCase() } }, { name: { contains: q, mode: "insensitive" } }] } : {};
  const [rows, total] = await Promise.all([
    db.user.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 25, take: 25, select: { id: true, name: true, email: true, status: true, mfaEnabledAt: true, emailVerifiedAt: true, lastLoginAt: true, createdAt: true, roles: { select: { role: true } } } }),
    db.user.count({ where }),
  ]);
  return { rows, total, page, pageSize: 25 };
}

/**
 * Grant or revoke a role. Privileged roles (ADMIN, SUPER_ADMIN, FINANCE_OFFICER,
 * SAFEGUARDING_OFFICER) can only be changed by a SUPER_ADMIN. Nobody can change their own
 * roles, and the last SUPER_ADMIN cannot be removed.
 */
export async function setRole(actor: Actor, userId: string, role: Role, grant: boolean) {
  const a = requirePermission(actor, "admin.users");
  if (PRIVILEGED_ROLES.includes(role)) requirePermission(a, "admin.privileged_roles");
  if (userId === a.userId) throw forbidden("You cannot change your own roles.");
  const user = await db.user.findUnique({ where: { id: userId }, include: { roles: true } });
  if (!user) throw notFound();
  await db.$transaction(async (tx) => {
    if (grant) {
      if (user.roles.some((r) => r.role === role)) return;
      await tx.userRole.create({ data: { userId, role, grantedById: a.userId } });
    } else {
      if (role === "SUPER_ADMIN") {
        const count = await tx.userRole.count({ where: { role: "SUPER_ADMIN", user: { status: "ACTIVE" } } });
        if (count <= 1) throw conflict("The last super administrator cannot be removed.");
      }
      await tx.userRole.deleteMany({ where: { userId, role } });
    }
    await audit({ actorId: a.userId, action: grant ? "role.grant" : "role.revoke", entityType: "User", entityId: userId, metadata: { role } }, tx);
  });
  await invalidateAllUserSessions(userId); // new permissions apply on next sign-in
}

export async function setUserStatus(actor: Actor, userId: string, status: "ACTIVE" | "SUSPENDED") {
  const a = requirePermission(actor, "admin.users");
  if (userId === a.userId) throw forbidden("You cannot change your own account status.");
  const target = await db.user.findUnique({ where: { id: userId }, include: { roles: true } });
  if (!target) throw notFound();
  if (target.roles.some((r) => PRIVILEGED_ROLES.includes(r.role))) requirePermission(a, "admin.privileged_roles");
  await db.user.update({ where: { id: userId }, data: { status } });
  if (status === "SUSPENDED") await invalidateAllUserSessions(userId);
  await audit({ actorId: a.userId, action: `user.${status.toLowerCase()}`, entityType: "User", entityId: userId });
}

export const auditFilters = z.object({
  action: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(60).optional(),
  entityId: z.string().trim().max(60).optional(),
  actorId: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export async function searchAudit(actor: Actor, raw: unknown) {
  const a = requirePermission(actor, "admin.audit");
  const f = auditFilters.parse(raw);
  const where: Prisma.AuditLogWhereInput = {};
  if (f.action) where.action = { startsWith: f.action };
  if (f.entityType) where.entityType = f.entityType;
  if (f.entityId) where.entityId = f.entityId;
  if (f.actorId) where.actorId = f.actorId;
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (f.page - 1) * 50, take: 50 }),
    db.auditLog.count({ where }),
  ]);
  await audit({ actorId: a.userId, action: "audit.search", entityType: "AuditLog", metadata: { filters: JSON.parse(JSON.stringify(f)) } });
  const actors = await db.user.findMany({ where: { id: { in: rows.map((r) => r.actorId).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  return { rows, total, page: f.page, pageSize: 50, names: Object.fromEntries(actors.map((u) => [u.id, u.name])) as Record<string, string> };
}

/** Staff access review: who holds which privileged role, last sign-in and MFA state. */
export async function accessReview(actor: Actor) {
  requirePermission(actor, "admin.audit");
  return db.user.findMany({
    where: { roles: { some: { role: { notIn: ["APPLICANT", "DONOR", "SPONSOR"] } } } },
    select: { id: true, name: true, email: true, status: true, lastLoginAt: true, mfaEnabledAt: true, roles: { select: { role: true, createdAt: true, grantedById: true } } },
    orderBy: { name: "asc" },
  });
}

export const categorySchema = z.object({
  name: z.string().trim().min(3).max(80),
  slug: z.string().trim().regex(/^[a-z0-9-]{3,60}$/, "Use lowercase letters, numbers and hyphens."),
  description: z.string().trim().min(10).max(500),
  checklist: z.string().max(4000).default(""),
  active: z.preprocess((v) => v === "on" || v === true, z.boolean()),
});

/** Checklist format: one item per line, "STAGE: label" (STAGE = SCREENING|REMOTE|FIELD|REVIEW). */
export function parseChecklist(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      const m = /^(SCREENING|REMOTE|FIELD|REVIEW)\s*:\s*(.{3,200})$/.exec(l);
      if (!m) throw invalid(`Checklist line ${i + 1} must look like "REMOTE: Confirm landlord quote".`);
      return { key: `cat_${i + 1}_${m[2]!.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30)}`, stage: m[1]!, label: m[2]! };
    });
}

export async function upsertCategory(actor: Actor, id: string | null, raw: unknown) {
  const a = requirePermission(actor, "admin.categories");
  const d = categorySchema.parse(raw);
  const data = { name: d.name, slug: d.slug, description: d.description, active: d.active, verificationChecklist: parseChecklist(d.checklist) };
  const c = id ? await db.caseCategory.update({ where: { id }, data }) : await db.caseCategory.create({ data });
  await audit({ actorId: a.userId, action: id ? "category.update" : "category.create", entityType: "CaseCategory", entityId: c.id });
  return c;
}

/**
 * Account deletion / anonymisation request (data-subject right). Personal identifiers are
 * removed, but records we are legally or financially required to keep (payments, ledger,
 * audit, safeguarding) are retained in pseudonymised form – see docs/data-protection.md.
 */
export async function deleteOwnAccount(actor: Actor) {
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId }, include: { roles: true } });
  if (user.roles.some((r) => !["APPLICANT", "DONOR", "SPONSOR"].includes(r.role))) {
    throw conflict("Staff accounts must be closed by an administrator.");
  }
  const active = await db.application.count({ where: { applicantId: user.id, status: { in: ["SUBMITTED", "INITIAL_REVIEW", "ADDITIONAL_INFORMATION_REQUIRED", "VERIFICATION_IN_PROGRESS", "FIELD_VISIT_REQUIRED", "PENDING_APPROVAL", "APPROVED"] } } });
  if (active) throw conflict("You have a request in progress. Withdraw it first or contact us so we can close it safely.");
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { email: `deleted+${user.id}@invalid.kindspring`, name: "Deleted user", phone: null, passwordHash: "!", mfaSecretEnc: null, mfaEnabledAt: null, status: "DELETED", deletedAt: new Date() },
    });
    await tx.application.updateMany({
      where: { applicantId: user.id, status: { in: ["DRAFT", "WITHDRAWN", "DECLINED"] } },
      data: { fullName: null, phone: null, community: null, whatHappened: null, assistanceNeeded: null, whyNow: null, successOutcome: null, safetyConcernDetails: null, referenceContacts: null, contactSafetyNotes: null, archivedAt: new Date() },
    });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await audit({ actorId: user.id, action: "user.self_delete", entityType: "User", entityId: user.id }, tx);
  });
}

/** Data access request: export of the personal data the platform holds about the user. */
export async function exportOwnData(actor: Actor) {
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { name: true, email: true, phone: true, createdAt: true, roles: { select: { role: true } } } });
  const [applications, payments, complaints] = await Promise.all([
    db.application.findMany({ where: { applicantId: actor.userId }, include: { budgetItems: true, consents: true, infoRequests: { select: { message: true, responseText: true, createdAt: true } } } }),
    db.payment.findMany({ where: { payerUserId: actor.userId }, select: { reference: true, amountMinor: true, currency: true, status: true, createdAt: true, isAnonymous: true } }),
    db.complaint.findMany({ where: { submittedById: actor.userId }, select: { reference: true, subject: true, status: true, createdAt: true } }),
  ]);
  await audit({ actorId: actor.userId, action: "user.data_export", entityType: "User", entityId: actor.userId });
  return JSON.parse(JSON.stringify({ exportedAt: new Date(), user, applications, payments, complaints }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}
