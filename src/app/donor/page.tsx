import Link from "next/link";
import { redirect } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { PAYMENT_STATUS_LABEL } from "@/lib/workflow/payment";
import { CAMPAIGN_STATUS_LABEL } from "@/lib/workflow/campaign";
import { Badge, ButtonLink, DataTable, EmptyState, PageHeader, formatDate } from "@/components/ui";
import { requirePageActor } from "@/server/current-user";
import { listOwnContributions } from "@/server/services/payments";

export const metadata = { title: "My giving" };

export default async function DonorPage() {
  const actor = await requirePageActor("/donor");
  if (!actor.permissions.has("donation.own")) redirect("/forbidden");
  const rows = await listOwnContributions(actor);
  return (
    <div>
      <PageHeader title="My giving" description="Contributions linked to your account or made with your email address." actions={<ButtonLink href="/cases" variant="cta">Find a verified case</ButtonLink>} />
      {rows.length ? <DataTable caption="Contributions" rows={rows} rowKey={(r) => r.reference} columns={[
        { header: "Case", cell: (r) => <Link href={`/cases/${r.campaign.publicId}`}>{r.campaign.title}</Link> },
        { header: "Amount", cell: (r) => <>{formatMoney(r.amountMinor, r.currency)}{r.refundedMinor > 0n && <span className="block text-sm text-muted">refunded {formatMoney(r.refundedMinor)}</span>}</> },
        { header: "Status", cell: (r) => <Badge tone={r.status === "SUCCEEDED" ? "success" : r.status === "FAILED" ? "danger" : "neutral"}>{PAYMENT_STATUS_LABEL[r.status]}</Badge> },
        { header: "Case progress", cell: (r) => CAMPAIGN_STATUS_LABEL[r.campaign.status] },
        { header: "Date", cell: (r) => formatDate(r.paidAt ?? r.createdAt) },
        { header: "Receipt", cell: (r) => (["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED", "REFUND_PENDING", "DISPUTED"].includes(r.status) ? <Link href={`/donor/receipts/${r.reference}`}>View receipt</Link> : "—") },
      ]} /> : <EmptyState title="No contributions yet" action={<ButtonLink href="/cases">Explore verified cases</ButtonLink>} />}
    </div>
  );
}
