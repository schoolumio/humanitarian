import type { InterventionStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { audit, recordStatusChange } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { formatMoney, parseMajorToMinor } from "@/lib/money";
import { fundBalance, postJournal } from "@/lib/ledger/journal";
import {
  canMoveIntervention,
  completionBlockers,
  DEFAULT_COMPLETION_CHECKLIST,
  type ChecklistItem,
} from "@/lib/workflow/intervention";
import { CAMPAIGN_TRANSITIONS } from "@/lib/workflow/campaign";
import { notify, notifyRole } from "../notifications";
import { requireAnyPermission, requirePermission, type Actor } from "../actor";
import { raiseRiskAlert } from "./risk";

/** Material budget change threshold: changes above 10% need independent approval. */
export const MATERIAL_CHANGE_BPS = 1000;

export function isMaterialBudgetChange(oldBudget: bigint, newBudget: bigint): boolean {
  if (oldBudget <= 0n) return true;
  const diff = newBudget > oldBudget ? newBudget - oldBudget : oldBudget - newBudget;
  return diff * 10000n > oldBudget * BigInt(MATERIAL_CHANGE_BPS);
}

async function loadIntervention(tx: Tx, id: string, actor: Actor) {
  const iv = await tx.intervention.findUnique({
    where: { id },
    include: { campaign: { include: { application: { select: { applicantId: true, reference: true } } } } },
  });
  if (!iv) throw notFound();
  if (iv.campaign.application.applicantId === actor.userId)
    throw forbidden("You cannot manage support for your own request.");
  return iv;
}

export const interventionSchema = z.object({
  scope: z.string().trim().min(10).max(4000),
  plannedOutcome: z.string().trim().min(10).max(2000),
  approvedBudget: z.string(),
});

export async function createIntervention(actor: Actor, campaignId: string, raw: unknown) {
  const a = requirePermission(actor, "intervention.manage");
  const d = interventionSchema.parse(raw);
  const budget = parseMajorToMinor(d.approvedBudget);
  if (!budget || budget <= 0n) throw invalid("Enter the approved budget.");
  return db.$transaction(async (tx) => {
    const c = await tx.campaign.findUnique({
      where: { id: campaignId },
      include: { application: true, intervention: true },
    });
    if (!c) throw notFound();
    if (c.application.applicantId === a.userId) throw forbidden();
    if (c.intervention) throw conflict("An intervention already exists for this campaign.");
    if (
      ![
        "FULLY_FUNDED",
        "PARTIALLY_FUNDED",
        "FUNDING_IN_PROGRESS",
        "PUBLISHED",
        "READY_FOR_PUBLICATION",
        "DRAFT",
      ].includes(c.status)
    )
      throw conflict("This campaign cannot start an intervention.");
    if (budget > c.targetAmountMinor)
      throw conflict(
        "The intervention budget cannot exceed the approved campaign budget without an approved change.",
      );
    const iv = await tx.intervention.create({
      data: {
        campaignId,
        caseManagerId: a.userId,
        scope: d.scope,
        plannedOutcome: d.plannedOutcome,
        approvedBudgetMinor: budget,
        completionChecklist: DEFAULT_COMPLETION_CHECKLIST.map((i) => ({ ...i })),
      },
    });
    await recordStatusChange(tx, {
      entityType: "INTERVENTION",
      entityId: iv.id,
      from: null,
      to: "PLANNING",
      actorId: a.userId,
    });
    await audit(
      { actorId: a.userId, action: "intervention.create", entityType: "Intervention", entityId: iv.id },
      tx,
    );
    return iv;
  });
}

/** Move the intervention; keeps the campaign status in step. */
export async function moveIntervention(actor: Actor, id: string, to: InterventionStatus, reason: string) {
  const a = requirePermission(actor, "intervention.manage");
  if (to === "COMPLETED") throw invalid("Use the outcome review to complete an intervention.");
  if (reason.trim().length < 3) throw invalid("Give a reason.");
  await db.$transaction(async (tx) => {
    const iv = await loadIntervention(tx, id, a);
    if (!canMoveIntervention(iv.status, to))
      throw conflict(`An intervention cannot move from ${iv.status} to ${to}.`);
    if (to === "IN_PROGRESS" && iv.status === "PLANNING") {
      const c = iv.campaign;
      if (!["FULLY_FUNDED", "PARTIALLY_FUNDED"].includes(c.status))
        throw conflict("Start delivery once funding is complete or formally closed as partially funded.");
      await setCampaignStatus(tx, c.id, c.status, "INTERVENTION_IN_PROGRESS", a, reason);
    }
    if (to === "OUTCOME_REVIEW")
      await setCampaignStatus(tx, iv.campaign.id, iv.campaign.status, "OUTCOME_REVIEW", a, reason);
    if (to === "UNSUCCESSFUL" || to === "CANCELLED") {
      const balance = await fundBalance(tx, iv.campaignId);
      await raiseRiskAlert(tx, {
        type: "INTERVENTION_NOT_COMPLETED",
        severity: "HIGH",
        campaignId: iv.campaignId,
        dedupeKey: `iv-failed:${iv.id}`,
        details: `Intervention for ${iv.campaign.publicId} marked ${to}. Restricted balance ${formatMoney(balance)}. An authorised review must apply the published policy (refunds, alternative assistance with consent, or unspent balance handling).`,
      });
      await notifyRole(tx, "FINANCE_OFFICER", {
        title: "Intervention could not be completed",
        body: `Campaign ${iv.campaign.publicId} needs an unspent-funds review.`,
        path: `/staff/interventions/${iv.id}`,
        dedupeKey: `iv-failed:${iv.id}`,
      });
    }
    await tx.intervention.update({ where: { id }, data: { status: to } });
    await recordStatusChange(tx, {
      entityType: "INTERVENTION",
      entityId: id,
      from: iv.status,
      to,
      actorId: a.userId,
      reason: reason.trim(),
    });
    await audit(
      {
        actorId: a.userId,
        action: "intervention.transition",
        entityType: "Intervention",
        entityId: id,
        metadata: { from: iv.status, to },
      },
      tx,
    );
  });
}

async function setCampaignStatus(
  tx: Tx,
  campaignId: string,
  from: Prisma.CampaignCreateInput["status"] & string,
  to: Prisma.CampaignCreateInput["status"] & string,
  a: Actor,
  reason: string,
) {
  const allowed =
    CAMPAIGN_TRANSITIONS[from as keyof typeof CAMPAIGN_TRANSITIONS]?.[
      to as keyof typeof CAMPAIGN_TRANSITIONS
    ];
  if (!allowed) throw conflict(`The campaign cannot move from ${from} to ${to}.`);
  await tx.campaign.update({ where: { id: campaignId }, data: { status: to } });
  await recordStatusChange(tx, {
    entityType: "CAMPAIGN",
    entityId: campaignId,
    from,
    to,
    actorId: a.userId,
    reason,
  });
}

export async function updateChecklist(actor: Actor, id: string, keys: string[]) {
  const a = requirePermission(actor, "intervention.manage");
  await db.$transaction(async (tx) => {
    const iv = await loadIntervention(tx, id, a);
    const list = (iv.completionChecklist as ChecklistItem[]).map((i) => ({
      ...i,
      done: keys.includes(i.key),
    }));
    await tx.intervention.update({ where: { id }, data: { completionChecklist: list } });
    await audit(
      {
        actorId: a.userId,
        action: "intervention.checklist",
        entityType: "Intervention",
        entityId: id,
        metadata: { done: keys },
      },
      tx,
    );
  });
}

export async function recordFeedback(actor: Actor, id: string, feedback: string, consentToShare: boolean) {
  const a = requirePermission(actor, "intervention.manage");
  await db.$transaction(async (tx) => {
    await loadIntervention(tx, id, a);
    await tx.intervention.update({
      where: { id },
      data: {
        beneficiaryFeedback: feedback.trim().slice(0, 4000) || null,
        feedbackConsentToShare: consentToShare,
      },
    });
    await audit(
      { actorId: a.userId, action: "intervention.feedback", entityType: "Intervention", entityId: id },
      tx,
    );
  });
}

export async function recordDelivery(
  actor: Actor,
  id: string,
  input: { description: string; deliveredAt: string; fileId?: string | null },
) {
  const a = requirePermission(actor, "intervention.manage");
  if (input.description.trim().length < 10)
    throw invalid("Describe what was delivered, to whom and in what condition.");
  const when = new Date(input.deliveredAt);
  if (isNaN(when.getTime()) || when.getTime() > Date.now() + 864e5)
    throw invalid("Enter a valid delivery date.");
  await db.$transaction(async (tx) => {
    const iv = await loadIntervention(tx, id, a);
    if (!["IN_PROGRESS", "PARTIALLY_DELIVERED", "DELIVERED"].includes(iv.status))
      throw conflict("Delivery can only be recorded while the intervention is in progress.");
    if (input.fileId) {
      const f = await tx.storedFile.findUnique({ where: { id: input.fileId } });
      if (!f || f.purpose !== "DELIVERY_EVIDENCE" || f.uploadedById !== a.userId)
        throw invalid("Attach delivery evidence you uploaded.");
    }
    await tx.deliveryEvidence.create({
      data: {
        interventionId: id,
        description: input.description.trim(),
        deliveredAt: when,
        fileId: input.fileId ?? null,
        recordedById: a.userId,
      },
    });
    await audit(
      { actorId: a.userId, action: "intervention.delivery", entityType: "Intervention", entityId: id },
      tx,
    );
    const supporters = await tx.payment.findMany({
      where: { campaignId: iv.campaignId, status: "SUCCEEDED" },
      select: { payerEmail: true, payerName: true, payerUserId: true },
      distinct: ["payerEmail"],
      take: 500,
    });
    for (const s of supporters) {
      await notify(tx, {
        userId: s.payerUserId,
        to: s.payerEmail,
        template: "intervention_milestone",
        params: { name: s.payerName, campaignTitle: iv.campaign.title, publicId: iv.campaign.publicId },
        dedupeKey: `milestone:${iv.id}:${s.payerEmail}:${when.toISOString().slice(0, 10)}`,
      });
    }
  });
}

// ─── Budget changes (independent approval for material changes) ───

export async function requestBudgetChange(actor: Actor, id: string, newBudgetInput: string, reason: string) {
  const a = requirePermission(actor, "intervention.manage");
  const nb = parseMajorToMinor(newBudgetInput);
  if (!nb || nb <= 0n) throw invalid("Enter the new budget.");
  if (reason.trim().length < 10) throw invalid("Explain why the budget must change.");
  return db.$transaction(async (tx) => {
    const iv = await loadIntervention(tx, id, a);
    if (["COMPLETED", "CANCELLED", "UNSUCCESSFUL"].includes(iv.status))
      throw conflict("This intervention is closed.");
    const material = isMaterialBudgetChange(iv.approvedBudgetMinor, nb);
    const requiresApproval = material || nb > iv.campaign.targetAmountMinor;
    const req = await tx.budgetChangeRequest.create({
      data: {
        interventionId: id,
        requestedById: a.userId,
        oldBudgetMinor: iv.approvedBudgetMinor,
        newBudgetMinor: nb,
        reason: reason.trim(),
      },
    });
    if (!requiresApproval) {
      // Immaterial change within the published budget: recorded, applied, still audited.
      await tx.budgetChangeRequest.update({
        where: { id: req.id },
        data: { status: "APPROVED", decidedAt: new Date() },
      });
      await tx.intervention.update({ where: { id }, data: { approvedBudgetMinor: nb } });
    } else {
      await raiseRiskAlert(tx, {
        type: "MATERIAL_BUDGET_CHANGE",
        severity: "MEDIUM",
        campaignId: iv.campaignId,
        dedupeKey: `budget-change:${req.id}`,
        details: `Budget change requested for ${iv.campaign.publicId}: ${formatMoney(iv.approvedBudgetMinor)} → ${formatMoney(nb)}. Requires independent approval.`,
      });
      await notifyRole(tx, "FINANCE_OFFICER", {
        title: "Budget change awaiting approval",
        body: `Intervention for ${iv.campaign.publicId}.`,
        path: `/staff/interventions/${id}`,
        dedupeKey: `budget-change:${req.id}`,
      });
    }
    await audit(
      {
        actorId: a.userId,
        action: "intervention.budget_change_request",
        entityType: "Intervention",
        entityId: id,
        metadata: { material, requiresApproval },
      },
      tx,
    );
    return { material, requiresApproval };
  });
}

export async function decideBudgetChange(actor: Actor, requestId: string, approve: boolean) {
  const a = requirePermission(actor, "intervention.budget_change.approve");
  await db.$transaction(async (tx) => {
    const req = await tx.budgetChangeRequest.findUnique({
      where: { id: requestId },
      include: { intervention: { include: { campaign: true } } },
    });
    if (!req || req.status !== "PENDING") throw conflict("This request is not pending.");
    if (req.requestedById === a.userId)
      throw forbidden("A different person must approve a budget change you requested.");
    await tx.budgetChangeRequest.update({
      where: { id: requestId },
      data: { status: approve ? "APPROVED" : "REJECTED", decidedById: a.userId, decidedAt: new Date() },
    });
    if (approve)
      await tx.intervention.update({
        where: { id: req.interventionId },
        data: { approvedBudgetMinor: req.newBudgetMinor },
      });
    await audit(
      {
        actorId: a.userId,
        action: approve ? "intervention.budget_change_approve" : "intervention.budget_change_reject",
        entityType: "Intervention",
        entityId: req.interventionId,
      },
      tx,
    );
  });
}

// ─── Suppliers, purchase requests, disbursements ───

export const supplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  contactName: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || null),
  contactPhone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => v || null),
  contactEmail: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || null),
  bankName: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => v || null),
  accountNumberLast4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Enter only the last 4 digits.")
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
});

