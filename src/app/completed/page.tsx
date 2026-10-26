import { EmptyState, PageHeader } from "@/components/ui";
import { CampaignCard } from "@/components/public/campaign-card";
import { listPublicCampaigns } from "@/server/services/campaigns";

export const metadata = { title: "Completed interventions" };
export const dynamic = "force-dynamic";

export default async function CompletedPage() {
  const { rows } = await listPublicCampaigns({ status: "completed" });
  return (
    <div>
      <PageHeader
        title="Completed interventions"
        description="Cases where delivery was evidenced and the outcome independently reviewed."
      />
      {rows.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c) => (
            <CampaignCard key={c.publicId} c={c} />
          ))}
        </div>
      ) : (
        <EmptyState title="No completed interventions yet">
          Interventions are listed here only after an outcome review.
        </EmptyState>
      )}
    </div>
  );
}
