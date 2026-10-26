import type { Payment, PaymentStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { env } from "@/lib/env";
import { audit, recordStatusChange } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { newPaymentReference } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { bpsOf, formatMoney, max0, parseMajorToMinor } from "@/lib/money";
import { sha256Hex } from "@/lib/crypto";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { postJournal } from "@/lib/ledger/journal";
import { paymentProvider } from "@/lib/payments";
import type { NormalizedEvent, VerifiedTransaction } from "@/lib/payments/types";
import { canMovePayment } from "@/lib/workflow/payment";
import { CAMPAIGN_TRANSITIONS, DONATABLE_STATUSES, fundingStatusFor } from "@/lib/workflow/campaign";
import { notify, notifyRole } from "../notifications";
import { requirePermission, type Actor } from "../actor";
import { raiseRiskAlert } from "./risk";

export const MIN_CONTRIBUTION_MINOR = 100n * 100n; // ₦100
export const MAX_CONTRIBUTION_MINOR = 5_000_000n * 100n; // ₦5,000,000 per online transaction

export const donationSchema = z.object({
  amount: z.string().min(1, "Choose or enter an amount."),
  email: z.email("Enter a valid email for your receipt.").trim().toLowerCase(),
  name: z.string().trim().min(2, "Enter your name for the receipt.").max(120),
  anonymous: z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean()),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
});

/** Pure amount validation (unit tested). Prevents amount manipulation and checkout-time overfunding. */
export function validateContributionAmount(amount: bigint | null, remaining: bigint): string | null {
  if (amount === null) return "Enter a valid amount in naira.";
  if (amount < MIN_CONTRIBUTION_MINOR)
    return `The minimum contribution is ${formatMoney(MIN_CONTRIBUTION_MINOR)}.`;
  if (amount > MAX_CONTRIBUTION_MINOR)
    return `The maximum online contribution is ${formatMoney(MAX_CONTRIBUTION_MINOR)}. Contact us for larger gifts.`;
  if (remaining <= 0n)
    return "This campaign is fully funded. Thank you – please consider another verified case.";
  if (amount > remaining)
    return `This campaign needs ${formatMoney(remaining)} more. Please give that amount or less.`;
  return null;
}

/**
 * Start a contribution. The server decides the amount, currency and campaign; the browser
 * only receives a hosted-checkout URL. Idempotent per client key (double clicks reuse the
 * same payment).
 */
export async function initiateDonation(
  actor: Actor | null,
  publicId: string,
  raw: unknown,
  ctx: { ipHash: string | null },
) {
  const d = donationSchema.parse(raw);
  await enforceRateLimit(
    `donate:${ctx.ipHash ?? "unknown"}`,
    20,
    3600,
    "Too many payment attempts. Please wait a few minutes.",
  );
  const idemKey = `donate:${actor?.userId ?? "anon"}:${d.idempotencyKey}`;
  const prior = await db.idempotencyRecord.findUnique({ where: { key: idemKey } });
  if (prior?.resultRef) {
    const p = await db.payment.findUnique({ where: { id: prior.resultRef } });
    if (p?.checkoutUrl && p.status === "PENDING")
      return { reference: p.reference, checkoutUrl: p.checkoutUrl };
    if (p) throw conflict("This payment was already started. Please return to the campaign and try again.");
  }

  const campaign = await db.campaign.findUnique({ where: { publicId } });
  if (
    !campaign ||
    campaign.visibility !== "PUBLIC" ||
    !DONATABLE_STATUSES.includes(campaign.status) ||
    !campaign.acceptsDonations
  ) {
    throw conflict("This campaign is not currently accepting contributions.");
  }
  if (campaign.endsAt && campaign.endsAt < new Date())
    throw conflict("This campaign's funding period has ended.");
  const amount = parseMajorToMinor(d.amount);
  const remaining = max0(
    campaign.targetAmountMinor - (campaign.confirmedAmountMinor - campaign.refundedAmountMinor),
  );
  const problem = validateContributionAmount(amount, remaining);
  if (problem) throw invalid(problem);

  const provider = paymentProvider();
  const payment = await db.$transaction(async (tx) => {
    await tx.idempotencyRecord.create({ data: { key: idemKey } }).catch(() => {
      throw conflict("This payment is already being processed.");
    });
    const p = await tx.payment.create({
      data: {
        reference: newPaymentReference(),
        provider: provider.name,
        kind: "DONATION",
        campaignId: campaign.id,
        payerUserId: actor?.userId ?? null,
        payerEmail: d.email,
        payerName: d.name,
        isAnonymous: d.anonymous,
        amountMinor: amount!,
        currency: campaign.currency,
      },
    });
    await tx.idempotencyRecord.update({ where: { key: idemKey }, data: { resultRef: p.id } });
    await recordStatusChange(tx, {
      entityType: "PAYMENT",
      entityId: p.id,
      from: null,
      to: "CREATED",
      actorId: actor?.userId ?? null,
    });
    return p;
  });
  return startCheckout(payment);
}