export async function createSupplier(actor: Actor, raw: unknown) {
  const a = requireAnyPermission(actor, ["finance.supplier.manage", "intervention.manage"]);
  const d = supplierSchema.parse(raw);
  const s = await db.supplier.create({ data: { ...d, createdById: a.userId } });
  await audit({ actorId: a.userId, action: "supplier.create", entityType: "Supplier", entityId: s.id });
  return s;
}

/** Supplier verification (bank details confirmed out-of-band) by finance, independent of the creator. */
export async function verifySupplier(actor: Actor, supplierId: string) {
  const a = requirePermission(actor, "finance.supplier.manage");
  const s = await db.supplier.findUnique({ where: { id: supplierId } });
  if (!s) throw notFound();
  if (s.createdById === a.userId) throw forbidden("A different person must verify a supplier you added.");
  await db.supplier.update({
    where: { id: supplierId },
    data: { status: "VERIFIED", verifiedById: a.userId },
  });
  await audit({ actorId: a.userId, action: "supplier.verify", entityType: "Supplier", entityId: supplierId });
}

export async function createPurchaseRequest(
  actor: Actor,
  interventionId: string,
  input: { supplierId: string; description: string; amount: string; quoteFileId?: string | null },
) {
  const a = requirePermission(actor, "intervention.manage");
  const amount = parseMajorToMinor(input.amount);
  if (!amount || amount <= 0n) throw invalid("Enter the amount.");
  if (input.description.trim().length < 5) throw invalid("Describe what is being purchased.");
  return db.$transaction(async (tx) => {
    const iv = await loadIntervention(tx, interventionId, a);
    if (!["PLANNING", "IN_PROGRESS", "PARTIALLY_DELIVERED"].includes(iv.status))
      throw conflict("Purchases cannot be requested at this stage.");
    const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier || supplier.status === "SUSPENDED") throw invalid("Choose an active supplier.");
    const committed = await tx.purchaseRequest.aggregate({
      where: { interventionId, status: { in: ["PENDING", "APPROVED"] } },
      _sum: { amountMinor: true },
    });
    if ((committed._sum.amountMinor ?? 0n) + amount > iv.approvedBudgetMinor)
      throw conflict(
        "This purchase would exceed the approved intervention budget. Request a budget change first.",
      );
    const pr = await tx.purchaseRequest.create({
      data: {
        interventionId,
        supplierId: supplier.id,
        description: input.description.trim(),
        amountMinor: amount,
        quoteFileId: input.quoteFileId ?? null,
        requestedById: a.userId,
      },
    });
    await audit(
      { actorId: a.userId, action: "purchase.request", entityType: "PurchaseRequest", entityId: pr.id },
      tx,
    );
    return pr;
  });
}

