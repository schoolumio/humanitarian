import type { ConsentType, Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { audit, recordStatusChange } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { newApplicationReference } from "@/lib/ids";
import { sum } from "@/lib/money";
import { effectiveConsents, OPTIONAL_CONSENTS } from "@/lib/consent";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { APPLICATION_TRANSITIONS } from "@/lib/workflow/application";
import { assertTransition } from "@/lib/workflow/machine";
import { stepSchemas, submissionProblems } from "../validation/application";
import { notify, notifyRole } from "../notifications";
import { requirePermission, type Actor } from "../actor";
import { raiseRiskAlert } from "./risk";

const MAX_OPEN_DRAFTS = 3;

/** Load an application owned by the actor. Others' applications are indistinguishable from missing ones (IDOR). */
async function ownApplication(actor: Actor, reference: string, tx: Tx = db) {
  requirePermission(actor, "application.own");
  const app = await tx.application.findUnique({ where: { reference } });
  if (!app || app.applicantId !== actor.userId) throw notFound("Application not found.");
  return app;
}

export async function createDraft(actor: Actor) {
  requirePermission(actor, "application.own");
  const drafts = await db.application.count({ where: { applicantId: actor.userId, status: "DRAFT" } });
  if (drafts >= MAX_OPEN_DRAFTS) throw conflict("You already have unfinished requests. Please continue one of those.");
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const app = await db.application.create({ data: { reference: newApplicationReference(), applicantId: actor.userId } });
      await audit({ actorId: actor.userId, action: "application.create_draft", entityType: "Application", entityId: app.id });
      return app;
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e; // reference collision: retry
    }
  }
  throw new Error("Could not allocate a reference");
}

export async function listOwnApplications(actor: Actor) {
  requirePermission(actor, "application.own");
  return db.application.findMany({
    where: { applicantId: actor.userId, archivedAt: null },
    orderBy: { createdAt: "desc" },
    select: { reference: true, status: true, createdAt: true, submittedAt: true, category: { select: { name: true } }, draftStep: true },
  });
}

/** Applicant view: includes only what the applicant provided plus applicant-safe status data. */
export async function getOwnApplication(actor: Actor, reference: string) {
  const app = await ownApplication(actor, reference);
  const [items, consents, files, infoRequests, history, category, decision] = await Promise.all([
    db.applicationBudgetItem.findMany({ where: { applicationId: app.id }, orderBy: { sortOrder: "asc" } }),
    db.applicantConsent.findMany({ where: { applicationId: app.id }, orderBy: { createdAt: "asc" } }),
    db.storedFile.findMany({
      where: { applicationId: app.id, uploadedById: actor.userId, purpose: "APPLICATION_EVIDENCE", deletedAt: null },
      select: { id: true, originalName: true, sizeBytes: true, mimeType: true, createdAt: true, scanStatus: true },
    }),
    db.informationRequest.findMany({ where: { applicationId: app.id }, orderBy: { createdAt: "asc" } }),
    db.statusHistory.findMany({
      where: { entityType: "APPLICATION", entityId: app.id },
      orderBy: { createdAt: "asc" },
      select: { toStatus: true, createdAt: true },
    }),
    app.categoryId ? db.caseCategory.findUnique({ where: { id: app.categoryId } }) : null,
    db.caseDecision.findFirst({ where: { applicationId: app.id }, orderBy: { createdAt: "desc" }, select: { decision: true, reasonForApplicant: true, createdAt: true } }),
  ]);
  const campaign = await db.campaign.findUnique({ where: { applicationId: app.id }, select: { publicId: true, status: true, visibility: true } });
  return {
    app: { ...app, riskLevel: undefined, assignedCaseManagerId: undefined },
    items,
    consents: effectiveConsents(consents),
    files,
    infoRequests: infoRequests.map((r) => ({ id: r.id, message: r.message, responseText: r.responseText, respondedAt: r.respondedAt, createdAt: r.createdAt })),
    history,
    category,
    decision,
    campaign: campaign && ["DRAFT", "READY_FOR_PUBLICATION"].includes(campaign.status) ? null : campaign,
  };
}

