import type { Payment } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { audit, recordStatusChange } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { formatMoney, parseMajorToMinor } from "@/lib/money";
import { postJournal, reverseJournal } from "@/lib/ledger/journal";
import { enqueueJob } from "@/lib/jobs/queue";
import { paymentProvider } from "@/lib/payments";
import type { NormalizedEvent } from "@/lib/payments/types";
import { statusAfterRefund } from "@/lib/workflow/payment";
import { notify } from "../notifications";
import { requirePermission, type Actor } from "../actor";
import { raiseRiskAlert } from "./risk";
import { syncCampaignFundingStatus } from "./payments";

const REFUNDABLE = ["SUCCEEDED", "PARTIALLY_REFUNDED"] as const;

/** Pure: the most that can still be refunded on a payment (unit tested). */
export function refundableAmount(p: { amountMinor: bigint; refundedMinor: bigint }, openRefunds: bigint): bigint {
  const r = p.amountMinor - p.refundedMinor - openRefunds;
  return r < 0n ? 0n : r;
}

async function openRefundTotal(tx: Tx, paymentId: string) {
  const agg = await tx.refund.aggregate({ where: { paymentId, status: { in: ["REQUESTED", "APPROVED", "PENDING_PROVIDER"] } }, _sum: { amountMinor: true } });
  return agg._sum.amountMinor ?? 0n;
}