export async function decidePurchaseRequest(actor: Actor, id: string, approve: boolean) {
  const a = requireAnyPermission(actor, ["finance.disbursement.approve", "intervention.outcome_review"]);
  await db.$transaction(async (tx) => {
    const pr = await tx.purchaseRequest.findUnique({ where: { id } });
    if (!pr || pr.status !== "PENDING") throw conflict("This purchase request is not pending.");
    if (pr.requestedById === a.userId)
      throw forbidden("A different person must approve a purchase you requested.");
    await tx.purchaseRequest.update({
      where: { id },
      data: { status: approve ? "APPROVED" : "REJECTED", decidedById: a.userId, decidedAt: new Date() },
    });
    await audit(
      {
        actorId: a.userId,
        action: approve ? "purchase.approve" : "purchase.reject",
        entityType: "PurchaseRequest",
        entityId: id,
      },
      tx,
    );
  });
}

export const disbursementSchema = z.object({
  supplierId: z.string().min(1),
  purchaseRequestId: z
    .string()
    .optional()
    .transform((v) => v || null),
  amount: z.string(),
  purpose: z.string().trim().min(5).max(500),
  invoiceNumber: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => v || null),
  invoiceFileId: z
    .string()
    .optional()
    .transform((v) => v || null),
});

/**
 * Maker: request a disbursement (direct payment to a supplier). A request can never be
 * approved by the same person – enforced here and by a database CHECK constraint.
 */
