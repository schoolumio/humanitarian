import type { ApplicationStatus, Prisma, Recommendation } from "@prisma/client";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { audit, recordStatusChange } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { parseMajorToMinor } from "@/lib/money";
import { APPLICATION_TRANSITIONS, OPEN_REVIEW_STATUSES } from "@/lib/workflow/application";
import { canTransition, InvalidTransitionError } from "@/lib/workflow/machine";
import { notify } from "../notifications";
import { requireActor, requireAnyPermission, requirePermission, type Actor } from "../actor";

/**
 * Staff case access.
 * - CASE_MANAGER / SAFEGUARDING_OFFICER (application.view_all) see every submitted case.
 * - INVESTIGATOR (application.view_assigned) sees only cases with an active assignment.
 * - Nobody may act on an application they submitted themselves.
 * Every staff view of a case is audited.
 */
async function caseAccess(actor: Actor, applicationId: string, tx: Tx = db) {
  requireAnyPermission(actor, ["application.view_all", "application.view_assigned"]);
  const app = await tx.application.findUnique({ where: { id: applicationId } });
  if (!app || app.status === "DRAFT") throw notFound("Case not found.");
  if (app.applicantId === actor.userId) throw forbidden("You cannot work on a request you submitted yourself.");
  if (actor.permissions.has("application.view_all")) return { app, assigned: await isAssigned(tx, actor.userId, app.id) };
  if (await isAssigned(tx, actor.userId, app.id)) return { app, assigned: true };
  throw notFound("Case not found.");
}

const isAssigned = async (tx: Tx, userId: string, applicationId: string) =>
  !!(await tx.investigatorAssignment.findFirst({ where: { applicationId, investigatorId: userId, active: true } }));