async function startCheckout(payment: Payment) {
  const provider = paymentProvider(payment.provider);
  try {
    const { checkoutUrl } = await provider.initialize({
      reference: payment.reference,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      email: payment.payerEmail,
      callbackUrl: `${env().APP_BASE_URL}/give/return?reference=${payment.reference}`,
      metadata: { payment_reference: payment.reference, kind: payment.kind },
    });
    await db.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { status: "PENDING", checkoutUrl } });
      await recordStatusChange(tx, {
        entityType: "PAYMENT",
        entityId: payment.id,
        from: "CREATED",
        to: "PENDING",
        actorId: null,
      });
      // Safety net in case the webhook never arrives.
      const { enqueueJob } = await import("@/lib/jobs/queue");
      await enqueueJob(
        tx,
        "reconcile_payment",
        { reference: payment.reference },
        { runAt: new Date(Date.now() + 20 * 60e3), dedupeKey: `reconcile:${payment.reference}:1` },
      );
    });
    return { reference: payment.reference, checkoutUrl };
  } catch (err) {
    logger.error("payment.initialize_failed", { reference: payment.reference, error: err });
    await db.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureReason: "Could not start checkout" },
    });
    throw conflict("We could not start the payment. Please try again in a few minutes.");
  }
}

async function lockPayment(tx: Tx, where: { reference: string } | { id: string }) {
  const rows =
    "reference" in where
      ? await tx.$queryRaw<
          { id: string }[]
        >`SELECT "id" FROM "payments" WHERE "reference" = ${where.reference} FOR UPDATE`
      : await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "payments" WHERE "id" = ${where.id} FOR UPDATE`;
  if (!rows[0]) return null;
  return tx.payment.findUniqueOrThrow({ where: { id: rows[0].id } });
}

async function lockCampaign(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "campaigns" WHERE "id" = ${id} FOR UPDATE`;
  return tx.campaign.findUniqueOrThrow({ where: { id } });
}

async function setPaymentStatus(
  tx: Tx,
  p: Payment,
  to: PaymentStatus,
  data: Prisma.PaymentUpdateInput,
  reason: string,
  actorId: string | null,
) {
  await tx.payment.update({ where: { id: p.id }, data: { ...data, status: to } });
  await recordStatusChange(tx, {
    entityType: "PAYMENT",
    entityId: p.id,
    from: p.status,
    to,
    actorId,
    reason,
  });
}

/** Recompute the campaign's funding status after its confirmed totals change (SYSTEM transition). */
export async function syncCampaignFundingStatus(tx: Tx, campaignId: string) {
  const c = await lockCampaign(tx, campaignId);
  const net = c.confirmedAmountMinor - c.refundedAmountMinor;
  const next = fundingStatusFor(c.status, net, c.targetAmountMinor);
  if (next !== c.status && CAMPAIGN_TRANSITIONS[c.status]?.[next]?.includes("SYSTEM")) {
    await tx.campaign.update({ where: { id: c.id }, data: { status: next } });
    await recordStatusChange(tx, {
      entityType: "CAMPAIGN",
      entityId: c.id,
      from: c.status,
      to: next,
      actorId: null,
      reason: "Confirmed funding changed",
    });
  }
  if (net > c.targetAmountMinor) {
    await raiseRiskAlert(tx, {
      type: "OVERFUNDED_CAMPAIGN",
      severity: "MEDIUM",
      campaignId: c.id,
      dedupeKey: `overfunded:${c.id}`,
      details: `Campaign ${c.publicId} has confirmed funding above its target by ${formatMoney(net - c.targetAmountMinor)}. Apply the published excess-funds policy (refund the excess unless donors consent otherwise). Funds are not redirected automatically.`,
    });
  }
}