export async function requestDisbursement(actor: Actor, interventionId: string, raw: unknown) {
  const a = requirePermission(actor, "finance.disbursement.request");
  const d = disbursementSchema.parse(raw);
  const amount = parseMajorToMinor(d.amount);
  if (!amount || amount <= 0n) throw invalid("Enter the amount.");
  return db.$transaction(async (tx) => {
    const iv = await loadIntervention(tx, interventionId, a);
    if (!["IN_PROGRESS", "PARTIALLY_DELIVERED", "PLANNING"].includes(iv.status))
      throw conflict("Disbursements cannot be requested at this stage.");
    const supplier = await tx.supplier.findUnique({ where: { id: d.supplierId } });
    if (!supplier) throw invalid("Choose a supplier.");
    if (d.purchaseRequestId) {
      const pr = await tx.purchaseRequest.findUnique({ where: { id: d.purchaseRequestId } });
      if (
        !pr ||
        pr.interventionId !== interventionId ||
        pr.status !== "APPROVED" ||
        pr.supplierId !== supplier.id
      )
        throw invalid("Link an approved purchase request for this supplier.");
      const already = await tx.disbursement.aggregate({
        where: { purchaseRequestId: pr.id, status: { in: ["REQUESTED", "APPROVED", "PAID"] } },
        _sum: { amountMinor: true },
      });
      if ((already._sum.amountMinor ?? 0n) + amount > pr.amountMinor)
        throw conflict("This exceeds the approved purchase amount.");
    }
    const ds = await tx.disbursement.create({
      data: {
        interventionId,
        supplierId: supplier.id,
        purchaseRequestId: d.purchaseRequestId,
        amountMinor: amount,
        purpose: d.purpose,
        invoiceNumber: d.invoiceNumber,
        invoiceFileId: d.invoiceFileId,
        requestedById: a.userId,
      },
    });
    await recordStatusChange(tx, {
      entityType: "DISBURSEMENT",
      entityId: ds.id,
      from: null,
      to: "REQUESTED",
      actorId: a.userId,
    });
    await audit(
      { actorId: a.userId, action: "disbursement.request", entityType: "Disbursement", entityId: ds.id },
      tx,
    );
    await notifyRole(tx, "FINANCE_OFFICER", {
      title: "Disbursement awaiting independent approval",
      body: `${formatMoney(amount)} to ${supplier.name}.`,
      path: "/staff/finance/disbursements",
      dedupeKey: `disb:${ds.id}`,
    });
    return ds;
  });
}