export async function saveStep(actor: Actor, reference: string, step: number, raw: unknown) {
  const app = await ownApplication(actor, reference);
  if (app.status !== "DRAFT") throw conflict("This request has already been submitted and can no longer be edited.");
  const nextStep = Math.max(app.draftStep, Math.min(step + 1, 8));

  switch (step) {
    case 1: {
      const d = stepSchemas[1].parse(raw);
      await db.application.update({ where: { id: app.id }, data: { ...d, draftStep: nextStep } });
      break;
    }
    case 2: {
      const d = stepSchemas[2].parse(raw);
      const category = await db.caseCategory.findFirst({ where: { id: d.categoryId, active: true } });
      if (!category) throw invalid("Choose a valid type of assistance.");
      await db.application.update({ where: { id: app.id }, data: { categoryId: category.id, draftStep: nextStep } });
      break;
    }
    case 3: {
      const d = stepSchemas[3].parse(raw);
      await db.application.update({
        where: { id: app.id },
        data: { ...d, safetyConcernDetails: d.urgentSafetyConcern ? d.safetyConcernDetails : null, draftStep: nextStep },
      });
      break;
    }
    case 4: {
      const d = stepSchemas[4].parse(raw);
      const total = sum(d.items.map((i) => i.unitCost * BigInt(i.quantity)));
      await db.$transaction(async (tx) => {
        await tx.applicationBudgetItem.deleteMany({ where: { applicationId: app.id } });
        await tx.applicationBudgetItem.createMany({
          data: d.items.map((i, idx) => ({
            applicationId: app.id,
            description: i.description,
            quantity: i.quantity,
            unitCostMinor: i.unitCost,
            sourceNote: i.sourceNote,
            sortOrder: idx,
          })),
        });
        await tx.application.update({ where: { id: app.id }, data: { requestedAmountMinor: total, budgetNotes: d.budgetNotes, draftStep: nextStep } });
      });
      break;
    }
    case 5: {
      await db.application.update({ where: { id: app.id }, data: { draftStep: nextStep } });
      break;
    }
    case 6: {
      const d = stepSchemas[6].parse(raw);
      await db.application.update({ where: { id: app.id }, data: { ...d, draftStep: nextStep } });
      break;
    }
    default:
      throw invalid("Unknown step.");
  }
  return { nextStep };
}

/**
 * Record consent choices. Append-only: a new row is written only when the effective value
 * changes. Withdrawing a publication consent after approval triggers the media review flow.
 */
export async function saveConsents(actor: Actor, reference: string, choices: Partial<Record<ConsentType, boolean>>) {
  const app = await ownApplication(actor, reference);
  if (["WITHDRAWN", "CLOSED"].includes(app.status)) throw conflict("This request is closed.");
  const allowed: ConsentType[] = ["ASSESSMENT_DATA_PROCESSING", ...OPTIONAL_CONSENTS];
  const current = effectiveConsents(await db.applicantConsent.findMany({ where: { applicationId: app.id } }));
  const changes = Object.entries(choices).filter(
    ([type, granted]) => allowed.includes(type as ConsentType) && typeof granted === "boolean" && current.get(type as ConsentType) !== granted,
  ) as [ConsentType, boolean][];

  if (app.status !== "DRAFT" && changes.some(([t, g]) => t === "ASSESSMENT_DATA_PROCESSING" && !g)) {
    throw invalid("To stop us using your information for assessment, withdraw the request instead. Records we must keep are described in our privacy policy.");
  }
  // Granting new consents after submission is allowed; withdrawing is always allowed.
  await db.$transaction(async (tx) => {
    for (const [type, granted] of changes) {
      await tx.applicantConsent.create({ data: { applicationId: app.id, type, granted, recordedById: actor.userId, method: "ONLINE" } });
    }
    if (app.status === "DRAFT") await tx.application.update({ where: { id: app.id }, data: { draftStep: Math.max(app.draftStep, 8) } });
    if (changes.length) {
      await audit({ actorId: actor.userId, action: "consent.update", entityType: "Application", entityId: app.id, metadata: { changes: changes.map(([t, g]) => `${t}:${g}`) } }, tx);
    }
  });
  const withdrawn = changes.filter(([, g]) => !g).map(([t]) => t);
  if (withdrawn.length && app.status !== "DRAFT") {
    const { handleConsentWithdrawal } = await import("./media");
    await handleConsentWithdrawal(app.id, withdrawn, actor.userId);
  }
  return { changed: changes.length };
}