export type ApplyOutcome =
  | "APPLIED"
  | "IGNORED_DUPLICATE"
  | "IGNORED_STALE"
  | "IGNORED_UNKNOWN"
  | "REJECTED_MISMATCH"
  | "STILL_PENDING";

/**
 * Apply provider-verified transaction data to our payment record. This is the ONLY path
 * by which a payment becomes SUCCEEDED and funding totals increase. Safe to call many times
 * (webhook retries, return-page checks, reconciliation): the payment row is locked and the
 * state machine + journal idempotency keys make repeats no-ops.
 */
export async function applyVerifiedTransaction(
  v: VerifiedTransaction,
  source: string,
): Promise<ApplyOutcome> {
  return db.$transaction(async (tx) => {
    const p = await lockPayment(tx, { reference: v.reference });
    if (!p) return "IGNORED_UNKNOWN";

    if (v.status === "success") {
      if (v.amountMinor !== p.amountMinor || v.currency !== p.currency) {
        await raiseRiskAlert(tx, {
          type: "PAYMENT_AMOUNT_MISMATCH",
          severity: "HIGH",
          paymentId: p.id,
          campaignId: p.campaignId,
          dedupeKey: `mismatch:${p.id}`,
          details: `Provider reported ${v.currency} ${v.amountMinor} for ${p.reference}; expected ${p.currency} ${p.amountMinor}. Not counted toward funding. Investigate and refund if appropriate.`,
        });
        await tx.payment.update({
          where: { id: p.id },
          data: {
            reconciliation: "MISMATCH",
            reconciliationNote: `Amount/currency mismatch reported by ${source}`,
          },
        });
        return "REJECTED_MISMATCH";
      }
      if (!canMovePayment(p.status, "SUCCEEDED"))
        return p.status === "CREATED" ? "IGNORED_STALE" : "IGNORED_DUPLICATE";
      await setPaymentStatus(
        tx,
        p,
        "SUCCEEDED",
        {
          providerTransactionId: v.providerTransactionId,
          feeMinor: v.feeMinor,
          paidAt: v.paidAt ?? new Date(),
          failureReason: null,
        },
        `Verified by provider (${source})`,
        null,
      );
      await postSuccessJournals(tx, { ...p, feeMinor: v.feeMinor });
      await tx.campaign.update({
        where: { id: p.campaignId },
        data: { confirmedAmountMinor: { increment: p.amountMinor } },
      });
      await syncCampaignFundingStatus(tx, p.campaignId);
      if (p.agreementId) await syncAgreementFulfilment(tx, p.agreementId);
      const campaign = await tx.campaign.findUniqueOrThrow({ where: { id: p.campaignId } });
      await notify(tx, {
        userId: p.payerUserId,
        to: p.payerEmail,
        template: "contribution_received",
        params: {
          name: p.payerName,
          amount: formatMoney(p.amountMinor, p.currency),
          campaignTitle: campaign.title,
          reference: p.reference,
        },
        dedupeKey: `contribution:${p.id}`,
      });
      await audit(
        {
          actorId: null,
          action: "payment.succeeded",
          entityType: "Payment",
          entityId: p.id,
          metadata: { source },
        },
        tx,
      );
      return "APPLIED";
    }

    if (v.status === "failed" || v.status === "abandoned") {
      if (!canMovePayment(p.status, "FAILED")) return "IGNORED_STALE";
      await setPaymentStatus(
        tx,
        p,
        "FAILED",
        { failureReason: `Provider status: ${v.status}` },
        `Provider reported ${v.status} (${source})`,
        null,
      );
      await notify(tx, {
        userId: p.payerUserId,
        to: p.payerEmail,
        template: "payment_failed",
        params: { name: p.payerName, reference: p.reference },
        dedupeKey: `payment-failed:${p.id}`,
      });
      return "APPLIED";
    }
    return "STILL_PENDING";
  });
}

