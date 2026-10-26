import Link from "@/components/ui/link";
import { formatMoney } from "@/lib/money";
import { CAMPAIGN_STATUS_LABEL } from "@/lib/workflow/campaign";
import { Badge, DataTable, EmptyState, PageHeader, Section, formatDate } from "@/components/ui";
import { requirePagePermission } from "@/server/current-user";
import { approvedCasesWithoutCampaign, listStaffCampaigns } from "@/server/services/campaigns";

export const metadata = { title: "Campaigns" };

export default async function StaffCampaigns({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const actor = await requirePagePermission([
    "campaign.manage",
    "intervention.manage",
    "finance.view",
    "media.manage",
  ]);
  const { status } = await searchParams;
  const [rows, pending] = await Promise.all([
    listStaffCampaigns(actor, status),
    actor.permissions.has("campaign.manage") ? approvedCasesWithoutCampaign(actor) : Promise.resolve([]),
  ]);
  return (
    <div>
      <PageHeader title="Campaigns" />
      {pending.length > 0 && (
        <Section title="Approved cases without a campaign">
          <ul className="flex flex-col gap-2">
            {pending.map((p) => (
              <li key={p.id}>
                <Link href={`/staff/campaigns/new?application=${p.id}`} className="font-semibold">
                  {p.reference}
                </Link>{" "}
                · {p.category?.name} · approved {formatDate(p.decidedAt)}
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="All campaigns">
        {rows.length ? (
          <DataTable
            caption="Campaigns"
            rows={rows}
            rowKey={(r) => r.id}
            columns={[
              {
                header: "Title",
                cell: (r) => (
                  <Link href={`/staff/campaigns/${r.id}`} className="font-semibold">
                    {r.title}
                  </Link>
                ),
              },
              { header: "Status", cell: (r) => <Badge>{CAMPAIGN_STATUS_LABEL[r.status]}</Badge> },
              { header: "Visibility", cell: (r) => (r.visibility === "PUBLIC" ? "Public" : "Sponsors only") },
              {
                header: "Confirmed / target",
                cell: (r) =>
                  `${formatMoney(r.confirmedAmountMinor - r.refundedAmountMinor)} / ${formatMoney(r.targetAmountMinor)}`,
              },
              { header: "Updated", cell: (r) => formatDate(r.updatedAt) },
            ]}
          />
        ) : (
          <EmptyState title="No campaigns yet">Campaigns are created from approved cases.</EmptyState>
        )}
      </Section>
    </div>
  );
}