/** Pure separation-of-duties + funds check for disbursement approval (unit tested). */
export function disbursementApprovalBlockers(input: {
  status: string;
  requestedById: string;
  approverId: string;
  supplierVerified: boolean;
  amount: bigint;
  available: bigint;
  hasInvoice: boolean;
}): string[] {
  const b: string[] = [];
  if (input.status !== "REQUESTED") b.push("This disbursement is not awaiting approval.");
  if (input.requestedById === input.approverId)
    b.push("You requested this disbursement, so a different finance officer must approve it.");
  if (!input.supplierVerified) b.push("The supplier's payment details have not been independently verified.");
  if (!input.hasInvoice) b.push("An invoice or quote reference is required.");
  if (input.amount > input.available)
    b.push(`Insufficient restricted funds: ${formatMoney(input.available)} available.`);
  return b;
}

/** Checker: approve. Posts the expenditure against the campaign's restricted fund. */
export async function approveDisbursement(actor: Actor, id: string) {
  const a = requirePermission(actor, "finance.disbursement.approve");
  await db.$transaction(async (tx) => {
    const ds = await tx.disbursement.findUnique({
      where: { id },
      include: {
        supplier: true,
        intervention: {
          include: { campaign: { include: { application: { select: { applicantId: true } } } } },
        },
      },
    });
    if (!ds) throw notFound();
    if (ds.intervention.campaign.application.applicantId === a.userId) throw forbidden();
    await tx.$queryRaw`SELECT "id" FROM "campaigns" WHERE "id" = ${ds.intervention.campaignId} FOR UPDATE`;
    const available = await fundBalance(tx, ds.intervention.campaignId);
    const blockers = disbursementApprovalBlockers({
      status: ds.status,
      requestedById: ds.requestedById,
      approverId: a.userId,
      supplierVerified: ds.supplier.status === "VERIFIED",
      amount: ds.amountMinor,
      available,
      hasInvoice: !!(ds.invoiceNumber || ds.invoiceFileId),
    });
    if (blockers.length) throw conflict(blockers.join(" "));
    const res = await tx.disbursement.updateMany({
      where: { id, status: "REQUESTED" },
      data: { status: "APPROVED", approvedById: a.userId, approvedAt: new Date() },
    });
    if (!res.count) throw conflict("This disbursement changed. Reload and try again.");
    await postJournal(tx, {
      idempotencyKey: `disbursement:${id}:approved`,
      description: `Approved: ${ds.purpose} (${ds.supplier.name})`,
      sourceType: "DISBURSEMENT",
      sourceId: id,
      createdById: a.userId,
      currency: ds.currency,
      lines: [
        {
          account: "INTERVENTION_EXPENDITURE",
          debit: ds.amountMinor,
          campaignId: ds.intervention.campaignId,
        },
        { account: "SUPPLIERS_PAYABLE", credit: ds.amountMinor },
      ],
    });
    await recordStatusChange(tx, {
      entityType: "DISBURSEMENT",
      entityId: id,
      from: "REQUESTED",
      to: "APPROVED",
      actorId: a.userId,
    });
    await audit(
      { actorId: a.userId, action: "disbursement.approve", entityType: "Disbursement", entityId: id },
      tx,
    );
  });
}