async function postSuccessJournals(tx: Tx, p: Payment) {
  const revenue = p.kind === "SPONSOR_PAYMENT" ? "RESTRICTED_SPONSORSHIP" : "RESTRICTED_DONATIONS";
  await postJournal(tx, {
    idempotencyKey: `payment:${p.id}:received`,
    description: `${p.kind === "SPONSOR_PAYMENT" ? "Sponsor payment" : "Donation"} ${p.reference}`,
    sourceType: "PAYMENT",
    sourceId: p.id,
    currency: p.currency,
    lines: [
      { account: "CASH", debit: p.amountMinor },
      { account: revenue, credit: p.amountMinor, campaignId: p.campaignId },
    ],
  });
  if (p.feeMinor > 0n) {
    const charged = env().PROCESSING_FEE_POLICY === "CHARGED_TO_FUND";
    await postJournal(tx, {
      idempotencyKey: `payment:${p.id}:fee`,
      description: `Processing fee for ${p.reference} (${charged ? "charged to fund" : "absorbed by platform"})`,
      sourceType: "PAYMENT",
      sourceId: p.id,
      currency: p.currency,
      lines: [
        charged
          ? { account: "FUND_PROCESSING_FEES", debit: p.feeMinor, campaignId: p.campaignId }
          : { account: "PLATFORM_PROCESSING_FEES", debit: p.feeMinor },
        { account: "CASH", credit: p.feeMinor },
      ],
    });
  }
  const bps = env().PLATFORM_FEE_BPS;
  if (bps > 0) {
    const fee = bpsOf(p.amountMinor, bps);
    if (fee > 0n) {
      await postJournal(tx, {
        idempotencyKey: `payment:${p.id}:platform-fee`,
        description: `Disclosed platform fee (${bps / 100}%) on ${p.reference}`,
        sourceType: "PAYMENT",
        sourceId: p.id,
        currency: p.currency,
        lines: [
          { account: "PLATFORM_FEE_CHARGED", debit: fee, campaignId: p.campaignId },
          { account: "PLATFORM_FEE_REVENUE", credit: fee },
        ],
      });
    }
  }
}

async function syncAgreementFulfilment(tx: Tx, agreementId: string) {
  const ag = await tx.sponsorshipAgreement.findUniqueOrThrow({ where: { id: agreementId } });
  const paid = await tx.payment.aggregate({
    where: { agreementId, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] } },
    _sum: { amountMinor: true, refundedMinor: true },
  });
  const net = (paid._sum.amountMinor ?? 0n) - (paid._sum.refundedMinor ?? 0n);
  if (ag.status === "SIGNED" && ag.pledgedAmountMinor > 0n && net >= ag.pledgedAmountMinor) {
    await tx.sponsorshipAgreement.update({ where: { id: agreementId }, data: { status: "FULFILLED" } });
    await recordStatusChange(tx, {
      entityType: "AGREEMENT",
      entityId: agreementId,
      from: "SIGNED",
      to: "FULFILLED",
      actorId: null,
      reason: "Pledged amount confirmed received",
    });
  }
}

// ─── Webhooks ───

export type WebhookResult = { status: number; outcome: string };

/**
 * Process a provider webhook. Steps: verify signature on the raw body → parse → dedupe by
 * event key (unique index) → re-verify with the provider API → apply via the state machine.
 * Returns 200 for duplicates/ignored events so the provider stops retrying, 401 for bad
 * signatures and 500 for transient failures so the provider retries.
 */
