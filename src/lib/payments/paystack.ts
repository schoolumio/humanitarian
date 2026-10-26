import { env } from "../env";
import { hmacHex, safeEqual } from "../crypto";
import { sanitizePayload, type NormalizedEvent, type PaymentProvider, type VerifiedTransaction } from "./types";

/**
 * Paystack integration (https://paystack.com/docs).
 * - Amounts are sent and received in the minor unit (kobo for NGN).
 * - Webhooks carry `x-paystack-signature` = HMAC-SHA512(raw body, secret key).
 * - A webhook is only a hint: every charge is re-verified via GET /transaction/verify/:reference.
 *
 * Event names for refunds and disputes ("refund.*", "charge.dispute.*") and their payload
 * fields MUST be confirmed against Paystack's current documentation before live use; unknown
 * shapes are stored and ignored rather than guessed at (see docs/payments.md).
 */
const API = "https://api.paystack.co";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env().PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: unknown };
  if (!res.ok || body.status !== true) throw new Error(`Paystack ${path} failed: ${res.status} ${body.message ?? ""}`.trim());
  return body.data as T;
}

const str = (v: unknown) => (v === undefined || v === null ? null : String(v));
const big = (v: unknown) => (v === undefined || v === null || v === "" ? null : BigInt(Math.trunc(Number(v))));

export const paystackProvider: PaymentProvider = {
  name: "paystack",

  async initialize(input) {
    const data = await call<{ authorization_url: string }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        amount: input.amountMinor.toString(),
        currency: input.currency,
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      }),
    });
    return { checkoutUrl: data.authorization_url };
  },

  async verify(reference) {
    try {
      const d = await call<{ id: number; status: string; reference: string; amount: number; currency: string; fees: number | null; paid_at: string | null }>(
        `/transaction/verify/${encodeURIComponent(reference)}`,
      );
      const status = (["success", "failed", "abandoned", "pending", "reversed"].includes(d.status) ? d.status : "unknown") as VerifiedTransaction["status"];
      return {
        reference: d.reference,
        status,
        amountMinor: BigInt(d.amount),
        currency: d.currency,
        feeMinor: BigInt(d.fees ?? 0),
        providerTransactionId: String(d.id),
        paidAt: d.paid_at ? new Date(d.paid_at) : null,
      };
    } catch {
      return null;
    }
  },

  verifySignature(rawBody, headers) {
    const sig = headers.get("x-paystack-signature");
    const secret = env().PAYSTACK_SECRET_KEY;
    if (!sig || !secret) return false;
    return safeEqual(sig, hmacHex("sha512", secret, rawBody));
  },

  parseEvent(rawBody) {
    const body = JSON.parse(rawBody) as { event?: string; data?: Record<string, unknown> };
    const type = String(body.event ?? "unknown");
    const d = body.data ?? {};
    const tx = (d.transaction ?? {}) as Record<string, unknown>;
    let event: NormalizedEvent;
    switch (type) {
      case "charge.success":
        event = { kind: "charge.success", reference: String(d.reference), dedupeKey: `paystack:charge.success:${str(d.id) ?? d.reference}` };
        break;
      case "refund.processed":
      case "refund.failed":
      case "refund.pending": {
        const reference = str(d.transaction_reference) ?? str(tx.reference);
        const providerRefundId = str(d.id) ?? str(d.refund_reference);
        event = { kind: type, reference, providerRefundId, amountMinor: big(d.amount), dedupeKey: `paystack:${type}:${providerRefundId ?? reference}` };
        break;
      }
      case "charge.dispute.create":
      case "charge.dispute.resolve": {
        const disputeId = str(d.id) ?? "unknown";
        const resolution = str(d.resolution) ?? str(d.status) ?? "";
        const kind = type === "charge.dispute.create" ? "dispute.created" : /merchant-accepted|lost|refund/i.test(resolution) ? "dispute.lost" : "dispute.won";
        event = { kind, disputeId, reference: String(tx.reference ?? d.transaction_reference ?? ""), amountMinor: big(d.refund_amount ?? tx.amount), dedupeKey: `paystack:${kind}:${disputeId}` };
        break;
      }
      default:
        event = { kind: "ignored", eventType: type, dedupeKey: `paystack:${type}:${str(d.id) ?? str(d.reference) ?? hmacHex("sha256", "dedupe", rawBody)}` };
    }
    return { eventType: type, event, sanitized: sanitizePayload(body) };
  },

  async refund({ reference, amountMinor }) {
    const d = await call<{ id?: number; status?: string; transaction?: { reference?: string } }>("/refund", {
      method: "POST",
      body: JSON.stringify({ transaction: reference, amount: amountMinor.toString() }),
    });
    return { providerRefundId: String(d.id ?? `ref_${reference}`), status: d.status === "processed" ? "processed" : "pending" };
  },
};
