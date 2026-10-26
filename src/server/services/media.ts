import type { ConsentType, MediaKind, MediaPhase, PublicationChannel, StoryType } from "@prisma/client";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { audit, recordStatusChange } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { newStorageKey } from "@/lib/ids";
import { storage } from "@/lib/storage";
import { CHANNEL_CONSENT, effectiveConsents, publicationBlockers } from "@/lib/consent";
import { notifyRole } from "../notifications";
import { requirePermission, type Actor } from "../actor";
import { raiseRiskAlert } from "./risk";

/**
 * Media & stories.
 * - Source media is always private. A public copy is created only when a story that uses it
 *   is PUBLISHED on the campaign page, and removed when that story is withdrawn or consent
 *   is withdrawn.
 * - Every approval and publication re-checks channel-specific consent, child safeguarding
 *   and open safeguarding restrictions.
 * - Editorial approval must come from someone other than the author.
 */

export const mediaSchema = z.object({
  campaignId: z.string().min(1),
  fileId: z.string().min(1),
  kind: z.enum(["PHOTO", "VIDEO", "INTERVIEW_NOTES"]),
  phase: z.enum(["BEFORE", "PROGRESS", "AFTER", "OTHER"]),
  caption: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
  altText: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => v || null),
  depictsBeneficiary: z.preprocess((v) => v === "on" || v === true, z.boolean()),
  depictsMinor: z.preprocess((v) => v === "on" || v === true, z.boolean()),
});

export async function addMediaAsset(actor: Actor, raw: unknown) {
  const a = requirePermission(actor, "media.manage");
  const d = mediaSchema.parse(raw);
  if (d.kind === "PHOTO" && !d.altText)
    throw invalid("Add alternative text describing the photo for screen-reader users.");
  return db.$transaction(async (tx) => {
    const file = await tx.storedFile.findUnique({ where: { id: d.fileId } });
    if (!file || file.purpose !== "MEDIA_ORIGINAL" || file.uploadedById !== a.userId)
      throw invalid("Upload the original file first.");
    const campaign = await tx.campaign.findUnique({ where: { id: d.campaignId } });
    if (!campaign) throw notFound();
    const asset = await tx.mediaAsset.create({
      data: {
        campaignId: d.campaignId,
        kind: d.kind as MediaKind,
        phase: d.phase as MediaPhase,
        originalFileId: file.id,
        caption: d.caption,
        altText: d.altText,
        depictsBeneficiary: d.depictsBeneficiary,
        depictsMinor: d.depictsMinor,
        uploadedById: a.userId,
      },
    });
    await audit({ actorId: a.userId, action: "media.add", entityType: "MediaAsset", entityId: asset.id }, tx);
    if (d.depictsMinor) {
      await notifyRole(tx, "SAFEGUARDING_OFFICER", {
        title: "Media of a child needs safeguarding review",
        body: `Campaign ${campaign.publicId}.`,
        path: "/staff/media",
        dedupeKey: `minor-media:${asset.id}`,
      });
    }
    return asset;
  });
}

export async function reviewMediaAsset(actor: Actor, id: string, approve: boolean) {
  const a = requirePermission(actor, "media.approve");
  await db.$transaction(async (tx) => {
    const m = await tx.mediaAsset.findUnique({ where: { id }, include: { campaign: true } });
    if (!m) throw notFound();
    if (m.uploadedById === a.userId) throw forbidden("A different editor must review media you uploaded.");
    if (approve) {
      const consents = effectiveConsents(
        await tx.applicantConsent.findMany({ where: { applicationId: m.campaign.applicationId } }),
      );
      if (m.depictsBeneficiary && consents.get("FILMING_AND_PHOTOGRAPHY") !== true)
        throw conflict("The beneficiary has not consented to photography/filming.");
      if (
        m.depictsMinor &&
        (consents.get("GUARDIAN_CONSENT_FOR_MINOR") !== true || !m.safeguardingClearedById)
      ) {
        throw conflict("Media of a child needs guardian consent and safeguarding clearance first.");
      }
    }
    await tx.mediaAsset.update({
      where: { id },
      data: { status: approve ? "APPROVED" : "REJECTED", reviewedById: a.userId },
    });
    await recordStatusChange(tx, {
      entityType: "MEDIA_ASSET",
      entityId: id,
      from: m.status,
      to: approve ? "APPROVED" : "REJECTED",
      actorId: a.userId,
    });
    await audit(
      {
        actorId: a.userId,
        action: approve ? "media.approve" : "media.reject",
        entityType: "MediaAsset",
        entityId: id,
      },
      tx,
    );
  });
}

