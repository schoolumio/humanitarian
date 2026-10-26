import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { Alert, Button, Card } from "@/components/ui";
import { buildSandboxWebhook, sandboxCompleteCheckout } from "@/lib/payments/sandbox";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sandbox checkout" };

/**
 * Simulated hosted checkout for the sandbox provider. It plays the provider's role: records
 * the outcome in the provider's own store and delivers a signed webhook to our endpoint.
 * Disabled unless PAYMENT_PROVIDER=sandbox.
 */
export default async function SandboxCheckout({ params }: { params: Promise<{ reference: string }> }) {
  if (env().PAYMENT_PROVIDER !== "sandbox") notFound();
  const { reference } = await params;
  const t = await db.sandboxTransaction.findUnique({ where: { reference } });
  if (!t) notFound();

  async function complete(fd: FormData) {
    "use server";
    if (env().PAYMENT_PROVIDER !== "sandbox") return;
    const outcome = fd.get("outcome") === "success" ? "success" : "failed";
    await sandboxCompleteCheckout(reference, outcome);
    const { raw, signature } = buildSandboxWebhook(outcome === "success" ? "charge.success" : "charge.failed", { reference });
    // Deliver the webhook over HTTP exactly like a provider would.
    await fetch(`${env().APP_BASE_URL}/api/webhooks/sandbox`, { method: "POST", headers: { "Content-Type": "application/json", "x-sandbox-signature": signature }, body: raw }).catch(() => undefined);
    redirect(`/give/return?reference=${reference}`);
  }

  return (
    <div className="mx-auto max-w-md">
      <Alert tone="warning" title="Sandbox payment – no real money moves">This page simulates a payment provider for testing.</Alert>
      <Card className="mt-4">
        <p className="text-sm text-muted">Paying</p>
        <p className="text-3xl font-bold text-teal">{formatMoney(t.amountMinor, t.currency)}</p>
        <p className="mt-1 text-sm">Receipt to {t.email}</p>
        {t.status === "pending" ? (
          <form action={complete} className="mt-4 flex flex-col gap-2">
            <Button name="outcome" value="success" variant="cta">Simulate successful payment</Button>
            <Button name="outcome" value="failed" variant="secondary">Simulate failed payment</Button>
          </form>
        ) : (
          <p className="mt-4">This sandbox transaction is already {t.status}.</p>
        )}
      </Card>
    </div>
  );
}
