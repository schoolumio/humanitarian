import type { Prisma, ProposalType } from "@prisma/client";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { audit, recordStatusChange } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { newPaymentReference } from "@/lib/ids";
import { max0, parseMajorToMinor } from "@/lib/money";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { paymentProvider } from "@/lib/payments";
import { env } from "@/lib/env";
import { PUBLIC_CAMPAIGN_STATUSES } from "@/lib/workflow/campaign";
import { notify, notifyRole } from "../notifications";
import { requirePermission, type Actor } from "../actor";
import { publicCampaignSelect } from "./campaigns";

/**
 * Sponsorship lifecycle (deliberately distinct concepts):
 *   Proposal/enquiry → Offer (agreement DRAFT, prepared by staff) → Approved agreement (second
 *   staff member) → Signed agreement (sponsor's authorised representative) → Pledged amount
 *   (agreement.pledgedAmountMinor – NOT money) → Confirmed payment (verified Payment) →
 *   Intervention delivery → Completion → Sponsor reporting.
 */

export const organisationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  registrationNumber: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => v || null),
  website: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || null)
    .refine((v) => !v || /^https?:\/\/\S+$/.test(v), "Enter a full web address (https://…)."),
  sector: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => v || null),
  address: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => v || null),
  contactEmail: z.email().trim().toLowerCase(),
  contactPhone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => v || null),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => v || null),
  jobTitle: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || null),
  isAuthorisedRepresentative: z.preprocess((v) => v === "on" || v === true, z.boolean()),
});

export async function myOrganisation(actor: Actor) {
  requirePermission(actor, "sponsor.own");
  return db.organisationMember.findFirst({
    where: { userId: actor.userId },
    include: { organisation: true },
  });
}

async function approvedMembership(actor: Actor, tx: Tx = db) {
  requirePermission(actor, "sponsor.own");
  const m = await tx.organisationMember.findFirst({
    where: { userId: actor.userId },
    include: { organisation: true },
  });
  if (!m) throw forbidden("Register your organisation first.");
  if (m.organisation.status !== "APPROVED")
    throw forbidden("Your organisation is awaiting review by KindSpring.");
  return m;
}

export async function registerOrganisation(actor: Actor, raw: unknown) {
  requirePermission(actor, "sponsor.own");
  const d = organisationSchema.parse(raw);
  if (await db.organisationMember.findFirst({ where: { userId: actor.userId } }))
    throw conflict("You are already linked to an organisation.");
  const { jobTitle, isAuthorisedRepresentative, ...org } = d;
  return db.$transaction(async (tx) => {
    const o = await tx.organisation.create({
      data: { ...org, members: { create: { userId: actor.userId, jobTitle, isAuthorisedRepresentative } } },
    });
    await recordStatusChange(tx, {
      entityType: "ORGANISATION",
      entityId: o.id,
      from: null,
      to: "PENDING_REVIEW",
      actorId: actor.userId,
    });
    await audit(
      { actorId: actor.userId, action: "organisation.register", entityType: "Organisation", entityId: o.id },
      tx,
    );
    await notifyRole(tx, "CASE_MANAGER", {
      title: "New sponsor organisation",
      body: `${o.name} registered and awaits review.`,
      path: "/staff/sponsors",
      dedupeKey: `org-registered:${o.id}`,
    });
    return o;
  });
}