export async function clearMinorMedia(actor: Actor, id: string, note: string) {
  const a = requirePermission(actor, "safeguarding.manage");
  if (note.trim().length < 10) throw invalid("Record the safeguarding assessment.");
  await db.$transaction(async (tx) => {
    const m = await tx.mediaAsset.findUnique({ where: { id } });
    if (!m || !m.depictsMinor) throw notFound();
    await tx.mediaAsset.update({ where: { id }, data: { safeguardingClearedById: a.userId } });
    await audit(
      {
        actorId: a.userId,
        action: "media.safeguarding_clear",
        entityType: "MediaAsset",
        entityId: id,
        metadata: { note: note.trim().slice(0, 300) },
      },
      tx,
    );
  });
}

/** Take media down everywhere we control; external copies are flagged for manual removal. */
export async function takeDownMedia(actor: Actor, id: string, reason: string) {
  const a = requirePermission(actor, "media.manage");
  if (reason.trim().length < 5) throw invalid("Give the reason for the takedown.");
  await db.$transaction(async (tx) => {
    const m = await tx.mediaAsset.findUnique({
      where: { id },
      include: { stories: { include: { story: true } } },
    });
    if (!m) throw notFound();
    await removePublicCopy(tx, m.id);
    await tx.mediaAsset.update({ where: { id }, data: { status: "TAKEN_DOWN" } });
    for (const s of m.stories) {
      if (["PUBLISHED", "APPROVED", "IN_REVIEW"].includes(s.story.status)) {
        await tx.story.update({ where: { id: s.storyId }, data: { status: "UNDER_CONSENT_REVIEW" } });
        await recordStatusChange(tx, {
          entityType: "STORY",
          entityId: s.storyId,
          from: s.story.status,
          to: "UNDER_CONSENT_REVIEW",
          actorId: a.userId,
          reason: `Media taken down: ${reason}`,
        });
      }
    }
    await recordStatusChange(tx, {
      entityType: "MEDIA_ASSET",
      entityId: id,
      from: m.status,
      to: "TAKEN_DOWN",
      actorId: a.userId,
      reason,
    });
    await audit({ actorId: a.userId, action: "media.takedown", entityType: "MediaAsset", entityId: id }, tx);
  });
}

async function ensurePublicCopy(tx: Tx, assetId: string) {
  const m = await tx.mediaAsset.findUniqueOrThrow({ where: { id: assetId } });
  if (m.publicFileId) return;
  const original = await tx.storedFile.findUniqueOrThrow({ where: { id: m.originalFileId } });
  if (original.mimeType === "text/plain") return; // interview notes are never published as files
  if (!["CLEAN", "NOT_SCANNED_DEV"].includes(original.scanStatus))
    throw conflict("A media file has not passed the malware check.");
  const bytes = await storage().get(original.storageKey, "PRIVATE");
  const key = newStorageKey();
  await storage().put(key, bytes, original.mimeType, "PUBLIC");
  const pub = await tx.storedFile.create({
    data: {
      storageKey: key,
      visibility: "PUBLIC",
      purpose: "MEDIA_PUBLIC",
      originalName: original.originalName,
      mimeType: original.mimeType,
      sizeBytes: original.sizeBytes,
      sha256: original.sha256,
      scanStatus: original.scanStatus,
      uploadedById: original.uploadedById,
    },
  });
  await tx.mediaAsset.update({ where: { id: assetId }, data: { publicFileId: pub.id } });
}

