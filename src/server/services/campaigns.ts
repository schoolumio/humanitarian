import type { CampaignStatus, CampaignVisibility, Prisma } from "@prisma/client";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { audit, recordStatusChange } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { newCampaignPublicId } from "@/lib/ids";
import { max0, parseMajorToMinor, sum } from "@/lib/money";
import { effectiveConsents } from "@/lib/consent";
import { CAMPAIGN_TRANSITIONS, DONATABLE_STATUSES, PUBLIC_CAMPAIGN_STATUSES } from "@/lib/workflow/campaign";
import { canTransition, InvalidTransitionError } from "@/lib/workflow/machine";
import { fundBalance } from "@/lib/ledger/journal";
import { notify, notifyRole } from "../notifications";
import { requirePermission, type Actor } from "../actor";
import { raiseRiskAlert } from "./risk";

export const campaignSchema = z.object({
  title: z.string().trim().min(8, "Use a clear, respectful title.").max(120),
  summary: z.string().trim().min(40, "Write an approved summary (at least a few sentences).").max(3000),
  locationLabel: z.string().trim().min(3).max(80),
  interventionSummary: z.string().trim().min(10).max(2000),
  verificationSummary: z.string().trim().min(20, "Explain publicly how this case was verified.").max(2000),
  visibility: z.enum(["PUBLIC", "SPONSORS_ONLY"]),
  acceptsDonations: z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean()),
  acceptsSponsorship: z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean()),
  acceptsInKind: z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean()),
  endsAt: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : null))
    .refine(
      (d) => !d || (!isNaN(d.getTime()) && d.getTime() > Date.now()),
      "The end date must be in the future.",
    ),
  budgetLines: z
    .array(z.object({ description: z.string().trim().min(2).max(200), amount: z.string() }))
    .min(1, "Add at least one budget line.")
    .max(30),
});

const SENSATIONAL = /\b(desperate|dying|pathetic|helpless|miserable|begging|tragic)\b/i;

/** Privacy & dignity guard for public text (unit tested). */
export function publicTextProblems(
  text: string,
  applicant: { fullName: string | null; phone: string | null; community: string | null },
): string[] {
  const problems: string[] = [];
  const lower = text.toLowerCase();
  const parts = (applicant.fullName ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p.length >= 3);
  if (parts.length >= 2 && parts.filter((p) => lower.includes(p)).length >= 2)
    problems.push("The text appears to contain the applicant's full name.");
  const digits = (applicant.phone ?? "").replace(/\D/g, "").slice(-9);
  if (digits.length === 9 && text.replace(/\D/g, "").includes(digits))
    problems.push("The text appears to contain the applicant's phone number.");
  if (
    applicant.community &&
    applicant.community.length > 3 &&
    lower.includes(applicant.community.toLowerCase())
  ) {
    problems.push("The text names the applicant's exact community. Use a general location instead.");
  }
  if (SENSATIONAL.test(text)) problems.push("Avoid sensational or undignified language.");
  return problems;
}

function parseBudget(lines: { description: string; amount: string }[]) {
  return lines.map((l, i) => {
    const amount = parseMajorToMinor(l.amount);
    if (!amount || amount <= 0n) throw invalid(`Budget line ${i + 1}: enter an amount in naira.`);
    return { description: l.description, amountMinor: amount, sortOrder: i };
  });
}