/**
 * Submit a draft. Idempotent: the conditional update (status = DRAFT) means a double
 * click or a retried request can only submit once; later calls return the same result.
 */
export async function submitApplication(actor: Actor, reference: string) {
  const app = await ownApplication(actor, reference);
  if (app.status !== "DRAFT") return { reference: app.reference, alreadySubmitted: true };
  await enforceRateLimit(`submit:${actor.userId}`, 5, 3600);

  const [itemCount, consents] = await Promise.all([
    db.applicationBudgetItem.count({ where: { applicationId: app.id } }),
    db.applicantConsent.findMany({ where: { applicationId: app.id } }),
  ]);
  const problems = submissionProblems({ ...app, budgetItemCount: itemCount, assessmentConsent: effectiveConsents(consents).get("ASSESSMENT_DATA_PROCESSING") === true });
  if (problems.length) throw invalid(problems.map((p) => p.message).join(" "));
  assertTransition("Application", APPLICATION_TRANSITIONS, "DRAFT", "SUBMITTED");

  await db.$transaction(async (tx) => {
    const updated = await tx.application.updateMany({
      where: { id: app.id, status: "DRAFT" },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
    if (updated.count === 0) return; // concurrent submit won
    await recordStatusChange(tx, { entityType: "APPLICATION", entityId: app.id, from: "DRAFT", to: "SUBMITTED", actorId: actor.userId });
    await audit({ actorId: actor.userId, action: "application.submit", entityType: "Application", entityId: app.id }, tx);
    await seedVerificationTasks(tx, app.id, app.categoryId!);
    await notify(tx, {
      userId: actor.userId,
      to: actor.email,
      template: "application_submitted",
      params: { name: app.fullName?.split(" ")[0] ?? actor.name, reference: app.reference },
      dedupeKey: `app-submitted:${app.id}`,
    });
    if (app.urgentSafetyConcern) {
      await tx.application.update({ where: { id: app.id }, data: { riskLevel: "HIGH" } });
      await raiseRiskAlert(tx, {
        type: "URGENT_SAFETY_CONCERN",
        severity: "CRITICAL",
        details: `Applicant ${app.reference} reported an urgent safety concern. Follow the urgent safety procedure (docs/incident-response.md).`,
        applicationId: app.id,
        dedupeKey: `urgent-safety:${app.id}`,
      });
      await notifyRole(tx, "SAFEGUARDING_OFFICER", {
        title: "Urgent safety concern reported",
        body: `Application ${app.reference} reports an urgent safety concern and needs same-day review.`,
        path: `/staff/applications/${app.id}`,
        dedupeKey: `urgent-safety:${app.id}`,
      });
    }
    await detectDuplicates(tx, app);
  });
  return { reference: app.reference, alreadySubmitted: false };
}

async function seedVerificationTasks(tx: Tx, applicationId: string, categoryId: string) {
  const category = await tx.caseCategory.findUniqueOrThrow({ where: { id: categoryId } });
  const base = [
    { key: "screen_complete", label: "Application is complete and within scope", stage: "SCREENING" },
    { key: "screen_duplicates", label: "Checked for duplicate or related applications", stage: "SCREENING" },
    { key: "screen_urgency", label: "Urgency and safety assessed", stage: "SCREENING" },
    { key: "remote_contact", label: "Applicant contacted using a safe method they chose", stage: "REMOTE" },
    { key: "remote_evidence", label: "Supporting evidence reviewed (or alternative verification recorded)", stage: "REMOTE" },
    { key: "remote_costs", label: "Requested costs checked against local prices", stage: "REMOTE" },
  ];
  const fromCategory = (category.verificationChecklist as { key: string; label: string; stage: string }[]) ?? [];
  const all = [...base, ...fromCategory];
  await tx.verificationTask.createMany({
    data: all.map((t) => ({
      applicationId,
      key: t.key,
      label: t.label,
      stage: (["SCREENING", "REMOTE", "FIELD", "REVIEW"].includes(t.stage) ? t.stage : "REMOTE") as Prisma.VerificationTaskCreateManyInput["stage"],
    })),
    skipDuplicates: true,
  });
}

/**
 * Duplicate detection: same phone number, or same name in the same LGA, within the last
 * 12 months. Raises an alert for human review – it never blocks or rejects a request.
 */
async function detectDuplicates(tx: Tx, app: { id: string; phone: string | null; fullName: string | null; lga: string | null; reference: string }) {
  const since = new Date(Date.now() - 365 * 864e5);
  const OR: Prisma.ApplicationWhereInput[] = [];
  if (app.phone) OR.push({ phone: app.phone });
  if (app.fullName && app.lga) OR.push({ fullName: { equals: app.fullName, mode: "insensitive" }, lga: { equals: app.lga, mode: "insensitive" } });
  if (!OR.length) return;
  const matches = await tx.application.findMany({
    where: { id: { not: app.id }, status: { not: "DRAFT" }, submittedAt: { gte: since }, OR },
    select: { reference: true },
    take: 5,
  });
  if (matches.length) {
    await raiseRiskAlert(tx, {
      type: "POSSIBLE_DUPLICATE_APPLICATION",
      severity: "MEDIUM",
      details: `${app.reference} shares a phone number or name/LGA with: ${matches.map((m) => m.reference).join(", ")}. Review before verification; this may be legitimate (e.g. a shared family phone).`,
      applicationId: app.id,
      dedupeKey: `dup:${app.id}`,
    });
  }
}

export async function withdrawApplication(actor: Actor, reference: string, reason: string) {
  const app = await ownApplication(actor, reference);
  const actors = APPLICATION_TRANSITIONS[app.status]?.WITHDRAWN;
  if (!actors?.includes("OWNER")) throw conflict("This request can no longer be withdrawn online. Please contact us.");
  await db.$transaction(async (tx) => {
    const res = await tx.application.updateMany({ where: { id: app.id, status: app.status }, data: { status: "WITHDRAWN" } });
    if (!res.count) throw conflict("The request changed while you were withdrawing it. Please reload.");
    await recordStatusChange(tx, { entityType: "APPLICATION", entityId: app.id, from: app.status, to: "WITHDRAWN", actorId: actor.userId, reason: reason.slice(0, 500) || "Withdrawn by applicant" });
    await audit({ actorId: actor.userId, action: "application.withdraw", entityType: "Application", entityId: app.id }, tx);
  });
}

export async function respondToInformationRequest(actor: Actor, reference: string, requestId: string, response: string) {
  const app = await ownApplication(actor, reference);
  const text = response.trim();
  if (text.length < 2 || text.length > 4000) throw invalid("Please enter a response (up to 4000 characters).");
  const req = await db.informationRequest.findFirst({ where: { id: requestId, applicationId: app.id } });
  if (!req) throw notFound();
  if (req.respondedAt) throw conflict("You have already responded to this request.");
  await db.$transaction(async (tx) => {
    await tx.informationRequest.update({ where: { id: req.id }, data: { responseText: text, respondedAt: new Date() } });
    const open = await tx.informationRequest.count({ where: { applicationId: app.id, respondedAt: null } });
    if (open === 0 && app.status === "ADDITIONAL_INFORMATION_REQUIRED") {
      await tx.application.update({ where: { id: app.id }, data: { status: "INITIAL_REVIEW" } });
      await recordStatusChange(tx, { entityType: "APPLICATION", entityId: app.id, from: app.status, to: "INITIAL_REVIEW", actorId: actor.userId, reason: "Applicant provided requested information" });
    }
    await audit({ actorId: actor.userId, action: "application.info_response", entityType: "Application", entityId: app.id }, tx);
  });
}

/** Used by upload route: may the actor attach evidence to this application? */
export async function assertCanAttachEvidence(actor: Actor, applicationId: string) {
  const app = await db.application.findUnique({ where: { id: applicationId } });
  if (!app) throw notFound();
  if (app.applicantId === actor.userId) {
    if (!["DRAFT", "ADDITIONAL_INFORMATION_REQUIRED", "SUBMITTED", "INITIAL_REVIEW", "VERIFICATION_IN_PROGRESS"].includes(app.status)) {
      throw conflict("Evidence can no longer be added to this request.");
    }
    return { app, purpose: "APPLICATION_EVIDENCE" as const };
  }
  throw forbidden();
}