async function removePublicCopy(tx: Tx, assetId: string) {
  const m = await tx.mediaAsset.findUniqueOrThrow({ where: { id: assetId } });
  if (!m.publicFileId) return;
  const pub = await tx.storedFile.findUnique({ where: { id: m.publicFileId } });
  if (pub) {
    await storage().delete(pub.storageKey, "PUBLIC");
    await tx.storedFile.update({ where: { id: pub.id }, data: { deletedAt: new Date() } });
  }
  await tx.mediaAsset.update({ where: { id: assetId }, data: { publicFileId: null } });
}

// ─── Stories ───

export const storySchema = z.object({
  campaignId: z.string().min(1),
  type: z.enum([
    "CASE_STORY",
    "PROGRESS_UPDATE",
    "VIDEO_SCRIPT",
    "PHOTO_CAPTION",
    "SPONSOR_ACKNOWLEDGEMENT",
    "COMPLETION_REPORT",
    "SOCIAL_POST",
  ]),
  channel: z.enum([
    "CAMPAIGN_PAGE",
    "SOCIAL_MEDIA",
    "PAID_ADVERTISING",
    "SPONSOR_REPORT",
    "THIRD_PARTY_BRAND",
    "INTERNAL_ONLY",
  ]),
  title: z.string().trim().min(5).max(160),
  body: z.string().trim().min(20).max(10000),
  mediaIds: z.array(z.string()).max(12).default([]),
  aiAssisted: z.preprocess((v) => v === "on" || v === true, z.boolean()),
});

export async function createStory(actor: Actor, raw: unknown) {
  const a = requirePermission(actor, "media.manage");
  const d = storySchema.parse(raw);
  return db.$transaction(async (tx) => {
    const campaign = await tx.campaign.findUnique({ where: { id: d.campaignId } });
    if (!campaign) throw notFound();
    if (d.type === "COMPLETION_REPORT" && campaign.status !== "COMPLETED") {
      throw conflict(
        "A completion report can only be written after the outcome review has completed the intervention.",
      );
    }
    const media = await tx.mediaAsset.findMany({
      where: { id: { in: d.mediaIds }, campaignId: d.campaignId },
    });
    if (media.length !== d.mediaIds.length) throw invalid("Attach media from this campaign only.");
    const s = await tx.story.create({
      data: {
        campaignId: d.campaignId,
        type: d.type as StoryType,
        channel: d.channel as PublicationChannel,
        title: d.title,
        body: d.body,
        authorId: a.userId,
        aiAssisted: d.aiAssisted,
        media: { create: d.mediaIds.map((mediaAssetId) => ({ mediaAssetId })) },
      },
    });
    await tx.storyRevision.create({
      data: { storyId: s.id, editorId: a.userId, title: d.title, body: d.body },
    });
    await recordStatusChange(tx, {
      entityType: "STORY",
      entityId: s.id,
      from: null,
      to: "DRAFT",
      actorId: a.userId,
    });
    await audit({ actorId: a.userId, action: "story.create", entityType: "Story", entityId: s.id }, tx);
    return s;
  });
}

/** Editing keeps a revision; editing approved/published content sends it back to review. */
export async function editStory(actor: Actor, id: string, input: { title: string; body: string }) {
  const a = requirePermission(actor, "media.manage");
  if (input.title.trim().length < 5 || input.body.trim().length < 20)
    throw invalid("Title and body are required.");
  await db.$transaction(async (tx) => {
    const s = await tx.story.findUnique({ where: { id } });
    if (!s) throw notFound();
    if (s.status === "WITHDRAWN") throw conflict("This story was withdrawn.");
    const back = ["APPROVED", "PUBLISHED"].includes(s.status);
    if (s.status === "PUBLISHED" && s.channel === "CAMPAIGN_PAGE") await unpublishMediaFor(tx, id);
    await tx.story.update({
      where: { id },
      data: {
        title: input.title.trim(),
        body: input.body.trim(),
        ...(back ? { status: "IN_REVIEW", approvedById: null, approvedAt: null } : {}),
      },
    });
    await tx.storyRevision.create({
      data: { storyId: id, editorId: a.userId, title: input.title.trim(), body: input.body.trim() },
    });
    if (back)
      await recordStatusChange(tx, {
        entityType: "STORY",
        entityId: id,
        from: s.status,
        to: "IN_REVIEW",
        actorId: a.userId,
        reason: "Edited after approval",
      });
    await audit({ actorId: a.userId, action: "story.edit", entityType: "Story", entityId: id }, tx);
  });
}