export async function createCampaign(actor: Actor, applicationId: string, raw: unknown) {
  const a = requirePermission(actor, "campaign.manage");
  const d = campaignSchema.parse(raw);
  const lines = parseBudget(d.budgetLines);
  const target = sum(lines.map((l) => l.amountMinor));
  return db.$transaction(async (tx) => {
    const app = await tx.application.findUnique({ where: { id: applicationId } });
    if (!app) throw notFound();
    if (app.applicantId === a.userId) throw forbidden("You cannot manage a campaign for your own request.");
    if (app.status !== "APPROVED") throw conflict("Only approved cases can become campaigns.");
    if (await tx.campaign.findUnique({ where: { applicationId } }))
      throw conflict("This case already has a campaign.");
    const decision = await tx.caseDecision.findFirst({
      where: { applicationId, decision: "APPROVED" },
      orderBy: { createdAt: "desc" },
    });
    if (decision?.approvedAmountMinor && target > decision.approvedAmountMinor) {
      throw conflict(
        "The campaign budget exceeds the approved amount. Record a new decision for a higher amount first.",
      );
    }
    const problems = publicTextProblems(
      `${d.title}\n${d.summary}\n${d.interventionSummary}\n${d.locationLabel}`,
      app,
    );
    if (problems.length) throw invalid(problems.join(" "));
    const lastVerification = await tx.statusHistory.findFirst({
      where: { entityType: "APPLICATION", entityId: applicationId, toStatus: "APPROVED" },
      orderBy: { createdAt: "desc" },
    });
    const campaign = await tx.campaign.create({
      data: {
        publicId: newCampaignPublicId(),
        applicationId,
        categoryId: app.categoryId!,
        title: d.title,
        summary: d.summary,
        locationLabel: d.locationLabel,
        interventionSummary: d.interventionSummary,
        verificationSummary: d.verificationSummary,
        verifiedAt: lastVerification?.createdAt ?? new Date(),
        targetAmountMinor: target,
        visibility: d.visibility,
        acceptsDonations: d.acceptsDonations,
        acceptsSponsorship: d.acceptsSponsorship,
        acceptsInKind: d.acceptsInKind,
        endsAt: d.endsAt,
        createdById: a.userId,
        budgetLines: { create: lines },
      },
    });
    await recordStatusChange(tx, {
      entityType: "CAMPAIGN",
      entityId: campaign.id,
      from: null,
      to: "DRAFT",
      actorId: a.userId,
    });
    await audit(
      { actorId: a.userId, action: "campaign.create", entityType: "Campaign", entityId: campaign.id },
      tx,
    );
    return campaign;
  });
}

export async function updateCampaign(actor: Actor, campaignId: string, raw: unknown) {
  const a = requirePermission(actor, "campaign.manage");
  const d = campaignSchema.parse(raw);
  const lines = parseBudget(d.budgetLines);
  const target = sum(lines.map((l) => l.amountMinor));
  await db.$transaction(async (tx) => {
    const c = await tx.campaign.findUnique({ where: { id: campaignId }, include: { application: true } });
    if (!c) throw notFound();
    if (c.application.applicantId === a.userId) throw forbidden();
    if (!["DRAFT", "READY_FOR_PUBLICATION"].includes(c.status)) {
      throw conflict(
        "Published campaigns cannot be edited directly. Material changes to the plan go through an intervention budget change.",
      );
    }
    const problems = publicTextProblems(
      `${d.title}\n${d.summary}\n${d.interventionSummary}\n${d.locationLabel}`,
      c.application,
    );
    if (problems.length) throw invalid(problems.join(" "));
    await tx.campaignBudgetLine.deleteMany({ where: { campaignId } });
    await tx.campaign.update({
      where: { id: campaignId },
      data: {
        title: d.title,
        summary: d.summary,
        locationLabel: d.locationLabel,
        interventionSummary: d.interventionSummary,
        verificationSummary: d.verificationSummary,
        visibility: d.visibility,
        acceptsDonations: d.acceptsDonations,
        acceptsSponsorship: d.acceptsSponsorship,
        acceptsInKind: d.acceptsInKind,
        endsAt: d.endsAt,
        targetAmountMinor: target,
        status: "DRAFT",
        readyById: null,
        budgetLines: { create: lines },
      },
    });
    if (c.status !== "DRAFT")
      await recordStatusChange(tx, {
        entityType: "CAMPAIGN",
        entityId: c.id,
        from: c.status,
        to: "DRAFT",
        actorId: a.userId,
        reason: "Edited",
      });
    await audit(
      { actorId: a.userId, action: "campaign.update", entityType: "Campaign", entityId: campaignId },
      tx,
    );
  });
}

/** Consent and safeguarding gate for (re)publishing a campaign (pure, unit tested). */
export function campaignPublicationBlockers(input: {
  visibility: CampaignVisibility;
  consents: Map<string, boolean>;
  openSafeguarding: boolean;
  budgetTotal: bigint;
  target: bigint;
  applicationStatus: string;
}): string[] {
  const b: string[] = [];
  if (input.applicationStatus !== "APPROVED") b.push("The underlying case is no longer approved.");
  if (input.visibility === "PUBLIC" && input.consents.get("PUBLIC_CAMPAIGN_PAGE") !== true) {
    b.push(
      "The beneficiary has not consented to a public campaign page. Use sponsors-only visibility or seek consent.",
    );
  }
  if (input.visibility === "SPONSORS_ONLY" && input.consents.get("SPONSOR_REPORTING") !== true) {
    b.push("The beneficiary has not consented to their case being shared with sponsors.");
  }
  if (input.openSafeguarding) b.push("An open safeguarding record restricts publication.");
  if (input.budgetTotal !== input.target) b.push("Budget lines must add up to the funding target.");
  return b;
}