export async function reviewOrganisation(
  actor: Actor,
  organisationId: string,
  outcome: "APPROVED" | "REJECTED" | "SUSPENDED",
  notes: string,
  publicDisplayName?: string,
) {
  const a = requirePermission(actor, "sponsor.review");
  if (notes.trim().length < 5)
    throw invalid("Record the checks performed (e.g. CAC registration, representative identity).");
  await db.$transaction(async (tx) => {
    const o = await tx.organisation.findUnique({
      where: { id: organisationId },
      include: { members: { include: { user: true } } },
    });
    if (!o) throw notFound();
    if (o.members.some((m) => m.userId === a.userId))
      throw forbidden("You cannot review an organisation you belong to.");
    await tx.organisation.update({
      where: { id: o.id },
      data: {
        status: outcome,
        reviewedById: a.userId,
        reviewedAt: new Date(),
        reviewNotes: notes.trim(),
        publicDisplayName: publicDisplayName?.trim() || o.publicDisplayName,
      },
    });
    await recordStatusChange(tx, {
      entityType: "ORGANISATION",
      entityId: o.id,
      from: o.status,
      to: outcome,
      actorId: a.userId,
      reason: notes.trim(),
    });
    await audit(
      {
        actorId: a.userId,
        action: "organisation.review",
        entityType: "Organisation",
        entityId: o.id,
        metadata: { outcome },
      },
      tx,
    );
    for (const m of o.members) {
      await notify(tx, {
        userId: m.userId,
        to: m.user.email,
        template: "sponsor_status_changed",
        params: { name: m.user.name },
        dedupeKey: `org-review:${o.id}:${outcome}:${Date.now()}`,
      });
    }
  });
}

export const sponsorCaseFilters = z.object({
  category: z.string().max(60).optional(),
  state: z.string().max(60).optional(),
  maxBudget: z.string().optional(),
  q: z.string().trim().max(80).optional(),
});

/**
 * Cases visible to approved sponsors: public campaigns plus SPONSORS_ONLY campaigns (for
 * beneficiaries who consented to sponsor sharing but not to public listing). Never includes
 * personal information from the application.
 */
export async function listSponsorCases(actor: Actor, raw: unknown) {
  await approvedMembership(actor);
  const f = sponsorCaseFilters.parse(raw);
  const where: Prisma.CampaignWhereInput = {
    status: { in: ["PUBLISHED", "FUNDING_IN_PROGRESS"] },
    acceptsSponsorship: true,
  };
  if (f.category) where.category = { slug: f.category };
  if (f.state) where.locationLabel = { contains: f.state, mode: "insensitive" };
  if (f.q)
    where.OR = [
      { title: { contains: f.q, mode: "insensitive" } },
      { interventionSummary: { contains: f.q, mode: "insensitive" } },
    ];
  const max = f.maxBudget ? parseMajorToMinor(f.maxBudget) : null;
  if (max) where.targetAmountMinor = { lte: max };
  return db.campaign.findMany({
    where,
    select: { ...publicCampaignSelect, id: true, visibility: true },
    orderBy: { publishedAt: "desc" },
    take: 50,
  });
}