export async function submitStoryForReview(actor: Actor, id: string) {
  const a = requirePermission(actor, "media.manage");
  await db.$transaction(async (tx) => {
    const s = await tx.story.findUnique({ where: { id } });
    if (!s || !["DRAFT", "UNDER_CONSENT_REVIEW"].includes(s.status))
      throw conflict("Only drafts can be submitted for review.");
    await tx.story.update({ where: { id }, data: { status: "IN_REVIEW" } });
    await recordStatusChange(tx, {
      entityType: "STORY",
      entityId: id,
      from: s.status,
      to: "IN_REVIEW",
      actorId: a.userId,
    });
  });
}

async function storyBlockers(tx: Tx, storyId: string) {
  const s = await tx.story.findUniqueOrThrow({
    where: { id: storyId },
    include: { campaign: true, media: { include: { mediaAsset: true } } },
  });
  const consents = effectiveConsents(
    await tx.applicantConsent.findMany({ where: { applicationId: s.campaign.applicationId } }),
  );
  const openSafeguarding =
    (await tx.safeguardingRecord.count({
      where: {
        applicationId: s.campaign.applicationId,
        status: { not: "RESOLVED" },
        restrictPublication: true,
      },
    })) > 0;
  const blockers = publicationBlockers({
    channel: s.channel,
    consents,
    openSafeguardingRestriction: openSafeguarding,
    media: s.media.map((m) => ({
      depictsBeneficiary: m.mediaAsset.depictsBeneficiary,
      depictsMinor: m.mediaAsset.depictsMinor,
      status: m.mediaAsset.status,
      safeguardingCleared: !!m.mediaAsset.safeguardingClearedById,
    })),
  });
  if (s.channel === "CAMPAIGN_PAGE" && s.campaign.visibility !== "PUBLIC")
    blockers.push("The campaign is not publicly listed.");
  return { s, blockers };
}

export async function getStoryBlockers(actor: Actor, id: string) {
  requirePermission(actor, "media.manage");
  return (await storyBlockers(db, id)).blockers;
}

export async function approveStory(actor: Actor, id: string) {
  const a = requirePermission(actor, "media.approve");
  await db.$transaction(async (tx) => {
    const { s, blockers } = await storyBlockers(tx, id);
    if (s.status !== "IN_REVIEW") throw conflict("Only stories in review can be approved.");
    if (s.authorId === a.userId) throw forbidden("A different editor must approve a story you wrote.");
    const lastEditor = await tx.storyRevision.findFirst({
      where: { storyId: id },
      orderBy: { createdAt: "desc" },
    });
    if (lastEditor?.editorId === a.userId)
      throw forbidden("You made the latest edit, so a different editor must approve it.");
    if (blockers.length) throw conflict(blockers.join(" "));
    await tx.story.update({
      where: { id },
      data: { status: "APPROVED", approvedById: a.userId, approvedAt: new Date() },
    });
    await recordStatusChange(tx, {
      entityType: "STORY",
      entityId: id,
      from: s.status,
      to: "APPROVED",
      actorId: a.userId,
    });
    await audit({ actorId: a.userId, action: "story.approve", entityType: "Story", entityId: id }, tx);
  });
}

/**
 * Publish an approved story. For the campaign page this makes it live on KindSpring. For
 * external channels KindSpring does not post automatically: staff post it manually through
 * the official account and record the resulting URL here.
 */
