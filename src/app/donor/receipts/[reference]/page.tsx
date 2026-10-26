import { notFound } from "next/navigation";
import { AppError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { PAYMENT_STATUS_LABEL } from "@/lib/workflow/payment";
import { Card, DefinitionList, formatDate } from "@/components/ui";
import { requirePageActor } from "@/server/current-user";
import { getOwnReceipt } from "@/server/services/payments";

export const metadata = { title: "Receipt" };

export default async function ReceiptPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const actor = await requirePageActor(`/donor/receipts/${reference}`);
  let p;
  try { p = await getOwnReceipt(actor, reference); } catch (e) { if (e instanceof AppError) notFound(); throw e; }
  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <h1 className="text-2xl">Contribution receipt</h1>
        <p className="mt-1 text-sm text-muted">KindSpring · This is a record of your contribution. It is not a tax receipt unless KindSpring&apos;s registered status and the applicable rules allow one to be issued.</p>
        <div className="mt-4"><DefinitionList items={[
          ["Reference", <span key="r" className="font-mono">{p.reference}</span>], ["Received from", p.payerName], ["Amount", formatMoney(p.amountMinor, p.currency)],
          ["Date confirmed", formatDate(p.paidAt, true)], ["Restricted to", p.campaign.title], ["Status", PAYMENT_STATUS_LABEL[p.status]],
          ["Refunds", p.refunds.length ? p.refunds.map((r) => `${formatMoney(r.amountMinor)} (${r.status.toLowerCase()})`).join(", ") : "None"],
          ["Shown publicly", p.isAnonymous ? "Anonymously" : "With your name"],
        ]} /></div>
      </Card>
    </div>
  );
}
