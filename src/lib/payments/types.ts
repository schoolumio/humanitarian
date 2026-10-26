/**
 * Payment-provider abstraction. The rest of the application only sees these types, so the
 * provider (or the lawful operating model behind it) can change without touching the
 * financial core.
 */
export type InitializeInput = {
  reference: string;
  amountMinor: bigint;
  currency: string;
  email: string;
  callbackUrl: string;
  metadata: Record<string, string>;
};

export type VerifiedTransaction = {
  reference: string;
  status: "success" | "failed" | "abandoned" | "pending" | "reversed" | "unknown";
  amountMinor: bigint;
  currency: string;
  feeMinor: bigint;
  providerTransactionId: string;
  paidAt: Date | null;
};

export type NormalizedEvent =
  | { kind: "charge.success" | "charge.failed"; dedupeKey: string; reference: string }
  | {
      kind: "refund.processed" | "refund.failed" | "refund.pending";
      dedupeKey: string;
      reference: string | null;
      providerRefundId: string | null;
      amountMinor: bigint | null;
    }
  | {
      kind: "dispute.created" | "dispute.won" | "dispute.lost";
      dedupeKey: string;
      reference: string;
      disputeId: string;
      amountMinor: bigint | null;
    }
  | { kind: "ignored"; dedupeKey: string; eventType: string };

export interface PaymentProvider {
  readonly name: "paystack" | "sandbox";
  initialize(input: InitializeInput): Promise<{ checkoutUrl: string }>;
  /** Server-to-server lookup – the trusted source of truth for a transaction's state. */
  verify(reference: string): Promise<VerifiedTransaction | null>;
  verifySignature(rawBody: string, headers: Headers): boolean;
  parseEvent(rawBody: string): { eventType: string; event: NormalizedEvent; sanitized: unknown };
  refund(input: {
    reference: string;
    providerTransactionId: string | null;
    amountMinor: bigint;
    refundId: string;
  }): Promise<{
    providerRefundId: string;
    status: "processed" | "pending" | "failed";
  }>;
}

/** Remove card/authorisation/customer details before storing provider payloads. */
export function sanitizePayload(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitizePayload(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (
      /authorization|card|bin|last4|exp_|cvv|pan|account_number|bank_account|signature|customer|ip_address|phone|metadata/i.test(
        k,
      )
    ) {
      out[k] = "[removed]";
    } else out[k] = sanitizePayload(v, depth + 1);
  }
  return out;
}
