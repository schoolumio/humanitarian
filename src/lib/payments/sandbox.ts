import { db } from "../db";
import { env } from "../env";
import { hmacHex, safeEqual } from "../crypto";
import { bpsOf } from "../money";
import type { NormalizedEvent, PaymentProvider } from "./types";

/**
 * Sandbox provider for development, automated tests and demos. It behaves like a real
 * provider from the application's point of view: a hosted checkout page, signed webhooks
 * delivered to /api/webhooks/sandbox, and a server-side verify call backed by its own
 * records (SandboxTransaction). No real money moves.
 */
export const SANDBOX_FEE_BPS = 150; // illustrative 1.5% fee so fee accounting is exercised

const secret = () => {
  const s = env().SANDBOX_WEBHOOK_SECRET;
  if (!s) throw new Error("SANDBOX_WEBHOOK_SECRET is not configured");
  return s;
};

export const signSandboxPayload = (raw: string) => hmacHex("sha512", secret(), raw);

export const sandboxProvider: PaymentProvider = {
  name: "sandbox",

  async initialize(input) {
    await db.sandboxTransaction.upsert({
      where: { reference: input.reference },
      create: {
        reference: input.reference,
        status: "pending",
        amountMinor: input.amountMinor,
        currency: input.currency,
        email: input.email,
      },
      update: {},
    });
    return { checkoutUrl: `${env().APP_BASE_URL}/sandbox/checkout/${input.reference}` };
  },

  async verify(reference) {
    const t = await db.sandboxTransaction.findUnique({ where: { reference } });
    if (!t) return null;
    return {
      reference: t.reference,
      status: t.status as "success" | "failed" | "abandoned" | "pending",
      amountMinor: t.amountMinor,
      currency: t.currency,
      feeMinor: t.feeMinor,
      providerTransactionId: `sbx_${t.id}`,
      paidAt: t.paidAt,
    };
  },

  verifySignature(rawBody, headers) {
    const sig = headers.get("x-sandbox-signature");
    return !!sig && safeEqual(sig, signSandboxPayload(rawBody));
  },

  parseEvent(rawBody) {
    const body = JSON.parse(rawBody) as { event: string; id: string; data: Record<string, string> };
    const d = body.data ?? {};
    let event: NormalizedEvent;
    switch (body.event) {
      case "charge.success":
      case "charge.failed":
        event = { kind: body.event, reference: d.reference!, dedupeKey: `sandbox:${body.event}:${body.id}` };
        break;
      case "refund.processed":
      case "refund.failed":
        event = {
          kind: body.event,
          reference: d.reference ?? null,
          providerRefundId: d.refundId ?? null,
          amountMinor: d.amount ? BigInt(d.amount) : null,
          dedupeKey: `sandbox:${body.event}:${body.id}`,
        };
        break;
      case "dispute.created":
      case "dispute.won":
      case "dispute.lost":
        event = {
          kind: body.event,
          reference: d.reference!,
          disputeId: d.disputeId!,
          amountMinor: d.amount ? BigInt(d.amount) : null,
          dedupeKey: `sandbox:${body.event}:${body.id}`,
        };
        break;
      default:
        event = { kind: "ignored", eventType: body.event, dedupeKey: `sandbox:${body.event}:${body.id}` };
    }
    return { eventType: body.event, event, sanitized: body };
  },

  async refund({ reference, amountMinor, refundId }) {
    const t = await db.sandboxTransaction.findUnique({ where: { reference } });
    if (!t || t.status !== "success") return { providerRefundId: `sbx_rf_${refundId}`, status: "failed" };
    const refunds = (t.refunds as { id: string; amount: string }[]) ?? [];
    await db.sandboxTransaction.update({
      where: { reference },
      data: { refunds: [...refunds, { id: refundId, amount: amountMinor.toString() }] },
    });
    return { providerRefundId: `sbx_rf_${refundId}`, status: "processed" };
  },
};

/** Simulate the customer completing (or failing) checkout, as the provider would. */
export async function sandboxCompleteCheckout(
  reference: string,
  outcome: "success" | "failed",
  opts: { amountOverrideMinor?: bigint } = {},
) {
  const t = await db.sandboxTransaction.findUnique({ where: { reference } });
  if (!t) throw new Error("Unknown sandbox transaction");
  if (t.status !== "pending") return t;
  const amount = opts.amountOverrideMinor ?? t.amountMinor;
  return db.sandboxTransaction.update({
    where: { reference },
    data: {
      status: outcome,
      amountMinor: amount,
      feeMinor: outcome === "success" ? bpsOf(amount, SANDBOX_FEE_BPS) : 0n,
      paidAt: outcome === "success" ? new Date() : null,
    },
  });
}

/** Build a signed sandbox webhook (used by the sandbox checkout page and by tests). */
export function buildSandboxWebhook(
  event: string,
  data: Record<string, string>,
  id = `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
) {
  const raw = JSON.stringify({ event, id, data });
  return { raw, signature: signSandboxPayload(raw) };
}