export async function getSponsorCase(actor: Actor, campaignId: string) {
  await approvedMembership(actor);
  const c = await db.campaign.findUnique({
    where: { id: campaignId },
    select: {
      ...publicCampaignSelect,
      id: true,
      visibility: true,
      budgetLines: { select: { description: true, amountMinor: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!c || !PUBLIC_CAMPAIGN_STATUSES.includes(c.status)) throw notFound();
  return c;
}

export const proposalSchema = z.object({
  campaignId: z
    .string()
    .optional()
    .transform((v) => v || null),
  type: z.enum([
    "ENQUIRY",
    "FULL_CASH_SPONSORSHIP",
    "PARTIAL_CASH_SPONSORSHIP",
    "IN_KIND_GOODS",
    "PROFESSIONAL_SERVICES",
  ]),
  message: z.string().trim().min(20, "Describe your proposal or question.").max(4000),
  proposedAmount: z.string().optional(),
});

/** Sponsor enquiries are allowed before organisation approval (so prospective partners can ask questions). */
export async function submitProposal(actor: Actor, raw: unknown) {
  requirePermission(actor, "sponsor.own");
  await enforceRateLimit(`proposal:${actor.userId}`, 20, 86400);
  const d = proposalSchema.parse(raw);
  const m = await db.organisationMember.findFirst({
    where: { userId: actor.userId },
    include: { organisation: true },
  });
  if (!m) throw forbidden("Register your organisation first.");
  if (d.type !== "ENQUIRY" && m.organisation.status !== "APPROVED")
    throw forbidden(
      "Your organisation must be approved before making sponsorship offers. You can still send an enquiry.",
    );
  if (m.organisation.status === "REJECTED" || m.organisation.status === "SUSPENDED") throw forbidden();
  const amount = d.proposedAmount ? parseMajorToMinor(d.proposedAmount) : null;
  if (d.proposedAmount && !amount) throw invalid("Enter the proposed amount in naira.");
  if (d.campaignId) {
    const c = await db.campaign.findUnique({ where: { id: d.campaignId } });
    if (!c || !PUBLIC_CAMPAIGN_STATUSES.includes(c.status)) throw notFound("Case not found.");
  }
  return db.$transaction(async (tx) => {
    const p = await tx.sponsorshipProposal.create({
      data: {
        organisationId: m.organisationId,
        campaignId: d.campaignId,
        submittedById: actor.userId,
        type: d.type as ProposalType,
        message: d.message,
        proposedAmountMinor: amount,
      },
    });
    await recordStatusChange(tx, {
      entityType: "PROPOSAL",
      entityId: p.id,
      from: null,
      to: "SUBMITTED",
      actorId: actor.userId,
    });
    await audit(
      {
        actorId: actor.userId,
        action: "sponsor.proposal_submit",
        entityType: "SponsorshipProposal",
        entityId: p.id,
      },
      tx,
    );
    await notify(tx, {
      userId: actor.userId,
      to: actor.email,
      template: "sponsor_enquiry_received",
      params: { name: actor.name },
      dedupeKey: `proposal-received:${p.id}`,
    });
    await notifyRole(tx, "CASE_MANAGER", {
      title: "New sponsor enquiry",
      body: `${m.organisation.name} submitted a ${d.type.toLowerCase().replace(/_/g, " ")}.`,
      path: "/staff/sponsors",
      dedupeKey: `proposal:${p.id}`,
    });
    return p;
  });
}

export async function respondToProposal(
  actor: Actor,
  proposalId: string,
  status: "IN_DISCUSSION" | "DECLINED",
  response: string,
) {
  const a = requirePermission(actor, "sponsor.review");
  if (response.trim().length < 5) throw invalid("Write a response to the sponsor.");
  await db.$transaction(async (tx) => {
    const p = await tx.sponsorshipProposal.findUnique({
      where: { id: proposalId },
      include: { organisation: { include: { members: { include: { user: true } } } } },
    });
    if (!p) throw notFound();
    if (["DECLINED", "WITHDRAWN", "CONVERTED_TO_AGREEMENT"].includes(p.status))
      throw conflict("This proposal is closed.");
    await tx.sponsorshipProposal.update({
      where: { id: p.id },
      data: { status, staffResponse: response.trim(), handledById: a.userId },
    });
    await recordStatusChange(tx, {
      entityType: "PROPOSAL",
      entityId: p.id,
      from: p.status,
      to: status,
      actorId: a.userId,
    });
    await audit(
      {
        actorId: a.userId,
        action: "sponsor.proposal_respond",
        entityType: "SponsorshipProposal",
        entityId: p.id,
        metadata: { status },
      },
      tx,
    );
    for (const m of p.organisation.members)
      await notify(tx, {
        userId: m.userId,
        to: m.user.email,
        template: "sponsor_status_changed",
        params: { name: m.user.name },
        dedupeKey: `proposal-resp:${p.id}:${Date.now()}`,
      });
  });
}

export const agreementSchema = z.object({
  pledgedAmount: z.string().optional(),
  inKindDescription: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => v || null),
  terms: z
    .string()
    .trim()
    .min(
      40,
      "Set out the agreement terms, including reporting, branding limits and the refund/unspent-funds policy.",
    )
    .max(8000),
  brandingPermitted: z.preprocess((v) => v === "on" || v === true, z.boolean()),
});

/** Staff prepare an offer (agreement DRAFT) from a proposal. */
export async function prepareAgreement(actor: Actor, proposalId: string, raw: unknown) {
  const a = requirePermission(actor, "sponsor.agreement.prepare");
  const d = agreementSchema.parse(raw);
  const pledged = d.pledgedAmount ? parseMajorToMinor(d.pledgedAmount) : 0n;
  if (d.pledgedAmount && pledged === null) throw invalid("Enter the pledged amount in naira.");
  return db.$transaction(async (tx) => {
    const p = await tx.sponsorshipProposal.findUnique({
      where: { id: proposalId },
      include: { organisation: true, campaign: true },
    });
    if (!p || !p.campaign) throw conflict("Only proposals linked to a specific case can become agreements.");
    if (p.organisation.status !== "APPROVED") throw conflict("The organisation is not approved.");
    if (["DECLINED", "WITHDRAWN", "CONVERTED_TO_AGREEMENT"].includes(p.status))
      throw conflict("This proposal is closed.");
    if ((pledged ?? 0n) === 0n && !d.inKindDescription)
      throw invalid("Enter a pledged amount or describe the in-kind support.");
    const net = p.campaign.confirmedAmountMinor - p.campaign.refundedAmountMinor;
    const openPledges = await tx.sponsorshipAgreement.aggregate({
      where: { campaignId: p.campaign.id, status: { in: ["APPROVED", "SIGNED"] } },
      _sum: { pledgedAmountMinor: true },
    });
    if (
      (pledged ?? 0n) > max0(p.campaign.targetAmountMinor - net - (openPledges._sum.pledgedAmountMinor ?? 0n))
    ) {
      throw conflict("The pledge exceeds the remaining unfunded and unpledged budget for this case.");
    }
    const ag = await tx.sponsorshipAgreement.create({
      data: {
        organisationId: p.organisationId,
        campaignId: p.campaign.id,
        proposalId: p.id,
        pledgedAmountMinor: pledged ?? 0n,
        inKindDescription: d.inKindDescription,
        terms: d.terms,
        brandingPermitted: d.brandingPermitted,
        preparedById: a.userId,
      },
    });
    await tx.sponsorshipProposal.update({
      where: { id: p.id },
      data: { status: "CONVERTED_TO_AGREEMENT", handledById: a.userId },
    });
    await recordStatusChange(tx, {
      entityType: "AGREEMENT",
      entityId: ag.id,
      from: null,
      to: "DRAFT",
      actorId: a.userId,
    });
    await audit(
      {
        actorId: a.userId,
        action: "sponsor.agreement_prepare",
        entityType: "SponsorshipAgreement",
        entityId: ag.id,
      },
      tx,
    );
    return ag;
  });
}

/** Independent internal approval of an agreement (approver ≠ preparer; DB constraint too). */
export async function approveAgreement(actor: Actor, agreementId: string) {
  const a = requirePermission(actor, "sponsor.agreement.approve");
  await db.$transaction(async (tx) => {
    const ag = await tx.sponsorshipAgreement.findUnique({
      where: { id: agreementId },
      include: { organisation: { include: { members: { include: { user: true } } } } },
    });
    if (!ag) throw notFound();
    if (ag.status !== "DRAFT") throw conflict("This agreement is not awaiting approval.");
    if (ag.preparedById === a.userId)
      throw forbidden("A different staff member must approve an agreement you prepared.");
    await tx.sponsorshipAgreement.update({
      where: { id: ag.id },
      data: { status: "APPROVED", approvedById: a.userId, approvedAt: new Date() },
    });
    await recordStatusChange(tx, {
      entityType: "AGREEMENT",
      entityId: ag.id,
      from: "DRAFT",
      to: "APPROVED",
      actorId: a.userId,
    });
    await audit(
      {
        actorId: a.userId,
        action: "sponsor.agreement_approve",
        entityType: "SponsorshipAgreement",
        entityId: ag.id,
      },
      tx,
    );
    for (const m of ag.organisation.members)
      await notify(tx, {
        userId: m.userId,
        to: m.user.email,
        template: "sponsor_status_changed",
        params: { name: m.user.name },
        dedupeKey: `agreement-approved:${ag.id}:${m.userId}`,
      });
  });
}

/** The sponsor's authorised representative signs (records acceptance; a wet/e-signature copy may also be kept offline). */
export async function signAgreement(actor: Actor, agreementId: string, signedByName: string) {
  const m = await approvedMembership(actor);
  if (!m.isAuthorisedRepresentative)
    throw forbidden("Only an authorised representative of your organisation can sign.");
  if (signedByName.trim().length < 3) throw invalid("Type your full name to sign.");
  await db.$transaction(async (tx) => {
    const ag = await tx.sponsorshipAgreement.findUnique({ where: { id: agreementId } });
    if (!ag || ag.organisationId !== m.organisationId) throw notFound();
    if (ag.status !== "APPROVED") throw conflict("This agreement is not ready for signature.");
    await tx.sponsorshipAgreement.update({
      where: { id: ag.id },
      data: {
        status: "SIGNED",
        signedAt: new Date(),
        signedByUserId: actor.userId,
        signedByName: signedByName.trim(),
      },
    });
    await recordStatusChange(tx, {
      entityType: "AGREEMENT",
      entityId: ag.id,
      from: "APPROVED",
      to: "SIGNED",
      actorId: actor.userId,
    });
    await audit(
      {
        actorId: actor.userId,
        action: "sponsor.agreement_sign",
        entityType: "SponsorshipAgreement",
        entityId: ag.id,
      },
      tx,
    );
    await notifyRole(tx, "FINANCE_OFFICER", {
      title: "Sponsorship agreement signed",
      body: "A sponsor signed an agreement. Pledged funds are not yet received.",
      path: "/staff/sponsors",
      dedupeKey: `agreement-signed:${ag.id}`,
    });
  });
}

/** Sponsor pays (part of) a signed pledge online through the payment provider. */
export async function initiateSponsorPayment(actor: Actor, agreementId: string, amountInput: string) {
  const m = await approvedMembership(actor);
  const ag = await db.sponsorshipAgreement.findUnique({
    where: { id: agreementId },
    include: { campaign: true },
  });
  if (!ag || ag.organisationId !== m.organisationId) throw notFound();
  if (ag.status !== "SIGNED") throw conflict("Payments can only be made against a signed agreement.");
  const amount = parseMajorToMinor(amountInput);
  const paid = await db.payment.aggregate({
    where: { agreementId, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "PENDING"] } },
    _sum: { amountMinor: true },
  });
  const outstanding = max0(ag.pledgedAmountMinor - (paid._sum.amountMinor ?? 0n));
  if (!amount || amount <= 0n || amount > outstanding)
    throw invalid(`Enter an amount up to the outstanding pledge.`);
  const provider = paymentProvider();
  const p = await db.payment.create({
    data: {
      reference: newPaymentReference(),
      provider: provider.name,
      kind: "SPONSOR_PAYMENT",
      campaignId: ag.campaignId,
      agreementId: ag.id,
      payerUserId: actor.userId,
      payerEmail: actor.email,
      payerName: m.organisation.name,
      amountMinor: amount,
      currency: ag.campaign.currency,
    },
  });
  const { checkoutUrl } = await provider.initialize({
    reference: p.reference,
    amountMinor: amount,
    currency: p.currency,
    email: actor.email,
    callbackUrl: `${env().APP_BASE_URL}/give/return?reference=${p.reference}`,
    metadata: { payment_reference: p.reference, kind: "SPONSOR_PAYMENT" },
  });
  await db.payment.update({ where: { id: p.id }, data: { status: "PENDING", checkoutUrl } });
  await audit({
    actorId: actor.userId,
    action: "sponsor.payment_start",
    entityType: "Payment",
    entityId: p.id,
  });
  return { checkoutUrl };
}

export async function sponsorDashboard(actor: Actor) {
  const m = await db.organisationMember.findFirst({
    where: { userId: actor.userId },
    include: { organisation: true },
  });
  requirePermission(actor, "sponsor.own");
  if (!m) return null;
  const [proposals, agreements, inKind] = await Promise.all([
    db.sponsorshipProposal.findMany({
      where: { organisationId: m.organisationId },
      orderBy: { createdAt: "desc" },
      include: { campaign: { select: { title: true, publicId: true } } },
    }),
    db.sponsorshipAgreement.findMany({
      where: { organisationId: m.organisationId },
      orderBy: { createdAt: "desc" },
      include: {
        campaign: {
          select: { id: true, title: true, publicId: true, status: true, targetAmountMinor: true },
        },
        payments: {
          select: { amountMinor: true, refundedMinor: true, status: true, reference: true, createdAt: true },
        },
      },
    }),
    db.inKindContribution.findMany({
      where: { organisationId: m.organisationId },
      orderBy: { createdAt: "desc" },
      include: { campaign: { select: { title: true } } },
    }),
  ]);
  return { membership: m, proposals, agreements, inKind };
}

/**
 * Sponsor report for one agreement: sponsor contribution, approved expenditure, timeline,
 * delivery evidence summary, outcome, approved SPONSOR_REPORT stories. No personal data.
 */
export async function sponsorReport(actor: Actor, agreementId: string) {
  const m = await approvedMembership(actor);
  const ag = await db.sponsorshipAgreement.findUnique({
    where: { id: agreementId },
    include: {
      campaign: {
        select: {
          id: true,
          title: true,
          publicId: true,
          status: true,
          targetAmountMinor: true,
          confirmedAmountMinor: true,
          refundedAmountMinor: true,
          locationLabel: true,
          intervention: {
            select: {
              status: true,
              plannedOutcome: true,
              outcomeSummary: true,
              completedAt: true,
              approvedBudgetMinor: true,
              beneficiaryFeedback: true,
              feedbackConsentToShare: true,
              deliveries: { select: { description: true, deliveredAt: true } },
              disbursements: {
                where: { status: "PAID" },
                select: { amountMinor: true, purpose: true, paidAt: true },
              },
            },
          },
          stories: {
            where: { status: "PUBLISHED", channel: { in: ["SPONSOR_REPORT", "CAMPAIGN_PAGE"] } },
            select: { title: true, body: true, publishedAt: true, type: true },
          },
        },
      },
      payments: {
        where: { status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] } },
        select: { amountMinor: true, refundedMinor: true, paidAt: true, reference: true },
      },
    },
  });
  if (!ag || ag.organisationId !== m.organisationId) throw notFound();
  const history = await db.statusHistory.findMany({
    where: { entityType: "CAMPAIGN", entityId: ag.campaign.id },
    select: { toStatus: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const iv = ag.campaign.intervention;
  return {
    agreement: ag,
    timeline: history,
    feedback: iv?.feedbackConsentToShare ? iv.beneficiaryFeedback : null,
  };
}

// ─── In-kind ───

export const inKindSchema = z.object({
  campaignId: z.string().min(1),
  itemCategory: z.enum([
    "FURNITURE",
    "FOOD",
    "BUILDING_MATERIALS",
    "ACCOMMODATION",
    "BUSINESS_EQUIPMENT",
    "TRAINING",
    "PROFESSIONAL_SERVICES",
    "TRANSPORT",
    "OTHER",
  ]),
  description: z.string().trim().min(5).max(1000),
  quantity: z.coerce.number().int().min(1).max(100000),
  unit: z.string().trim().min(1).max(30).default("items"),
  estimatedValue: z.string().optional(),
  valuationBasis: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
  deliveryArrangements: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => v || null),
});

export async function offerInKind(actor: Actor, raw: unknown) {
  const m = await approvedMembership(actor);
  const d = inKindSchema.parse(raw);
  const est = d.estimatedValue ? parseMajorToMinor(d.estimatedValue) : null;
  if (est !== null && !d.valuationBasis)
    throw invalid("Explain how the estimated value was worked out (e.g. invoice, market price).");
  const c = await db.campaign.findUnique({ where: { id: d.campaignId } });
  if (!c || !c.acceptsInKind || !PUBLIC_CAMPAIGN_STATUSES.includes(c.status))
    throw conflict("This case is not accepting in-kind support.");
  return db.$transaction(async (tx) => {
    const ik = await tx.inKindContribution.create({
      data: {
        organisationId: m.organisationId,
        offeredById: actor.userId,
        campaignId: c.id,
        itemCategory: d.itemCategory,
        description: d.description,
        quantity: d.quantity,
        unit: d.unit,
        estimatedValueMinor: est,
        valuationBasis: d.valuationBasis,
        deliveryArrangements: d.deliveryArrangements,
      },
    });
    await recordStatusChange(tx, {
      entityType: "IN_KIND",
      entityId: ik.id,
      from: null,
      to: "OFFERED",
      actorId: actor.userId,
    });
    await audit(
      { actorId: actor.userId, action: "inkind.offer", entityType: "InKindContribution", entityId: ik.id },
      tx,
    );
    await notifyRole(tx, "CASE_MANAGER", {
      title: "In-kind offer received",
      body: `${m.organisation.name} offered ${d.quantity} ${d.unit}: ${d.description.slice(0, 80)}`,
      path: "/staff/in-kind",
      dedupeKey: `inkind:${ik.id}`,
    });
    return ik;
  });
}

/** Staff accept/decline an offer, or confirm (partial) delivery. Delivery is the only state that counts as donated. */
export async function updateInKind(
  actor: Actor,
  id: string,
  action: "ACCEPT" | "DECLINE" | "CANCEL" | "DELIVER",
  input: { quantityDelivered?: number; note?: string },
) {
  const a = requirePermission(actor, "inkind.manage");
  await db.$transaction(async (tx) => {
    const ik = await tx.inKindContribution.findUnique({ where: { id } });
    if (!ik) throw notFound();
    let to = ik.status;
    const data: Prisma.InKindContributionUpdateInput = {};
    if (action === "ACCEPT" && ik.status === "OFFERED") {
      to = "ACCEPTED";
      data.reviewedById = a.userId;
    } else if (action === "DECLINE" && ik.status === "OFFERED") {
      to = "DECLINED";
      data.reviewedById = a.userId;
    } else if (action === "CANCEL" && ["OFFERED", "ACCEPTED"].includes(ik.status)) to = "CANCELLED";
    else if (action === "DELIVER" && ["ACCEPTED", "PARTIALLY_DELIVERED"].includes(ik.status)) {
      const q = input.quantityDelivered ?? 0;
      if (q <= 0 || ik.quantityDelivered + q > ik.quantity)
        throw invalid(`Enter a delivered quantity between 1 and ${ik.quantity - ik.quantityDelivered}.`);
      if (!input.note || input.note.trim().length < 5)
        throw invalid("Describe the delivery evidence (who received it, when, condition).");
      const total = ik.quantityDelivered + q;
      to = total >= ik.quantity ? "DELIVERED" : "PARTIALLY_DELIVERED";
      data.quantityDelivered = total;
      data.deliveredAt = new Date();
      data.deliveryConfirmedById = a.userId;
    } else throw conflict(`Cannot ${action.toLowerCase()} an in-kind contribution that is ${ik.status}.`);
    await tx.inKindContribution.update({ where: { id }, data: { ...data, status: to } });
    await recordStatusChange(tx, {
      entityType: "IN_KIND",
      entityId: id,
      from: ik.status,
      to,
      actorId: a.userId,
      reason: input.note ?? null,
    });
    await audit(
      {
        actorId: a.userId,
        action: `inkind.${action.toLowerCase()}`,
        entityType: "InKindContribution",
        entityId: id,
      },
      tx,
    );
  });
}

export async function listOrganisationsForReview(actor: Actor) {
  requirePermission(actor, "sponsor.review");
  const [orgs, proposals, agreements] = await Promise.all([
    db.organisation.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
      include: { members: { include: { user: { select: { name: true, email: true } } } } },
    }),
    db.sponsorshipProposal.findMany({
      where: { status: { in: ["SUBMITTED", "IN_DISCUSSION"] } },
      orderBy: { createdAt: "asc" },
      include: {
        organisation: { select: { name: true, status: true } },
        campaign: { select: { title: true, publicId: true } },
      },
    }),
    db.sponsorshipAgreement.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { organisation: { select: { name: true } }, campaign: { select: { id: true, title: true } } },
    }),
  ]);
  return { orgs, proposals, agreements };
}

export async function listInKindForStaff(actor: Actor) {
  requirePermission(actor, "inkind.manage");
  return db.inKindContribution.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      organisation: { select: { name: true } },
      campaign: { select: { title: true, publicId: true } },
    },
  });
}
