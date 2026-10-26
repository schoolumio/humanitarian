import { env } from "../env";
import { paystackProvider } from "./paystack";
import { sandboxProvider } from "./sandbox";
import type { PaymentProvider } from "./types";

export function paymentProvider(name?: string): PaymentProvider {
  const n = name ?? env().PAYMENT_PROVIDER;
  if (n === "paystack") return paystackProvider;
  if (n === "sandbox") {
    if (env().NODE_ENV === "production" && env().PAYMENTS_LIVE_MODE_APPROVED === "true") {
      throw new Error("Sandbox payments are disabled in live mode");
    }
    return sandboxProvider;
  }
  throw new Error(`Unknown payment provider ${n}`);
}

/** Whether real money can be collected. Requires explicit sign-off (see docs/launch-checklist.md). */
export function isLiveMoneyEnabled() {
  const e = env();
  return (
    e.PAYMENT_PROVIDER === "paystack" &&
    e.PAYMENTS_LIVE_MODE_APPROVED === "true" &&
    !!e.PAYSTACK_SECRET_KEY?.startsWith("sk_live_")
  );
}

export function paymentModeLabel() {
  const e = env();
  if (e.PAYMENT_PROVIDER === "sandbox") return "Sandbox (no real money)";
  return isLiveMoneyEnabled() ? "Live" : "Paystack test mode (no real money)";
}