async function blockersFor(tx: Tx, campaignId: string) {
  const c = await tx.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { budgetLines: true, application: true },
  });
  const consents = effectiveConsents(
    await tx.applicantConsent.findMany({ where: { applicationId: c.applicationId } }),
  );
  const openSafeguarding =
    (await tx.safeguardingRecord.count({
      where: { applicationId: c.applicationId, status: { not: "RESOLVED" }, restrictPublication: true },
    })) > 0;
  return {
    c,
    blockers: campaignPublicationBlockers({
      visibility: c.visibility,
      consents,
      openSafeguarding,
      budgetTotal: sum(c.budgetLines.map((l) => l.amountMinor)),
      target: c.targetAmountMinor,
      applicationStatus: c.application.status,
    }),
  };
}

export async function getPublicationBlockers(actor: Actor, campaignId: string) {
  requirePermission(actor, "campaign.manage");
  return (await blockersFor(db, campaignId)).blockers;
}

async function moveCampaign(
  tx: Tx,
  a: Actor,
  c: { id: string; status: CampaignStatus },
  to: CampaignStatus,
  reason: string,
  data: Prisma.CampaignUpdateInput = {},
) {
  if (!canTransition(CAMPAIGN_TRANSITIONS, c.status, to, { permissions: a.permissions })) {
    if (!CAMPAIGN_TRANSITIONS[c.status]?.[to]) throw new InvalidTransitionError("Campaign", c.status, to);
    throw forbidden();
  }
  const res = await tx.campaign.updateMany({ where: { id: c.id, status: c.status }, data: { status: to } });
  if (!res.count) throw conflict("The campaign changed while you were working. Reload and try again.");
  if (Object.keys(data).length) await tx.campaign.update({ where: { id: c.id }, data });
  await recordStatusChange(tx, {
    entityType: "CAMPAIGN",
    entityId: c.id,
    from: c.status,
    to,
    actorId: a.userId,
    reason,
  });
  await audit(
    {
      actorId: a.userId,
      action: "campaign.transition",
      entityType: "Campaign",
      entityId: c.id,
      metadata: { from: c.status, to },
    },
    tx,
  );
}

export async function markReadyForPublication(actor: Actor, campaignId: string) {
  const a = requirePermission(actor, "campaign.manage");
  await db.$transaction(async (tx) => {
    const { c, blockers } = await blockersFor(tx, campaignId);
    if (c.application.applicantId === a.userId) throw forbidden();
    if (blockers.length) throw conflict(blockers.join(" "));
    await moveCampaign(tx, a, c, "READY_FOR_PUBLICATION", "Prepared for publication", {
      readyById: a.userId,
    });
  });
}

/**
 * Publication is a four-eyes control: the person who publishes must not be the person
 * who prepared the campaign. Consent and safeguarding are re-checked at this moment.
 */
export async function publishCampaign(actor: Actor, campaignId: string) {
  const a = requirePermission(actor, "campaign.publish");
  await db.$transaction(async (tx) => {
    const { c, blockers } = await blockersFor(tx, campaignId);
    if (c.application.applicantId === a.userId) throw forbidden();
    if (c.readyById === a.userId)
      throw forbidden("A different staff member must publish a campaign you prepared.");
    if (blockers.length) throw conflict(blockers.join(" "));
    const now = new Date();
    await moveCampaign(tx, a, c, "PUBLISHED", "Published", {
      publishedAt: now,
      startsAt: c.startsAt ?? now,
      publishedById: a.userId,
    });
    const applicant = await tx.user.findUniqueOrThrow({ where: { id: c.application.applicantId } });
    await notify(tx, {
      userId: applicant.id,
      to: applicant.email,
      template: "campaign_published",
      params: { name: applicant.name, reference: c.application.reference },
      dedupeKey: `campaign-published:${c.id}`,
    });
  });
}

export async function returnToDraft(actor: Actor, campaignId: string, reason: string) {
  const a = requirePermission(actor, "campaign.manage");
  await db.$transaction(async (tx) => {
    const c = await tx.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    await moveCampaign(tx, a, c, "DRAFT", reason || "Returned to draft", { readyById: null });
  });
}

export async function closeFunding(actor: Actor, campaignId: string, reason: string) {
  const a = requirePermission(actor, "campaign.manage");
  if (reason.trim().length < 5) throw invalid("Explain why funding is being closed below target.");
  await db.$transaction(async (tx) => {
    const c = await tx.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    await moveCampaign(tx, a, c, "PARTIALLY_FUNDED", reason.trim());
  });
}