export async function processWebhook(
  providerName: string,
  rawBody: string,
  headers: Headers,
): Promise<WebhookResult> {
  const provider = paymentProvider(providerName);
  if (!provider.verifySignature(rawBody, headers)) {
    logger.warn("webhook.bad_signature", { provider: providerName });
    return { status: 401, outcome: "BAD_SIGNATURE" };
  }
  let parsed: ReturnType<typeof provider.parseEvent>;
  try {
    parsed = provider.parseEvent(rawBody);
  } catch {
    return { status: 400, outcome: "MALFORMED" };
  }
  const { event, eventType, sanitized } = parsed;
  let record = await db.paymentEvent.findUnique({ where: { dedupeKey: event.dedupeKey } });
  if (record?.processedAt) return { status: 200, outcome: "DUPLICATE" };
  try {
    record ??= await db.paymentEvent.create({
      data: {
        provider: provider.name,
        dedupeKey: event.dedupeKey,
        eventType,
        payloadSha256: sha256Hex(rawBody),
        payload: sanitized as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      const existing = await db.paymentEvent.findUnique({ where: { dedupeKey: event.dedupeKey } });
      if (existing?.processedAt) return { status: 200, outcome: "DUPLICATE" };
      record = existing!; // previously failed mid-way: retry processing
    } else throw e;
  }
  try {
    const outcome = await handleEvent(event, provider.name);
    const payment =
      "reference" in event && event.reference
        ? await db.payment.findUnique({ where: { reference: event.reference }, select: { id: true } })
        : null;
    await db.paymentEvent.update({
      where: { id: record.id },
      data: { processedAt: new Date(), outcome, paymentId: payment?.id ?? null, error: null },
    });
    return { status: 200, outcome };
  } catch (err) {
    logger.error("webhook.processing_failed", { provider: providerName, eventType, error: err });
    await db.paymentEvent.update({
      where: { id: record.id },
      data: { outcome: "ERROR", error: err instanceof Error ? err.message.slice(0, 500) : "error" },
    });
    return { status: 500, outcome: "ERROR" };
  }
}

async function handleEvent(event: NormalizedEvent, providerName: string): Promise<string> {
  const provider = paymentProvider(providerName);
  switch (event.kind) {
    case "charge.success":
    case "charge.failed": {
      // Never trust the webhook body for money: ask the provider directly.
      const verified = await provider.verify(event.reference);
      if (!verified) throw new Error("Provider verification unavailable");
      return applyVerifiedTransaction(verified, `webhook:${event.kind}`);
    }
    case "refund.processed":
    case "refund.failed": {
      const { applyRefundOutcome } = await import("./refunds");
      return applyRefundOutcome(
        {
          providerRefundId: event.providerRefundId,
          reference: event.reference,
          amountMinor: event.amountMinor,
        },
        event.kind === "refund.processed" ? "processed" : "failed",
      );
    }
    case "refund.pending":
      return "IGNORED_INFORMATIONAL";
    case "dispute.created":
    case "dispute.won":
    case "dispute.lost": {
      const { applyDisputeEvent } = await import("./refunds");
      return applyDisputeEvent(event);
    }
    case "ignored":
      return "IGNORED_UNSUPPORTED_EVENT";
  }
}

// ─── Reconciliation ───

/** Compare one payment against the provider's records; repairs missed webhooks. */
export async function reconcilePaymentByReference(reference: string, actorId: string | null = null) {
  const p = await db.payment.findUnique({ where: { reference } });
  if (!p || p.provider === "offline") return null;
  const verified = await paymentProvider(p.provider).verify(reference);
  if (!verified) {
    await db.payment.update({
      where: { id: p.id },
      data: { reconciliationNote: "Provider record not found or unavailable" },
    });
    return "UNAVAILABLE";
  }
  let outcome: string = "CHECKED";
  if (
    (verified.status === "success" && ["CREATED", "PENDING", "FAILED"].includes(p.status)) ||
    (["failed", "abandoned"].includes(verified.status) &&
      ["CREATED", "PENDING"].includes(p.status) &&
      Date.now() - p.createdAt.getTime() > 24 * 3600e3)
  ) {
    outcome = await applyVerifiedTransaction(verified, "reconciliation");
  }
  const fresh = await db.payment.findUniqueOrThrow({ where: { id: p.id } });
  const confirmedLocally = [
    "SUCCEEDED",
    "REFUND_PENDING",
    "PARTIALLY_REFUNDED",
    "REFUNDED",
    "DISPUTED",
  ].includes(fresh.status);
  const matched =
    verified.amountMinor === fresh.amountMinor &&
    verified.currency === fresh.currency &&
    ((verified.status === "success" && confirmedLocally) ||
      (verified.status === "reversed" && confirmedLocally) ||
      (verified.status !== "success" && !confirmedLocally));
  await db.payment.update({
    where: { id: p.id },
    data: {
      reconciliation:
        verified.status === "pending" && !confirmedLocally
          ? "UNRECONCILED"
          : matched
            ? "MATCHED"
            : "MISMATCH",
      reconciledAt: new Date(),
      reconciliationNote: matched ? null : `Provider status ${verified.status}, local ${fresh.status}`,
    },
  });
  if (!matched && verified.status !== "pending") {
    await db.$transaction((tx) =>
      raiseRiskAlert(tx, {
        type: "RECONCILIATION_MISMATCH",
        severity: "HIGH",
        paymentId: p.id,
        campaignId: p.campaignId,
        dedupeKey: `recon:${p.id}`,
        details: `Payment ${p.reference}: provider says ${verified.status} ${verified.currency} ${verified.amountMinor}, local record is ${fresh.status} ${fresh.currency} ${fresh.amountMinor}.`,
      }),
    );
  }
  if (actorId)
    await audit({
      actorId,
      action: "payment.reconcile",
      entityType: "Payment",
      entityId: p.id,
      metadata: { outcome },
    });
  return outcome;
}

export async function reconcileNow(actor: Actor, paymentId: string) {
  const a = requirePermission(actor, "finance.reconcile");
  const p = await db.payment.findUnique({ where: { id: paymentId } });
  if (!p) throw notFound();
  return reconcilePaymentByReference(p.reference, a.userId);
}

/** Background sweep: verify pending payments older than 15 minutes. */
export async function sweepStalePayments() {
  const stale = await db.payment.findMany({
    where: {
      status: { in: ["PENDING", "CREATED"] },
      provider: { not: "offline" },
      createdAt: { lt: new Date(Date.now() - 15 * 60e3) },
    },
    select: { reference: true },
    take: 100,
  });
  for (const s of stale)
    await reconcilePaymentByReference(s.reference).catch((e) => logger.error("sweep.failed", { error: e }));
  return stale.length;
}

// ─── Offline (bank transfer) sponsor receipts – maker/checker ───

export async function recordOfflineReceipt(
  actor: Actor,
  input: { agreementId: string; amount: string; bankReference: string; receivedOn: string },
) {
  const a = requirePermission(actor, "finance.offline_receipt");
  const amount = parseMajorToMinor(input.amount);
  if (!amount || amount <= 0n) throw invalid("Enter the amount received.");
  if (input.bankReference.trim().length < 4)
    throw invalid("Enter the bank transfer reference from the statement.");
  const ag = await db.sponsorshipAgreement.findUnique({
    where: { id: input.agreementId },
    include: { organisation: true },
  });
  if (!ag || ag.status !== "SIGNED")
    throw conflict("Receipts can only be recorded against a signed agreement.");
  const p = await db.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        reference: newPaymentReference(),
        provider: "offline",
        providerTransactionId: input.bankReference.trim(),
        kind: "SPONSOR_PAYMENT",
        campaignId: ag.campaignId,
        agreementId: ag.id,
        payerEmail: ag.organisation.contactEmail,
        payerName: ag.organisation.name,
        amountMinor: amount,
        status: "PENDING",
        recordedById: a.userId,
        paidAt: new Date(input.receivedOn),
      },
    });
    await recordStatusChange(tx, {
      entityType: "PAYMENT",
      entityId: payment.id,
      from: null,
      to: "PENDING",
      actorId: a.userId,
      reason: "Offline receipt recorded; awaiting independent confirmation",
    });
    await audit(
      { actorId: a.userId, action: "payment.offline_recorded", entityType: "Payment", entityId: payment.id },
      tx,
    );
    return payment;
  });
  return p;
}