export async function rejectDisbursement(actor: Actor, id: string, reason: string) {
  const a = requirePermission(actor, "finance.disbursement.approve");
  if (reason.trim().length < 5) throw invalid("Explain the rejection.");
  await db.$transaction(async (tx) => {
    const ds = await tx.disbursement.findUnique({ where: { id } });
    if (!ds || ds.status !== "REQUESTED") throw conflict("This disbursement is not awaiting approval.");
    if (ds.requestedById === a.userId) throw forbidden("Cancel your own request instead.");
    await tx.disbursement.update({
      where: { id },
      data: { status: "REJECTED", rejectionReason: reason.trim() },
    });
    await recordStatusChange(tx, {
      entityType: "DISBURSEMENT",
      entityId: id,
      from: "REQUESTED",
      to: "REJECTED",
      actorId: a.userId,
      reason,
    });
    await audit(
      { actorId: a.userId, action: "disbursement.reject", entityType: "Disbursement", entityId: id },
      tx,
    );
  });
}

/** Record that an approved disbursement was paid (bank / disbursement partner reference). */
export async function markDisbursementPaid(actor: Actor, id: string, paymentReference: string) {
  const a = requirePermission(actor, "finance.disbursement.approve");
  if (paymentReference.trim().length < 4) throw invalid("Enter the bank or disbursement-partner reference.");
  await db.$transaction(async (tx) => {
    const ds = await tx.disbursement.findUnique({ where: { id } });
    if (!ds || ds.status !== "APPROVED") throw conflict("Only approved disbursements can be marked as paid.");
    await tx.disbursement.update({
      where: { id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paidRecordedById: a.userId,
        paymentReference: paymentReference.trim(),
      },
    });
    await postJournal(tx, {
      idempotencyKey: `disbursement:${id}:paid`,
      description: `Paid ${paymentReference.trim()}`,
      sourceType: "DISBURSEMENT",
      sourceId: id,
      createdById: a.userId,
      currency: ds.currency,
      lines: [
        { account: "SUPPLIERS_PAYABLE", debit: ds.amountMinor },
        { account: "CASH", credit: ds.amountMinor },
      ],
    });
    await recordStatusChange(tx, {
      entityType: "DISBURSEMENT",
      entityId: id,
      from: "APPROVED",
      to: "PAID",
      actorId: a.userId,
    });
    await audit(
      { actorId: a.userId, action: "disbursement.paid", entityType: "Disbursement", entityId: id },
      tx,
    );
  });
}