/**
 * Cancel a campaign. Money already received is NOT moved anywhere automatically: finance
 * is alerted and must follow the published funding policy (refund contributors, or
 * re-direct only with documented donor consent).
 */
export async function cancelCampaign(actor: Actor, campaignId: string, reason: string) {
  const a = requirePermission(actor, "campaign.manage");
  if (reason.trim().length < 10) throw invalid("Explain why the campaign is being cancelled.");
  await db.$transaction(async (tx) => {
    const c = await tx.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    await moveCampaign(tx, a, c, "CANCELLED", reason.trim());
    const balance = await fundBalance(tx, c.id);
    if (balance > 0n) {
      await raiseRiskAlert(tx, {
        type: "UNSPENT_FUNDS_ON_CANCELLATION",
        severity: "HIGH",
        campaignId: c.id,
        dedupeKey: `cancel-funds:${c.id}`,
        details: `Campaign ${c.publicId} was cancelled with a restricted balance. Finance must apply the published refund/unspent-funds policy.`,
      });
      await notifyRole(tx, "FINANCE_OFFICER", {
        title: "Cancelled campaign holds restricted funds",
        body: `Campaign ${c.publicId} needs an unspent-funds decision.`,
        path: `/staff/campaigns/${c.id}`,
        dedupeKey: `cancel-funds:${c.id}`,
      });
    }
  });
}

// ─── Read models ───

export const publicCampaignSelect = {
  publicId: true,
  title: true,
  summary: true,
  locationLabel: true,
  interventionSummary: true,
  verificationSummary: true,
  verifiedAt: true,
  targetAmountMinor: true,
  confirmedAmountMinor: true,
  refundedAmountMinor: true,
  currency: true,
  status: true,
  acceptsDonations: true,
  acceptsSponsorship: true,
  acceptsInKind: true,
  publishedAt: true,
  endsAt: true,
  category: { select: { name: true, slug: true } },
} satisfies Prisma.CampaignSelect;

export type PublicCampaignCard = Prisma.CampaignGetPayload<{ select: typeof publicCampaignSelect }>;

export function fundingFigures(c: {
  targetAmountMinor: bigint;
  confirmedAmountMinor: bigint;
  refundedAmountMinor: bigint;
}) {
  const net = c.confirmedAmountMinor - c.refundedAmountMinor;
  return { net, remaining: max0(c.targetAmountMinor - net), excess: max0(net - c.targetAmountMinor) };
}