export async function publishStory(actor: Actor, id: string, externalUrl?: string) {
  const a = requirePermission(actor, "media.approve");
  await db.$transaction(async (tx) => {
    const { s, blockers } = await storyBlockers(tx, id);
    if (s.status !== "APPROVED") throw conflict("Only approved stories can be published.");
    if (blockers.length) throw conflict(blockers.join(" "));
    if (s.channel !== "CAMPAIGN_PAGE" && s.channel !== "SPONSOR_REPORT" && s.channel !== "INTERNAL_ONLY") {
      if (!externalUrl || !/^https:\/\/\S+$/.test(externalUrl))
        throw invalid("Post it through the official account first, then record the https:// link here.");
    }
    if (s.channel === "CAMPAIGN_PAGE") for (const m of s.media) await ensurePublicCopy(tx, m.mediaAssetId);
    await tx.story.update({
      where: { id },
      data: { status: "PUBLISHED", publishedAt: new Date(), externalUrl: externalUrl ?? null },
    });
    await recordStatusChange(tx, {
      entityType: "STORY",
      entityId: id,
      from: "APPROVED",
      to: "PUBLISHED",
      actorId: a.userId,
    });
    await audit(
      {
        actorId: a.userId,
        action: "story.publish",
        entityType: "Story",
        entityId: id,
        metadata: { channel: s.channel },
      },
      tx,
    );
  });
}

async function unpublishMediaFor(tx: Tx, storyId: string) {
  const links = await tx.storyMedia.findMany({ where: { storyId } });
  for (const l of links) {
    // Only remove the public copy if no other published campaign-page story uses it.
    const others = await tx.storyMedia.count({
      where: {
        mediaAssetId: l.mediaAssetId,
        storyId: { not: storyId },
        story: { status: "PUBLISHED", channel: "CAMPAIGN_PAGE" },
      },
    });
    if (!others) await removePublicCopy(tx, l.mediaAssetId);
  }
}

export async function withdrawStory(actor: Actor, id: string, reason: string) {
  const a = requirePermission(actor, "media.manage");
  if (reason.trim().length < 5) throw invalid("Give a reason.");
  await db.$transaction(async (tx) => {
    const s = await tx.story.findUnique({ where: { id } });
    if (!s) throw notFound();
    await unpublishMediaFor(tx, id);
    await tx.story.update({ where: { id }, data: { status: "WITHDRAWN" } });
    await recordStatusChange(tx, {
      entityType: "STORY",
      entityId: id,
      from: s.status,
      to: "WITHDRAWN",
      actorId: a.userId,
      reason,
    });
    await audit({ actorId: a.userId, action: "story.withdraw", entityType: "Story", entityId: id }, tx);
  });
}

export async function recordStoryMetrics(
  actor: Actor,
  id: string,
  metrics: { views?: number; reactions?: number; shares?: number },
) {
  const a = requirePermission(actor, "media.manage");
  const clean = Object.fromEntries(
    Object.entries(metrics).filter(([, v]) => Number.isInteger(v) && (v as number) >= 0),
  );
  await db.story.update({
    where: { id },
    data: { metrics: { ...clean, recordedAt: new Date().toISOString(), source: "entered by staff" } },
  });
  await audit({ actorId: a.userId, action: "story.metrics", entityType: "Story", entityId: id });
}

/**
 * Consent withdrawal (Journey J). Anything relying on a withdrawn consent stops immediately on
 * channels KindSpring controls and is queued for editorial review; staff are told to remove
 * copies posted externally (we cannot guarantee removal of copies made by third parties).
 */
