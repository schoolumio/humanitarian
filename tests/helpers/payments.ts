import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { buildSandboxWebhook, sandboxCompleteCheckout } from "@/lib/payments/sandbox";
import { initiateDonation, processWebhook } from "@/server/services/payments";
import type { Actor } from "@/server/actor";

export const key = () => randomUUID().replace(/-/g, "");

export async function donate(publicId: string, amountNaira: string, actor: Actor | null = null, email = "donor.person@example.test") {
  const r = await initiateDonation(actor, publicId, { amount: amountNaira, email, name: "Donor Person", anonymous: "on", idempotencyKey: key() }, { ipHash: `ip-${key()}` });
  return db.payment.findUniqueOrThrow({ where: { reference: r.reference } });
}

export async function sendWebhook(event: string, data: Record<string, string>, id?: string) {
  const { raw, signature } = buildSandboxWebhook(event, data, id);
  return processWebhook("sandbox", raw, new Headers({ "x-sandbox-signature": signature }));
}

/** Customer pays at the sandbox checkout and the provider sends a signed webhook. */
export async function payAndNotify(reference: string, outcome: "success" | "failed" = "success", eventId?: string) {
  await sandboxCompleteCheckout(reference, outcome);
  return sendWebhook(outcome === "success" ? "charge.success" : "charge.failed", { reference }, eventId);
}