export async function requestRefund(actor: Actor, paymentId: string, amountInput: string, reason: string) {
  const a = requirePermission(actor, "finance.refund.request");
  const amount = parseMajorToMinor(amountInput);
  if (!amount || amount <= 0n) throw invalid("Enter the refund amount.");
  if (reason.trim().length < 10) throw invalid("Record the reason for the refund (policy basis, donor request, etc.).");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "payments" WHERE "id" = ${paymentId} FOR UPDATE`;
    const p = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!p) throw notFound();
    if (!(REFUNDABLE as readonly string[]).includes(p.status)) throw conflict(`A ${p.status} payment cannot be refunded.`);
    if (amount > refundableAmount(p, await openRefundTotal(tx, p.id))) throw invalid("The refund exceeds the amount that can still be refunded.");
    const r = await tx.refund.create({ data: { paymentId, amountMinor: amount, reason: reason.trim(), requestedById: a.userId } });
    await recordStatusChange(tx, { entityType: "REFUND", entityId: r.id, from: null, to: "REQUESTED", actorId: a.userId, reason: reason.trim() });
    await audit({ actorId: a.userId, action: "refund.request", entityType: "Refund", entityId: r.id }, tx);
    const recent = await tx.refund.count({ where: { payment: { payerEmail: p.payerEmail }, createdAt: { gte: new Date(Date.now() - 90 * 864e5) } } });
    if (recent >= 3) {
      await raiseRiskAlert(tx, {
        type: "REPEATED_REFUNDS", severity: "MEDIUM", paymentId: p.id, dedupeKey: `repeat-refunds:${p.payerEmail}:${new Date().toISOString().slice(0, 7)}`,
        details: `${recent} refunds in 90 days for the same contributor email. Review for misuse before approving.`,
      });
    }
    return r;
  });
}

/** Independent approval: the approver must not be the requester (also enforced by a DB constraint). */
export async function approveRefund(actor: Actor, refundId: string) {
  const a = requirePermission(actor, "finance.refund.approve");
  await db.$transaction(async (tx) => {
    const r = await tx.refund.findUnique({ where: { id: refundId }, include: { payment: true } });
    if (!r) throw notFound();
    if (r.status !== "REQUESTED") throw conflict("This refund is not awaiting approval.");
    if (r.requestedById === a.userId) throw forbidden("A different finance officer must approve a refund you requested.");
    await tx.$queryRaw`SELECT "id" FROM "payments" WHERE "id" = ${r.paymentId} FOR UPDATE`;
    const p = await tx.payment.findUniqueOrThrow({ where: { id: r.paymentId } });
    if (!(REFUNDABLE as readonly string[]).includes(p.status) && p.status !== "REFUND_PENDING") throw conflict(`The payment is ${p.status}.`);
    const others = (await openRefundTotal(tx, p.id)) - r.amountMinor;
    if (r.amountMinor > refundableAmount(p, others)) throw conflict("The refund now exceeds the refundable amount.");
    await tx.refund.update({ where: { id: r.id }, data: { status: "APPROVED", approvedById: a.userId } });
    await recordStatusChange(tx, { entityType: "REFUND", entityId: r.id, from: "REQUESTED", to: "APPROVED", actorId: a.userId });
    if (p.status !== "REFUND_PENDING") {
      await tx.payment.update({ where: { id: p.id }, data: { status: "REFUND_PENDING" } });
      await recordStatusChange(tx, { entityType: "PAYMENT", entityId: p.id, from: p.status, to: "REFUND_PENDING", actorId: a.userId, reason: "Refund approved" });
    }
    // Recognise the liability: the fund is reduced, cash leaves when the provider settles.
    await postJournal(tx, {
      idempotencyKey: `refund:${r.id}:approved`, description: `Refund approved for ${p.reference}`, sourceType: "REFUND", sourceId: r.id, createdById: a.userId, currency: p.currency,
      lines: [
        { account: "CONTRIBUTION_REFUNDS", debit: r.amountMinor, campaignId: p.campaignId },
        { account: "REFUNDS_PAYABLE", credit: r.amountMinor },
      ],
    });
    await enqueueJob(tx, "refund_submit", { refundId: r.id }, { dedupeKey: `refund-submit:${r.id}` });
    await audit({ actorId: a.userId, action: "refund.approve", entityType: "Refund", entityId: r.id }, tx);
  });
}

export async function rejectRefund(actor: Actor, refundId: string, reason: string) {
  const a = requirePermission(actor, "finance.refund.approve");
  if (reason.trim().length < 5) throw invalid("Explain why the refund is rejected.");
  await db.$transaction(async (tx) => {
    const r = await tx.refund.findUnique({ where: { id: refundId } });
    if (!r || r.status !== "REQUESTED") throw conflict("This refund is not awaiting approval.");
    await tx.refund.update({ where: { id: r.id }, data: { status: "REJECTED", failureReason: reason.trim(), approvedById: r.requestedById === a.userId ? null : a.userId } });
    await recordStatusChange(tx, { entityType: "REFUND", entityId: r.id, from: "REQUESTED", to: "REJECTED", actorId: a.userId, reason: reason.trim() });
    await audit({ actorId: a.userId, action: "refund.reject", entityType: "Refund", entityId: r.id }, tx);
  });
}

/** Job: submit an approved refund to the provider (network call outside DB transactions). */
export async function submitRefundToProvider(refundId: string) {
  const r = await db.refund.findUnique({ where: { id: refundId }, include: { payment: true } });
  if (!r || r.status !== "APPROVED") return;
  if (r.payment.provider === "offline") {
    // Bank-transfer receipts are refunded manually by finance; recorded via markOfflineRefundPaid.
    return;
  }
  const res = await paymentProvider(r.payment.provider).refund({
    reference: r.payment.reference, providerTransactionId: r.payment.providerTransactionId, amountMinor: r.amountMinor, refundId: r.id,
  });
  await db.refund.update({ where: { id: r.id }, data: { status: "PENDING_PROVIDER", providerRefundId: res.providerRefundId } });
  await db.$transaction((tx) => recordStatusChange(tx, { entityType: "REFUND", entityId: r.id, from: "APPROVED", to: "PENDING_PROVIDER", actorId: null }));
  if (res.status !== "pending") await applyRefundOutcome({ providerRefundId: res.providerRefundId, reference: r.payment.reference, amountMinor: r.amountMinor }, res.status);
}

/** Apply a refund outcome reported by the provider (webhook or synchronous API response). Idempotent. */
export async function applyRefundOutcome(
  ref: { providerRefundId: string | null; reference: string | null; amountMinor: bigint | null },
  outcome: "processed" | "failed",
): Promise<string> {
  return db.$transaction(async (tx) => {
    let r = ref.providerRefundId ? await tx.refund.findUnique({ where: { providerRefundId: ref.providerRefundId } }) : null;
    if (!r && ref.reference) {
      // Fall back to the single in-flight refund for this payment with a matching amount.
      const candidates = await tx.refund.findMany({ where: { payment: { reference: ref.reference }, status: { in: ["APPROVED", "PENDING_PROVIDER"] }, ...(ref.amountMinor ? { amountMinor: ref.amountMinor } : {}) } });
      if (candidates.length === 1) r = candidates[0]!;
    }
    if (!r) return "IGNORED_UNKNOWN_REFUND";
    if (r.status === "PROCESSED" || r.status === "FAILED" || r.status === "REJECTED") return "IGNORED_DUPLICATE";
    await tx.$queryRaw`SELECT "id" FROM "payments" WHERE "id" = ${r.paymentId} FOR UPDATE`;
    const p = await tx.payment.findUniqueOrThrow({ where: { id: r.paymentId } });

    if (outcome === "processed") {
      await tx.refund.update({ where: { id: r.id }, data: { status: "PROCESSED", processedAt: new Date() } });
      await postJournal(tx, {
        idempotencyKey: `refund:${r.id}:processed`, description: `Refund paid out for ${p.reference}`, sourceType: "REFUND", sourceId: r.id, currency: p.currency,
        lines: [{ account: "REFUNDS_PAYABLE", debit: r.amountMinor }, { account: "CASH", credit: r.amountMinor }],
      });
      const refunded = p.refundedMinor + r.amountMinor;
      const stillOpen = await tx.refund.count({ where: { paymentId: p.id, status: { in: ["APPROVED", "PENDING_PROVIDER"] }, id: { not: r.id } } });
      const next = stillOpen ? "REFUND_PENDING" : statusAfterRefund(p.amountMinor, refunded);
      await tx.payment.update({ where: { id: p.id }, data: { refundedMinor: refunded, status: next } });
      await recordStatusChange(tx, { entityType: "PAYMENT", entityId: p.id, from: p.status, to: next, actorId: null, reason: "Refund processed" });
      await tx.campaign.update({ where: { id: p.campaignId }, data: { refundedAmountMinor: { increment: r.amountMinor } } });
      await syncCampaignFundingStatus(tx, p.campaignId);
    } else {
      await tx.refund.update({ where: { id: r.id }, data: { status: "FAILED", failureReason: "Provider reported failure" } });
      const approval = await tx.journalEntry.findUnique({ where: { idempotencyKey: `refund:${r.id}:approved` } });
      if (approval) await reverseJournal(tx, approval.id, "refund failed at provider", null);
      const stillOpen = await tx.refund.count({ where: { paymentId: p.id, status: { in: ["APPROVED", "PENDING_PROVIDER"] }, id: { not: r.id } } });
      const next = stillOpen ? "REFUND_PENDING" : statusAfterRefund(p.amountMinor, p.refundedMinor);
      await tx.payment.update({ where: { id: p.id }, data: { status: next } });
      await recordStatusChange(tx, { entityType: "PAYMENT", entityId: p.id, from: p.status, to: next, actorId: null, reason: "Refund failed" });
      await raiseRiskAlert(tx, { type: "REFUND_FAILED", severity: "HIGH", paymentId: p.id, dedupeKey: `refund-failed:${r.id}`, details: `Refund for ${p.reference} failed at the provider. Contact the contributor and retry or refund by bank transfer.` });
    }
    await recordStatusChange(tx, { entityType: "REFUND", entityId: r.id, from: r.status, to: outcome === "processed" ? "PROCESSED" : "FAILED", actorId: null });
    await notify(tx, {
      userId: p.payerUserId, to: p.payerEmail, template: "refund_update",
      params: { name: p.payerName, reference: p.reference, amount: formatMoney(r.amountMinor, p.currency), status: outcome === "processed" ? "processed" : "unsuccessful – we will contact you" },
      dedupeKey: `refund-update:${r.id}:${outcome}`,
    });
    return "APPLIED";
  });
}

/** Chargebacks / disputes. A lost dispute reduces the fund like a refund. */
export async function applyDisputeEvent(event: Extract<NormalizedEvent, { kind: "dispute.created" | "dispute.won" | "dispute.lost" }>): Promise<string> {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "payments" WHERE "reference" = ${event.reference} FOR UPDATE`;
    if (!rows[0]) return "IGNORED_UNKNOWN";
    const p = await tx.payment.findUniqueOrThrow({ where: { id: rows[0].id } });
    let cb = await tx.chargeback.findUnique({ where: { providerDisputeId: event.disputeId } });
    const amount = event.amountMinor && event.amountMinor > 0n ? event.amountMinor : p.amountMinor - p.refundedMinor;

    if (event.kind === "dispute.created") {
      if (cb) return "IGNORED_DUPLICATE";
      await tx.chargeback.create({ data: { paymentId: p.id, providerDisputeId: event.disputeId, amountMinor: amount } });
      if (p.status !== "DISPUTED") {
        await tx.payment.update({ where: { id: p.id }, data: { status: "DISPUTED" } });
        await recordStatusChange(tx, { entityType: "PAYMENT", entityId: p.id, from: p.status, to: "DISPUTED", actorId: null, reason: "Dispute opened" });
      }
      await raiseRiskAlert(tx, { type: "PAYMENT_DISPUTED", severity: "HIGH", paymentId: p.id, campaignId: p.campaignId, dedupeKey: `dispute:${event.disputeId}`, details: `A dispute was opened on ${p.reference}. Respond through the provider dashboard with the contribution evidence.` });
      return "APPLIED";
    }
    if (!cb) cb = await tx.chargeback.create({ data: { paymentId: p.id, providerDisputeId: event.disputeId, amountMinor: amount } });
    if (cb.status !== "OPEN") return "IGNORED_DUPLICATE";
    await tx.chargeback.update({ where: { id: cb.id }, data: { status: event.kind === "dispute.lost" ? "LOST" : "WON", resolvedAt: new Date() } });
    let refunded = p.refundedMinor;
    if (event.kind === "dispute.lost") {
      const lost = cb.amountMinor > p.amountMinor - p.refundedMinor ? p.amountMinor - p.refundedMinor : cb.amountMinor;
      refunded += lost;
      await postJournal(tx, {
        idempotencyKey: `chargeback:${cb.id}:lost`, description: `Chargeback lost on ${p.reference}`, sourceType: "CHARGEBACK", sourceId: cb.id, currency: p.currency,
        lines: [{ account: "CONTRIBUTION_REFUNDS", debit: lost, campaignId: p.campaignId }, { account: "CASH", credit: lost }],
      });
      await tx.campaign.update({ where: { id: p.campaignId }, data: { refundedAmountMinor: { increment: lost } } });
    }
    const next = statusAfterRefund(p.amountMinor, refunded);
    await tx.payment.update({ where: { id: p.id }, data: { status: next, refundedMinor: refunded } });
    await recordStatusChange(tx, { entityType: "PAYMENT", entityId: p.id, from: p.status, to: next, actorId: null, reason: event.kind });
    await syncCampaignFundingStatus(tx, p.campaignId);
    return "APPLIED";
  });
}

export async function listRefunds(actor: Actor, status?: string) {
  requirePermission(actor, "finance.view");
  return db.refund.findMany({
    where: status ? { status: status as never } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { payment: { select: { reference: true, amountMinor: true, payerName: true, campaign: { select: { title: true } } } } },
  });
}

export type { Payment };