export async function handleConsentWithdrawal(
  applicationId: string,
  withdrawn: ConsentType[],
  actorId: string,
) {
  const campaign = await db.campaign.findUnique({
    where: { applicationId },
    include: { application: { select: { reference: true } } },
  });
  if (!campaign) return { affected: 0 };
  const channels = (Object.entries(CHANNEL_CONSENT) as [PublicationChannel, ConsentType | null][])
    .filter(([, c]) => c && withdrawn.includes(c))
    .map(([ch]) => ch);
  const filmingWithdrawn =
    withdrawn.includes("FILMING_AND_PHOTOGRAPHY") || withdrawn.includes("GUARDIAN_CONSENT_FOR_MINOR");
  return db.$transaction(async (tx) => {
    const stories = await tx.story.findMany({
      where: {
        campaignId: campaign.id,
        status: { in: ["PUBLISHED", "APPROVED", "IN_REVIEW"] },
        OR: [
          { channel: { in: channels } },
          ...(filmingWithdrawn ? [{ media: { some: { mediaAsset: { depictsBeneficiary: true } } } }] : []),
        ],
      },
    });
    for (const s of stories) {
      if (s.channel === "CAMPAIGN_PAGE") await unpublishMediaFor(tx, s.id);
      await tx.story.update({ where: { id: s.id }, data: { status: "UNDER_CONSENT_REVIEW" } });
      await recordStatusChange(tx, {
        entityType: "STORY",
        entityId: s.id,
        from: s.status,
        to: "UNDER_CONSENT_REVIEW",
        actorId,
        reason: `Consent withdrawn: ${withdrawn.join(", ")}`,
      });
    }
    if (filmingWithdrawn) {
      const assets = await tx.mediaAsset.findMany({
        where: { campaignId: campaign.id, depictsBeneficiary: true },
      });
      for (const m of assets) await removePublicCopy(tx, m.id);
    }
    if (withdrawn.includes("PUBLIC_CAMPAIGN_PAGE") && campaign.visibility === "PUBLIC") {
      await tx.campaign.update({ where: { id: campaign.id }, data: { visibility: "SPONSORS_ONLY" } });
      await audit(
        { actorId, action: "campaign.visibility_withdrawn", entityType: "Campaign", entityId: campaign.id },
        tx,
      );
    }
    await raiseRiskAlert(tx, {
      type: "CONSENT_WITHDRAWN",
      severity: "HIGH",
      campaignId: campaign.id,
      applicationId,
      dedupeKey: `consent-withdrawn:${applicationId}:${withdrawn.join(",")}:${Date.now()}`,
      details: `Consent withdrawn (${withdrawn.join(", ")}). ${stories.length} publication(s) moved to review. Remove any copies posted on external channels and record the outcome.`,
    });
    for (const role of ["MEDIA_EDITOR", "CASE_MANAGER"] as const) {
      await notifyRole(tx, role, {
        title: "Consent withdrawn – publication review required",
        body: `Case ${campaign.application.reference}: ${stories.length} publication(s) moved to review.`,
        path: "/staff/media",
        dedupeKey: `consent-withdrawn:${applicationId}:${Date.now()}`,
      });
    }
    await audit(
      {
        actorId,
        action: "consent.withdrawal_processed",
        entityType: "Application",
        entityId: applicationId,
        metadata: { withdrawn, affectedStories: stories.length },
      },
      tx,
    );
    return { affected: stories.length };
  });
}

export async function mediaWorkspace(actor: Actor) {
  requirePermission(actor, "media.manage");
  const [assets, stories, campaigns] = await Promise.all([
    db.mediaAsset.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { campaign: { select: { title: true, publicId: true } } },
    }),
    db.story.findMany({
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: { campaign: { select: { title: true, publicId: true } } },
    }),
    db.campaign.findMany({
      where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: { id: true, title: true, publicId: true, status: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return { assets, stories, campaigns };
}

export async function getStory(actor: Actor, id: string) {
  requirePermission(actor, "media.manage");
  const s = await db.story.findUnique({
    where: { id },
    include: {
      campaign: { select: { id: true, title: true, publicId: true } },
      media: { include: { mediaAsset: true } },
      revisions: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!s) throw notFound();
  const history = await db.statusHistory.findMany({
    where: { entityType: "STORY", entityId: id },
    orderBy: { createdAt: "desc" },
  });
  return { s, history, blockers: (await storyBlockers(db, id)).blockers };
}

/** Public impact stories: published campaign-page stories on public campaigns. */
export async function listPublicStories(page = 1) {
  return db.story.findMany({
    where: { status: "PUBLISHED", channel: "CAMPAIGN_PAGE", campaign: { visibility: "PUBLIC" } },
    orderBy: { publishedAt: "desc" },
    skip: (page - 1) * 12,
    take: 12,
    select: {
      id: true,
      title: true,
      body: true,
      type: true,
      publishedAt: true,
      campaign: { select: { publicId: true, title: true, status: true } },
    },
  });
}