// ─── Outcome review & completion ───

/**
 * Completion requires evidence and an independent outcome review: the reviewer must not be
 * the intervention's case manager. Reaching a funding target never completes anything.
 */
export async function completeOutcomeReview(
  actor: Actor,
  id: string,
  input: { outcomeSummary: string; result: "COMPLETED" | "UNSUCCESSFUL" | "IN_PROGRESS" },
) {
  const a = requirePermission(actor, "intervention.outcome_review");
  if (input.outcomeSummary.trim().length < 20)
    throw invalid("Summarise the verified outcome (or why it could not be achieved / measured yet).");
  await db.$transaction(async (tx) => {
    const iv = await loadIntervention(tx, id, a);
    if (iv.status !== "OUTCOME_REVIEW") throw conflict("The intervention must be in outcome review.");
    if (iv.caseManagerId === a.userId)
      throw forbidden("The intervention's own case manager cannot complete its outcome review.");
    if (input.result === "COMPLETED") {
      const [deliveries, openDisb] = await Promise.all([
        tx.deliveryEvidence.count({ where: { interventionId: id } }),
        tx.disbursement.count({ where: { interventionId: id, status: { in: ["REQUESTED", "APPROVED"] } } }),
      ]);
      const blockers = completionBlockers({
        checklist: iv.completionChecklist as ChecklistItem[],
        deliveryEvidenceCount: deliveries,
        openDisbursements: openDisb,
      });
      if (blockers.length) throw conflict(blockers.join(" "));
    }
    await tx.intervention.update({
      where: { id },
      data: {
        status: input.result,
        outcomeSummary: input.outcomeSummary.trim(),
        outcomeReviewedById: a.userId,
        completedAt: input.result === "COMPLETED" ? new Date() : null,
      },
    });
    await recordStatusChange(tx, {
      entityType: "INTERVENTION",
      entityId: id,
      from: iv.status,
      to: input.result,
      actorId: a.userId,
      reason: input.outcomeSummary.trim(),
    });
    if (input.result === "COMPLETED") {
      await setCampaignStatus(
        tx,
        iv.campaignId,
        iv.campaign.status,
        "COMPLETED",
        a,
        "Outcome review completed",
      );
      const app = await tx.application.findUniqueOrThrow({ where: { id: iv.campaign.applicationId } });
      if (app.status === "APPROVED") {
        await tx.application.update({ where: { id: app.id }, data: { status: "CLOSED" } });
        await recordStatusChange(tx, {
          entityType: "APPLICATION",
          entityId: app.id,
          from: "APPROVED",
          to: "CLOSED",
          actorId: a.userId,
          reason: "Support completed",
        });
      }
      const balance = await fundBalance(tx, iv.campaignId);
      if (balance > 0n) {
        await raiseRiskAlert(tx, {
          type: "UNSPENT_BALANCE",
          severity: "MEDIUM",
          campaignId: iv.campaignId,
          dedupeKey: `unspent:${iv.campaignId}`,
          details: `Completed campaign ${iv.campaign.publicId} has an unspent restricted balance of ${formatMoney(balance)}. Apply the published unspent-funds policy.`,
        });
      }
    } else if (input.result === "IN_PROGRESS") {
      await setCampaignStatus(
        tx,
        iv.campaignId,
        iv.campaign.status,
        "INTERVENTION_IN_PROGRESS",
        a,
        "Returned from outcome review",
      );
    }
    await audit(
      {
        actorId: a.userId,
        action: "intervention.outcome_review",
        entityType: "Intervention",
        entityId: id,
        metadata: { result: input.result },
      },
      tx,
    );
  });
}

