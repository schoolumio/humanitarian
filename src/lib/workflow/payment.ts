import type { PaymentStatus } from "@prisma/client";

/**
 * Payment state machine. Provider truth (signed webhook + server-side verification)
 * is the only way to reach SUCCEEDED. Out-of-order events are resolved by this table:
 * an event that would move a payment "backwards" is ignored and recorded as stale.
 */
export const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  CREATED: ["PENDING", "FAILED", "SUCCEEDED"],
  PENDING: ["SUCCEEDED", "FAILED"],
  // A late success after a timeout/abandonment is honoured: the provider has the money.
  FAILED: ["SUCCEEDED"],
  SUCCEEDED: ["REFUND_PENDING", "DISPUTED", "PARTIALLY_REFUNDED", "REFUNDED"],
  REFUND_PENDING: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED", "DISPUTED"],
  PARTIALLY_REFUNDED: ["REFUND_PENDING", "REFUNDED", "DISPUTED"],
  DISPUTED: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"],
  REFUNDED: [],
};

export const canMovePayment = (from: PaymentStatus, to: PaymentStatus) =>
  PAYMENT_TRANSITIONS[from].includes(to);

/** Statuses whose amount counts toward confirmed (gross) funding. */
export const CONFIRMED_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "SUCCEEDED",
  "REFUND_PENDING",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
  "DISPUTED",
];

/** Status after a refund settles, based on the cumulative refunded amount. */
export function statusAfterRefund(amount: bigint, refunded: bigint): PaymentStatus {
  if (refunded <= 0n) return "SUCCEEDED";
  return refunded >= amount ? "REFUNDED" : "PARTIALLY_REFUNDED";
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  CREATED: "Created",
  PENDING: "Awaiting confirmation",
  SUCCEEDED: "Confirmed",
  FAILED: "Failed",
  REFUND_PENDING: "Refund in progress",
  PARTIALLY_REFUNDED: "Partially refunded",
  REFUNDED: "Refunded",
  DISPUTED: "Disputed",
};