/** A second finance officer confirms the receipt against the bank statement. */
export async function confirmOfflineReceipt(actor: Actor, paymentId: string) {
  const a = requirePermission(actor, "finance.offline_receipt");
  await db.$transaction(async (tx) => {
    const p = await lockPayment(tx, { id: paymentId });
    if (!p || p.provider !== "offline") throw notFound();
    if (p.status !== "PENDING") throw conflict("This receipt is not awaiting confirmation.");
    if (p.recordedById === a.userId)
      throw forbidden("A different finance officer must confirm a receipt you recorded.");
    await tx.payment.update({
      where: { id: p.id },
      data: { confirmedById: a.userId, reconciliation: "MATCHED", reconciledAt: new Date() },
    });
    await setPaymentStatus(tx, p, "SUCCEEDED", {}, "Confirmed against bank statement", a.userId);
    await postSuccessJournals(tx, p);
    await tx.campaign.update({
      where: { id: p.campaignId },
      data: { confirmedAmountMinor: { increment: p.amountMinor } },
    });
    await syncCampaignFundingStatus(tx, p.campaignId);
    if (p.agreementId) await syncAgreementFulfilment(tx, p.agreementId);
    await audit(
      { actorId: a.userId, action: "payment.offline_confirmed", entityType: "Payment", entityId: p.id },
      tx,
    );
    await notifyRole(tx, "CASE_MANAGER", {
      title: "Sponsor funds confirmed",
      body: `A sponsor payment of ${formatMoney(p.amountMinor)} was confirmed.`,
      path: `/staff/finance/payments`,
      dedupeKey: `offline-confirmed:${p.id}`,
    });
  });
}