export const publicFilters = z.object({
  category: z.string().max(60).optional(),
  q: z.string().trim().max(80).optional(),
  status: z.enum(["open", "funded", "completed", "all"]).default("open"),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

export async function listPublicCampaigns(raw: unknown) {
  const f = publicFilters.parse(raw);
  const statuses: CampaignStatus[] =
    f.status === "open"
      ? [...DONATABLE_STATUSES]
      : f.status === "funded"
        ? ["FULLY_FUNDED", "PARTIALLY_FUNDED", "INTERVENTION_IN_PROGRESS", "OUTCOME_REVIEW"]
        : f.status === "completed"
          ? ["COMPLETED"]
          : [...PUBLIC_CAMPAIGN_STATUSES];
  const where: Prisma.CampaignWhereInput = { visibility: "PUBLIC", status: { in: statuses } };
  if (f.category) where.category = { slug: f.category };
  if (f.q)
    where.OR = [
      { title: { contains: f.q, mode: "insensitive" } },
      { locationLabel: { contains: f.q, mode: "insensitive" } },
    ];
  const pageSize = 12;
  const [rows, total] = await Promise.all([
    db.campaign.findMany({
      where,
      select: publicCampaignSelect,
      orderBy: { publishedAt: "desc" },
      skip: (f.page - 1) * pageSize,
      take: pageSize,
    }),
    db.campaign.count({ where }),
  ]);
  return { rows, total, page: f.page, pageSize, filters: f };
}

/** Public campaign page. Only public-safe fields; nothing from the private application. */
export async function getPublicCampaign(publicId: string) {
  if (!/^[a-z0-9]{6,20}$/.test(publicId)) return null;
  const c = await db.campaign.findUnique({
    where: { publicId },
    select: {
      ...publicCampaignSelect,
      id: true,
      visibility: true,
      budgetLines: { select: { description: true, amountMinor: true }, orderBy: { sortOrder: "asc" } },
      stories: {
        where: { status: "PUBLISHED", channel: "CAMPAIGN_PAGE" },
        orderBy: { publishedAt: "desc" },
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          publishedAt: true,
          media: {
            select: {
              mediaAsset: {
                select: {
                  publicFileId: true,
                  altText: true,
                  caption: true,
                  phase: true,
                  status: true,
                  kind: true,
                },
              },
            },
          },
        },
      },
      agreements: {
        where: { status: { in: ["SIGNED", "FULFILLED"] }, brandingPermitted: true },
        select: { organisation: { select: { publicDisplayName: true, name: true } } },
      },
      inKind: {
        where: { status: { in: ["DELIVERED", "PARTIALLY_DELIVERED"] } },
        select: { description: true, quantityDelivered: true, unit: true },
      },
      intervention: { select: { status: true, outcomeSummary: true, completedAt: true } },
    },
  });
  if (!c || c.visibility !== "PUBLIC" || !PUBLIC_CAMPAIGN_STATUSES.includes(c.status)) return null;
  const fileIds = c.stories
    .flatMap((s) => s.media.map((m) => m.mediaAsset.publicFileId))
    .filter((x): x is string => !!x);
  const files = await db.storedFile.findMany({
    where: { id: { in: fileIds }, visibility: "PUBLIC", deletedAt: null },
    select: { id: true, storageKey: true },
  });
  const { storage } = await import("@/lib/storage");
  const urlFor = Object.fromEntries(files.map((f) => [f.id, storage().publicUrl(f.storageKey)]));
  const supporters = await db.payment.count({
    where: {
      campaignId: c.id,
      status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUND_PENDING", "DISPUTED"] },
    },
  });
  const { id: _id, ...rest } = c;
  return {
    ...rest,
    supporters,
    stories: c.stories.map((s) => ({
      ...s,
      media: s.media
        .map((m) => m.mediaAsset)
        .filter((m) => m.status === "APPROVED" && m.publicFileId && urlFor[m.publicFileId])
        .map((m) => ({
          url: urlFor[m.publicFileId!]!,
          alt: m.altText ?? "",
          caption: m.caption,
          phase: m.phase,
          kind: m.kind,
        })),
    })),
    sponsors: c.agreements.map((x) => x.organisation.publicDisplayName ?? x.organisation.name),
  };
}

export async function getStaffCampaign(actor: Actor, campaignId: string) {
  if (
    !["campaign.manage", "finance.view", "media.manage", "intervention.manage"].some((p) =>
      actor.permissions.has(p as never),
    )
  )
    throw forbidden();
  const c = await db.campaign.findUnique({
    where: { id: campaignId },
    include: {
      budgetLines: { orderBy: { sortOrder: "asc" } },
      category: true,
      application: { select: { id: true, reference: true, applicantId: true, status: true } },
      intervention: true,
      agreements: { include: { organisation: { select: { name: true } } } },
      inKind: true,
    },
  });
  if (!c) throw notFound();
  if (c.application.applicantId === actor.userId) throw forbidden();
  const [history, balance] = await Promise.all([
    db.statusHistory.findMany({
      where: { entityType: "CAMPAIGN", entityId: campaignId },
      orderBy: { createdAt: "desc" },
    }),
    fundBalance(db, campaignId),
  ]);
  return { c, history, balance };
}

export async function listStaffCampaigns(actor: Actor, status?: string) {
  if (
    !["campaign.manage", "finance.view", "media.manage", "intervention.manage"].some((p) =>
      actor.permissions.has(p as never),
    )
  )
    throw forbidden();
  const where: Prisma.CampaignWhereInput = {};
  if (status && status in CAMPAIGN_TRANSITIONS) where.status = status as CampaignStatus;
  return db.campaign.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      publicId: true,
      title: true,
      status: true,
      visibility: true,
      targetAmountMinor: true,
      confirmedAmountMinor: true,
      refundedAmountMinor: true,
      updatedAt: true,
    },
  });
}

/** Approved cases that have no campaign yet. */
export async function approvedCasesWithoutCampaign(actor: Actor) {
  requirePermission(actor, "campaign.manage");
  return db.application.findMany({
    where: { status: "APPROVED", campaign: null, applicantId: { not: actor.userId } },
    select: {
      id: true,
      reference: true,
      decidedAt: true,
      category: { select: { name: true } },
      requestedAmountMinor: true,
    },
    orderBy: { decidedAt: "asc" },
  });
}