export async function getInterventionForStaff(actor: Actor, id: string) {
  const a = requireAnyPermission(actor, [
    "intervention.manage",
    "finance.view",
    "intervention.outcome_review",
  ]);
  const iv = await db.intervention.findUnique({
    where: { id },
    include: {
      campaign: {
        select: {
          id: true,
          publicId: true,
          title: true,
          status: true,
          targetAmountMinor: true,
          application: { select: { applicantId: true, reference: true } },
        },
      },
      budgetChanges: { orderBy: { createdAt: "desc" } },
      purchaseRequests: { include: { supplier: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      disbursements: {
        include: { supplier: { select: { name: true, status: true } } },
        orderBy: { createdAt: "desc" },
      },
      deliveries: { orderBy: { deliveredAt: "desc" } },
    },
  });
  if (!iv) throw notFound();
  if (iv.campaign.application.applicantId === a.userId) throw forbidden();
  const [balance, suppliers, history] = await Promise.all([
    fundBalance(db, iv.campaign.id),
    db.supplier.findMany({ where: { status: { not: "SUSPENDED" } }, orderBy: { name: "asc" } }),
    db.statusHistory.findMany({
      where: { entityType: "INTERVENTION", entityId: id },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { iv, balance, suppliers, history };
}

export async function listDisbursements(actor: Actor, status?: string) {
  requireAnyPermission(actor, ["finance.view", "finance.disbursement.request"]);
  return db.disbursement.findMany({
    where: status ? { status: status as never } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      supplier: { select: { name: true, status: true } },
      intervention: { select: { id: true, campaign: { select: { title: true, publicId: true } } } },
    },
  });
}

/** Missing-delivery-evidence check (run by dashboard/job): paid disbursements with no evidence after 14 days. */
export async function flagMissingDeliveryEvidence() {
  const cutoff = new Date(Date.now() - 14 * 864e5);
  const ivs = await db.intervention.findMany({
    where: {
      status: { in: ["IN_PROGRESS", "PARTIALLY_DELIVERED"] },
      disbursements: { some: { status: "PAID", paidAt: { lt: cutoff } } },
      deliveries: { none: {} },
    },
    select: { id: true, campaignId: true },
  });
  for (const iv of ivs) {
    await db.$transaction((tx) =>
      raiseRiskAlert(tx, {
        type: "MISSING_DELIVERY_EVIDENCE",
        severity: "MEDIUM",
        campaignId: iv.campaignId,
        dedupeKey: `missing-evidence:${iv.id}`,
        details:
          "Supplier payments were made more than 14 days ago but no delivery evidence has been recorded.",
      }),
    );
  }
  return ivs.length;
}