export const caseListFilters = z.object({
  status: z.string().optional(),
  q: z.string().trim().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export async function listCases(actor: Actor, raw: unknown) {
  requireAnyPermission(actor, ["application.view_all", "application.view_assigned"]);
  const f = caseListFilters.parse(raw);
  const pageSize = 20;
  const where: Prisma.ApplicationWhereInput = { status: { not: "DRAFT" }, applicantId: { not: actor.userId } };
  if (f.status && (Object.keys(APPLICATION_TRANSITIONS) as string[]).includes(f.status)) where.status = f.status as ApplicationStatus;
  else if (f.status === "OPEN") where.status = { in: [...OPEN_REVIEW_STATUSES] };
  if (f.q) where.reference = { contains: f.q.toUpperCase() };
  if (!actor.permissions.has("application.view_all")) {
    where.assignments = { some: { investigatorId: actor.userId, active: true } };
  }
  const [rows, total] = await Promise.all([
    db.application.findMany({
      where,
      orderBy: [{ riskLevel: "desc" }, { submittedAt: "asc" }],
      skip: (f.page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, reference: true, status: true, submittedAt: true, riskLevel: true, urgentSafetyConcern: true,
        requestedAmountMinor: true, state: true, category: { select: { name: true } },
        assignments: { where: { active: true }, select: { investigator: { select: { name: true } }, priority: true } },
      },
    }),
    db.application.count({ where }),
  ]);
  return { rows, total, page: f.page, pageSize };
}

/** Investigator dashboard: assigned cases with follow-ups and open tasks. */
export async function myAssignments(actor: Actor) {
  requirePermission(actor, "investigation.record");
  return db.investigatorAssignment.findMany({
    where: { investigatorId: actor.userId, active: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    include: {
      application: {
        select: {
          id: true, reference: true, status: true, riskLevel: true, state: true, lga: true, contactMethods: true, urgentSafetyConcern: true,
          category: { select: { name: true } },
          tasks: { where: { status: "OPEN" }, select: { id: true } },
          fieldVisits: { where: { status: { in: ["REQUESTED", "SCHEDULED"] } }, select: { id: true, status: true, scheduledFor: true } },
        },
      },
    },
  });
}

export async function getCaseForStaff(actor: Actor, applicationId: string) {
  const { app, assigned } = await caseAccess(actor, applicationId);
  const seeRestricted = actor.permissions.has("investigation.view_restricted_notes");
  const [items, consents, files, tasks, assignments, visits, notes, reports, reviews, decisions, infoRequests, history, alerts, campaign, category, safeguarding] =
    await Promise.all([
      db.applicationBudgetItem.findMany({ where: { applicationId }, orderBy: { sortOrder: "asc" } }),
      db.applicantConsent.findMany({ where: { applicationId }, orderBy: { createdAt: "asc" } }),
      db.storedFile.findMany({ where: { applicationId, deletedAt: null }, orderBy: { createdAt: "asc" } }),
      db.verificationTask.findMany({ where: { applicationId }, orderBy: [{ stage: "asc" }, { createdAt: "asc" }] }),
      db.investigatorAssignment.findMany({ where: { applicationId }, include: { investigator: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } }),
      db.fieldVisit.findMany({ where: { applicationId }, orderBy: { createdAt: "desc" } }),
      db.investigationNote.findMany({ where: { applicationId, ...(seeRestricted ? {} : { restricted: false }) }, orderBy: { createdAt: "desc" } }),
      db.investigationReport.findMany({ where: { applicationId }, orderBy: { createdAt: "desc" } }),
      db.caseReview.findMany({ where: { applicationId }, orderBy: { createdAt: "desc" } }),
      db.caseDecision.findMany({ where: { applicationId }, orderBy: { createdAt: "desc" } }),
      db.informationRequest.findMany({ where: { applicationId }, orderBy: { createdAt: "desc" } }),
      db.statusHistory.findMany({ where: { entityType: "APPLICATION", entityId: applicationId }, orderBy: { createdAt: "desc" } }),
      db.riskAlert.findMany({ where: { applicationId, ...(actor.permissions.has("safeguarding.manage") ? {} : { type: { not: "URGENT_SAFETY_CONCERN" } }) }, orderBy: { createdAt: "desc" } }),
      db.campaign.findUnique({ where: { applicationId } }),
      app.categoryId ? db.caseCategory.findUnique({ where: { id: app.categoryId } }) : null,
      actor.permissions.has("safeguarding.manage") ? db.safeguardingRecord.findMany({ where: { applicationId } }) : Promise.resolve([]),
    ]);
  const staffIds = new Set<string>([
    ...notes.map((n) => n.authorId), ...reports.map((r) => r.investigatorId), ...reviews.map((r) => r.reviewerId),
    ...decisions.map((d) => d.decidedById), ...history.map((h) => h.actorId).filter((x): x is string => !!x),
    ...tasks.map((t) => t.completedById).filter((x): x is string => !!x),
  ]);
  const people = await db.user.findMany({ where: { id: { in: [...staffIds] } }, select: { id: true, name: true } });
  await audit({ actorId: actor.userId, action: "application.view", entityType: "Application", entityId: applicationId });
  return {
    app, assigned, items, consents, files, tasks, assignments, visits, notes, reports, reviews, decisions, infoRequests,
    history, alerts, campaign, category, safeguarding,
    names: Object.fromEntries(people.map((p) => [p.id, p.name])) as Record<string, string>,
  };
}

/** Generic status transition with permission + assignment checks, optimistic concurrency and history. */
export async function transitionCase(actor: Actor, applicationId: string, to: ApplicationStatus, reason: string) {
  const a = requireActor(actor);
  if (to === "APPROVED" || to === "DECLINED") throw invalid("Use the decision form to approve or decline.");
  if (reason.trim().length < 3) throw invalid("Give a short reason for this change.");
  return db.$transaction(async (tx) => {
    const { app, assigned } = await caseAccess(a, applicationId, tx);
    // Investigators may only move cases assigned to them.
    const effectivePerms = new Set(a.permissions);
    if (!assigned && !a.permissions.has("application.triage")) effectivePerms.delete("investigation.record");
    if (!canTransition(APPLICATION_TRANSITIONS, app.status, to, { permissions: effectivePerms })) {
      if (!APPLICATION_TRANSITIONS[app.status]?.[to]) throw new InvalidTransitionError("Application", app.status, to);
      throw forbidden();
    }
    if (app.status === "APPROVED" && to === "VERIFICATION_IN_PROGRESS") {
      const campaign = await tx.campaign.findUnique({ where: { applicationId } });
      if (campaign && !["DRAFT", "READY_FOR_PUBLICATION", "CANCELLED"].includes(campaign.status)) {
        throw conflict("This case has a live campaign. Cancel the campaign (following the refund policy) before reopening verification.");
      }
    }
    const res = await tx.application.updateMany({ where: { id: app.id, status: app.status }, data: { status: to } });
    if (!res.count) throw conflict("This case was changed by someone else. Reload and try again.");
    await recordStatusChange(tx, { entityType: "APPLICATION", entityId: app.id, from: app.status, to, actorId: a.userId, reason: reason.trim() });
    await audit({ actorId: a.userId, action: "application.transition", entityType: "Application", entityId: app.id, metadata: { from: app.status, to } }, tx);
    if (["VERIFICATION_IN_PROGRESS", "FIELD_VISIT_REQUIRED", "PENDING_APPROVAL", "CLOSED"].includes(to)) {
      const applicant = await tx.user.findUniqueOrThrow({ where: { id: app.applicantId } });
      await notify(tx, {
        userId: applicant.id, to: applicant.email, template: "application_status_changed",
        params: { name: applicant.name, reference: app.reference },
        dedupeKey: `app-status:${app.id}:${to}:${Date.now()}`,
      });
    }
    return to;
  });
}

export async function requestInformation(actor: Actor, applicationId: string, message: string) {
  const a = requireAnyPermission(actor, ["application.triage", "investigation.record"]);
  const text = message.trim();
  if (text.length < 10) throw invalid("Explain clearly what information is needed.");
  await db.$transaction(async (tx) => {
    const { app, assigned } = await caseAccess(a, applicationId, tx);
    if (!a.permissions.has("application.triage") && !assigned) throw forbidden();
    const allowed = APPLICATION_TRANSITIONS[app.status]?.ADDITIONAL_INFORMATION_REQUIRED;
    if (!allowed && app.status !== "ADDITIONAL_INFORMATION_REQUIRED") throw conflict(`Information cannot be requested while the case is ${app.status}.`);
    await tx.informationRequest.create({ data: { applicationId, requestedById: a.userId, message: text } });
    if (app.status !== "ADDITIONAL_INFORMATION_REQUIRED") {
      await tx.application.update({ where: { id: app.id }, data: { status: "ADDITIONAL_INFORMATION_REQUIRED" } });
      await recordStatusChange(tx, { entityType: "APPLICATION", entityId: app.id, from: app.status, to: "ADDITIONAL_INFORMATION_REQUIRED", actorId: a.userId, reason: "Information requested" });
    }
    const applicant = await tx.user.findUniqueOrThrow({ where: { id: app.applicantId } });
    await notify(tx, {
      userId: applicant.id, to: applicant.email, template: "information_requested",
      params: { name: applicant.name, reference: app.reference }, dedupeKey: `info-req:${app.id}:${Date.now()}`,
    });
    await audit({ actorId: a.userId, action: "application.request_information", entityType: "Application", entityId: app.id }, tx);
  });
}

export async function assignInvestigator(actor: Actor, applicationId: string, investigatorId: string, priority: number, followUpAt?: Date | null) {
  const a = requirePermission(actor, "investigation.assign");
  await db.$transaction(async (tx) => {
    const { app } = await caseAccess(a, applicationId, tx);
    if (["DECLINED", "WITHDRAWN", "CLOSED"].includes(app.status)) throw conflict("This case is closed.");
    const inv = await tx.user.findFirst({ where: { id: investigatorId, status: "ACTIVE", roles: { some: { role: "INVESTIGATOR" } } } });
    if (!inv) throw invalid("Choose an active investigator.");
    if (inv.id === app.applicantId) throw invalid("An applicant cannot investigate their own request.");
    const existing = await tx.investigatorAssignment.findFirst({ where: { applicationId, investigatorId, active: true } });
    if (existing) throw conflict("This investigator is already assigned.");
    await tx.investigatorAssignment.create({
      data: { applicationId, investigatorId, assignedById: a.userId, priority: Math.min(3, Math.max(1, priority)), followUpAt: followUpAt ?? null },
    });
    await audit({ actorId: a.userId, action: "investigation.assign", entityType: "Application", entityId: applicationId, metadata: { investigatorId } }, tx);
    await notify(tx, {
      userId: inv.id, to: inv.email, template: "staff_alert",
      params: { title: "New case assigned", body: `Case ${app.reference} has been assigned to you.`, path: `/staff/applications/${app.id}` },
      dedupeKey: `assign:${applicationId}:${investigatorId}:${Date.now()}`,
    });
  });
}

export async function endAssignment(actor: Actor, assignmentId: string, reason: string) {
  const a = requirePermission(actor, "investigation.assign");
  const asg = await db.investigatorAssignment.findUnique({ where: { id: assignmentId } });
  if (!asg) throw notFound();
  await caseAccess(a, asg.applicationId);
  await db.$transaction(async (tx) => {
    await tx.investigatorAssignment.update({ where: { id: assignmentId }, data: { active: false, endedAt: new Date() } });
    await audit({ actorId: a.userId, action: "investigation.unassign", entityType: "Application", entityId: asg.applicationId, metadata: { reason } }, tx);
  });
}

/** Investigator confirms they have no conflict of interest (or declares one, which ends the assignment). */
export async function declareConflict(actor: Actor, assignmentId: string, hasConflict: boolean, details: string) {
  const a = requirePermission(actor, "investigation.record");
  const asg = await db.investigatorAssignment.findUnique({ where: { id: assignmentId } });
  if (!asg || asg.investigatorId !== a.userId || !asg.active) throw notFound();
  await db.$transaction(async (tx) => {
    if (hasConflict) {
      await tx.investigatorAssignment.update({ where: { id: assignmentId }, data: { active: false, endedAt: new Date() } });
      await tx.investigationNote.create({ data: { applicationId: asg.applicationId, authorId: a.userId, restricted: true, body: `Conflict of interest declared: ${details.slice(0, 1000)}` } });
    } else {
      await tx.investigatorAssignment.update({ where: { id: assignmentId }, data: { noConflictDeclared: true } });
    }
    await audit({ actorId: a.userId, action: hasConflict ? "investigation.conflict_declared" : "investigation.no_conflict", entityType: "Application", entityId: asg.applicationId }, tx);
  });
}

async function requireWorkAccess(a: Actor, applicationId: string, tx: Tx) {
  const ctx = await caseAccess(a, applicationId, tx);
  if (!a.permissions.has("application.triage") && !ctx.assigned) throw forbidden();
  if (!a.permissions.has("application.triage")) {
    const asg = await tx.investigatorAssignment.findFirst({ where: { applicationId, investigatorId: a.userId, active: true } });
    if (asg && !asg.noConflictDeclared) throw forbidden("Confirm you have no conflict of interest before working on this case.");
  }
  if (["DECLINED", "WITHDRAWN", "CLOSED"].includes(ctx.app.status)) throw conflict("This case is closed.");
  return ctx;
}

export async function updateTask(actor: Actor, applicationId: string, taskId: string, status: "OPEN" | "DONE" | "NOT_APPLICABLE", note: string) {
  const a = requireAnyPermission(actor, ["application.triage", "investigation.record"]);
  await db.$transaction(async (tx) => {
    await requireWorkAccess(a, applicationId, tx);
    const task = await tx.verificationTask.findFirst({ where: { id: taskId, applicationId } });
    if (!task) throw notFound();
    if (status === "NOT_APPLICABLE" && note.trim().length < 5) throw invalid("Explain why this check is not applicable.");
    await tx.verificationTask.update({
      where: { id: taskId },
      data: { status, outcomeNote: note.trim() || null, completedById: status === "OPEN" ? null : a.userId, completedAt: status === "OPEN" ? null : new Date() },
    });
    await audit({ actorId: a.userId, action: "verification.task_update", entityType: "Application", entityId: applicationId, metadata: { taskKey: task.key, status } }, tx);
  });
}

export async function addNote(actor: Actor, applicationId: string, body: string, restricted: boolean) {
  const a = requireAnyPermission(actor, ["application.triage", "investigation.record"]);
  const text = body.trim();
  if (text.length < 2 || text.length > 8000) throw invalid("Enter a note (up to 8000 characters).");
  await db.$transaction(async (tx) => {
    await requireWorkAccess(a, applicationId, tx);
    await tx.investigationNote.create({ data: { applicationId, authorId: a.userId, body: text, restricted } });
    await audit({ actorId: a.userId, action: "investigation.note", entityType: "Application", entityId: applicationId, metadata: { restricted } }, tx);
  });
}

export async function requestFieldVisit(actor: Actor, applicationId: string, reason: string, estimatedCost: string) {
  const a = requireAnyPermission(actor, ["application.triage", "investigation.record"]);
  const est = estimatedCost ? parseMajorToMinor(estimatedCost) : null;
  if (estimatedCost && est === null) throw invalid("Enter the estimated cost in naira.");
  if (reason.trim().length < 10) throw invalid("Explain why a field visit is justified (risk level or evidence gaps).");
  await db.$transaction(async (tx) => {
    const { app } = await requireWorkAccess(a, applicationId, tx);
    await tx.fieldVisit.create({ data: { applicationId, requestedById: a.userId, reason: reason.trim(), estimatedCostMinor: est } });
    if (app.status === "VERIFICATION_IN_PROGRESS") {
      await tx.application.update({ where: { id: app.id }, data: { status: "FIELD_VISIT_REQUIRED" } });
      await recordStatusChange(tx, { entityType: "APPLICATION", entityId: app.id, from: app.status, to: "FIELD_VISIT_REQUIRED", actorId: a.userId, reason: "Field visit requested" });
    }
    await audit({ actorId: a.userId, action: "field_visit.request", entityType: "Application", entityId: applicationId }, tx);
  });
}

export async function updateFieldVisit(
  actor: Actor,
  visitId: string,
  input: { status: "SCHEDULED" | "COMPLETED" | "CANCELLED"; scheduledFor?: Date | null; actualCost?: string; notes?: string; investigatorId?: string },
) {
  const a = requireAnyPermission(actor, ["application.triage", "investigation.record"]);
  const visit = await db.fieldVisit.findUnique({ where: { id: visitId } });
  if (!visit) throw notFound();
  const actual = input.actualCost ? parseMajorToMinor(input.actualCost) : null;
  if (input.actualCost && actual === null) throw invalid("Enter the actual cost in naira.");
  if (input.status === "COMPLETED" && !input.notes?.trim()) throw invalid("Summarise the visit.");
  await db.$transaction(async (tx) => {
    await requireWorkAccess(a, visit.applicationId, tx);
    await tx.fieldVisit.update({
      where: { id: visitId },
      data: {
        status: input.status,
        scheduledFor: input.scheduledFor ?? visit.scheduledFor,
        investigatorId: input.investigatorId ?? visit.investigatorId ?? a.userId,
        completedAt: input.status === "COMPLETED" ? new Date() : null,
        actualCostMinor: actual ?? visit.actualCostMinor,
        notes: input.notes?.trim() || visit.notes,
      },
    });
    await audit({ actorId: a.userId, action: "field_visit.update", entityType: "Application", entityId: visit.applicationId, metadata: { status: input.status } }, tx);
  });
}

export const reportSchema = z.object({
  summary: z.string().trim().min(10, "Summarise the investigation.").max(4000),
  findings: z.string().trim().min(10, "Record the findings.").max(8000),
  evidenceGaps: z.string().trim().max(4000).optional().transform((v) => v || null),
  recommendation: z.enum(["APPROVE", "DECLINE", "FURTHER_INVESTIGATION"]),
});

export async function submitInvestigationReport(actor: Actor, applicationId: string, raw: unknown) {
  const a = requirePermission(actor, "investigation.record");
  const data = reportSchema.parse(raw);
  await db.$transaction(async (tx) => {
    await requireWorkAccess(a, applicationId, tx);
    await tx.investigationReport.create({ data: { applicationId, investigatorId: a.userId, ...data } });
    await audit({ actorId: a.userId, action: "investigation.report", entityType: "Application", entityId: applicationId, metadata: { recommendation: data.recommendation } }, tx);
  });
}

/**
 * Stage 4 – independent review. The reviewer must not have authored an investigation
 * report on the case (independence), and must hold case.review.
 */
export async function submitReview(actor: Actor, applicationId: string, recommendation: Recommendation, comments: string) {
  const a = requirePermission(actor, "case.review");
  if (comments.trim().length < 10) throw invalid("Explain your recommendation.");
  await db.$transaction(async (tx) => {
    const { app } = await caseAccess(a, applicationId, tx);
    if (!["VERIFICATION_IN_PROGRESS", "FIELD_VISIT_REQUIRED", "PENDING_APPROVAL", "INITIAL_REVIEW"].includes(app.status)) {
      throw conflict("This case is not at a stage that can be reviewed.");
    }
    const authored = await tx.investigationReport.count({ where: { applicationId, investigatorId: a.userId } });
    if (authored) throw forbidden("You investigated this case, so you cannot be its independent reviewer.");
    await tx.caseReview.create({ data: { applicationId, reviewerId: a.userId, recommendation, comments: comments.trim() } });
    await audit({ actorId: a.userId, action: "case.review", entityType: "Application", entityId: applicationId, metadata: { recommendation } }, tx);
  });
}

export const decisionSchema = z
  .object({
    decision: z.enum(["APPROVED", "DECLINED"]),
    reasonInternal: z.string().trim().min(10, "Record the reasons for the decision.").max(4000),
    reasonForApplicant: z.string().trim().max(2000).optional().transform((v) => v || null),
    approvedAmount: z.string().optional(),
  })
  .refine((d) => d.decision !== "DECLINED" || !!d.reasonForApplicant, {
    path: ["reasonForApplicant"],
    message: "Give the applicant a clear explanation (omit details restricted for safeguarding or fraud-prevention reasons).",
  });

/** Pure: what prevents an approval (unit tested). */
export function approvalBlockers(input: {
  status: ApplicationStatus;
  deciderId: string;
  applicantId: string;
  reviews: { reviewerId: string; recommendation: Recommendation }[];
  reportAuthorIds: string[];
  openScreeningOrRemoteTasks: number;
}): string[] {
  const b: string[] = [];
  if (input.status !== "PENDING_APPROVAL") b.push("The case must be in Pending approval.");
  if (input.deciderId === input.applicantId) b.push("You cannot decide on your own request.");
  if (input.reportAuthorIds.includes(input.deciderId)) b.push("The investigator of this case cannot make the final decision.");
  const independent = input.reviews.filter((r) => r.reviewerId !== input.deciderId && r.recommendation === "APPROVE");
  if (!independent.length) b.push("An independent reviewer (not the decision maker) must recommend approval first.");
  if (input.openScreeningOrRemoteTasks > 0) b.push("Screening and remote verification checks must be completed or marked not applicable.");
  return b;
}

/** Stage 5 – final decision by an authorised case manager. Never automated. */
export async function decideCase(actor: Actor, applicationId: string, raw: unknown) {
  const a = requirePermission(actor, "case.decide");
  const d = decisionSchema.parse(raw);
  const approvedAmountMinor = d.approvedAmount ? parseMajorToMinor(d.approvedAmount) : null;
  if (d.decision === "APPROVED" && (!approvedAmountMinor || approvedAmountMinor <= 0n)) throw invalid("Enter the approved amount.");

  await db.$transaction(async (tx) => {
    const { app } = await caseAccess(a, applicationId, tx);
    if (d.decision === "APPROVED") {
      const [reviews, reports, openTasks] = await Promise.all([
        tx.caseReview.findMany({ where: { applicationId } }),
        tx.investigationReport.findMany({ where: { applicationId }, select: { investigatorId: true } }),
        tx.verificationTask.count({ where: { applicationId, status: "OPEN", stage: { in: ["SCREENING", "REMOTE"] } } }),
      ]);
      const blockers = approvalBlockers({
        status: app.status, deciderId: a.userId, applicantId: app.applicantId, reviews,
        reportAuthorIds: reports.map((r) => r.investigatorId), openScreeningOrRemoteTasks: openTasks,
      });
      if (blockers.length) throw conflict(blockers.join(" "));
    } else {
      if (!APPLICATION_TRANSITIONS[app.status]?.DECLINED) throw conflict(`A case in ${app.status} cannot be declined.`);
    }
    const res = await tx.application.updateMany({
      where: { id: app.id, status: app.status },
      data: { status: d.decision, decidedAt: new Date(), declineReasonForApplicant: d.decision === "DECLINED" ? d.reasonForApplicant : null },
    });
    if (!res.count) throw conflict("This case was changed by someone else. Reload and try again.");
    await tx.caseDecision.create({
      data: { applicationId, decidedById: a.userId, decision: d.decision, reasonInternal: d.reasonInternal, reasonForApplicant: d.reasonForApplicant, approvedAmountMinor },
    });
    await recordStatusChange(tx, { entityType: "APPLICATION", entityId: app.id, from: app.status, to: d.decision, actorId: a.userId, reason: d.reasonInternal });
    await audit({ actorId: a.userId, action: "case.decide", entityType: "Application", entityId: app.id, metadata: { decision: d.decision } }, tx);
    const applicant = await tx.user.findUniqueOrThrow({ where: { id: app.applicantId } });
    await notify(tx, {
      userId: applicant.id, to: applicant.email, template: "application_decided",
      params: { name: applicant.name, reference: app.reference }, dedupeKey: `decision:${app.id}:${d.decision}:${Date.now()}`,
    });
  });
}

/** Reopen a declined case when justified (e.g. new evidence). Reason is mandatory and audited. */
export async function reopenCase(actor: Actor, applicationId: string, reason: string) {
  const a = requirePermission(actor, "case.decide");
  if (reason.trim().length < 10) throw invalid("Explain why this case is being reopened.");
  const app = await db.application.findUnique({ where: { id: applicationId } });
  if (!app) throw notFound();
  const target: ApplicationStatus = app.status === "DECLINED" ? "INITIAL_REVIEW" : "VERIFICATION_IN_PROGRESS";
  return transitionCase(a, applicationId, target, `Reopened: ${reason.trim()}`);
}

/** Staff record a consent given verbally or on paper (e.g. applicant without internet). */
export async function recordConsentOnBehalf(actor: Actor, applicationId: string, type: Prisma.ApplicantConsentCreateInput["type"], granted: boolean, method: "VERBAL_RECORDED_BY_STAFF" | "WRITTEN_FORM", notes: string) {
  const a = requirePermission(actor, "consent.record_on_behalf");
  if (notes.trim().length < 5) throw invalid("Record how and when consent was given.");
  await db.$transaction(async (tx) => {
    await caseAccess(a, applicationId, tx);
    await tx.applicantConsent.create({ data: { applicationId, type, granted, method, notes: notes.trim(), recordedById: a.userId } });
    await audit({ actorId: a.userId, action: "consent.record_on_behalf", entityType: "Application", entityId: applicationId, metadata: { type, granted, method } }, tx);
  });
  if (!granted) {
    const { handleConsentWithdrawal } = await import("./media");
    await handleConsentWithdrawal(applicationId, [type], a.userId);
  }
}

export async function listInvestigators() {
  return db.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: "INVESTIGATOR" } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