// ─── Read models ───

/** Status the donor sees on the return page; re-verifies with the provider if still pending. */
export async function getReturnStatus(reference: string) {
  if (!/^ksp_[a-f0-9]{24}$/.test(reference)) return null;
  let p = await db.payment.findUnique({
    where: { reference },
    include: { campaign: { select: { publicId: true, title: true } } },
  });
  if (!p) return null;
  if (p.status === "PENDING") {
    const verified = await paymentProvider(p.provider).verify(reference);
    if (verified && verified.status !== "pending") {
      await applyVerifiedTransaction(verified, "return-page");
      p = await db.payment.findUniqueOrThrow({
        where: { reference },
        include: { campaign: { select: { publicId: true, title: true } } },
      });
    }
  }
  return { status: p.status, amountMinor: p.amountMinor, currency: p.currency, campaign: p.campaign };
}

export async function listOwnContributions(actor: Actor) {
  requirePermission(actor, "donation.own");
  return db.payment.findMany({
    where: {
      OR: [{ payerUserId: actor.userId }, { payerEmail: actor.email, payerUserId: null }],
      kind: "DONATION",
    },
    orderBy: { createdAt: "desc" },
    select: {
      reference: true,
      amountMinor: true,
      currency: true,
      status: true,
      createdAt: true,
      paidAt: true,
      refundedMinor: true,
      isAnonymous: true,
      campaign: { select: { title: true, publicId: true, status: true } },
    },
  });
}

export async function getOwnReceipt(actor: Actor, reference: string) {
  requirePermission(actor, "donation.own");
  const p = await db.payment.findUnique({
    where: { reference },
    include: {
      campaign: { select: { title: true, publicId: true } },
      refunds: { select: { amountMinor: true, status: true, processedAt: true } },
    },
  });
  if (!p || !(p.payerUserId === actor.userId || (p.payerUserId === null && p.payerEmail === actor.email)))
    throw notFound();
  if (!["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED", "REFUND_PENDING", "DISPUTED"].includes(p.status))
    throw notFound("No receipt is available for this payment.");
  return p;
}

export async function listPaymentsForFinance(
  actor: Actor,
  raw: { status?: string; reconciliation?: string; q?: string; page?: number },
) {
  requirePermission(actor, "finance.view");
  const where: Prisma.PaymentWhereInput = {};
  if (raw.status) where.status = raw.status as PaymentStatus;
  if (raw.reconciliation)
    where.reconciliation = raw.reconciliation as Prisma.PaymentWhereInput["reconciliation"];
  if (raw.q) where.reference = { contains: raw.q.trim() };
  const page = Math.max(1, raw.page ?? 1);
  const [rows, total] = await Promise.all([
    db.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 25,
      take: 25,
      include: { campaign: { select: { publicId: true, title: true } } },
    }),
    db.payment.count({ where }),
  ]);
  return { rows, total, page, pageSize: 25 };
}
