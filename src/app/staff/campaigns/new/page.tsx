import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { Card, PageHeader } from "@/components/ui";
import { CampaignForm, campaignFormInput } from "@/components/staff/campaign-form";
import { getActor, requirePagePermission } from "@/server/current-user";
import { requireActor } from "@/server/actor";
import { runAction, withRedirect, type FormState } from "@/server/action";
import { createCampaign } from "@/server/services/campaigns";

export const metadata = { title: "Prepare campaign" };

export default async function NewCampaign({
  searchParams,
}: {
  searchParams: Promise<{ application?: string }>;
}) {
  await requirePagePermission("campaign.manage");
  const { application = "" } = await searchParams;
  const app = await db.application.findUnique({
    where: { id: application },
    include: { budgetItems: true, decisions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!app || app.status !== "APPROVED") notFound();

  async function create(_: FormState, fd: FormData): Promise<FormState> {
    "use server";
    let id = "";
    const r = await runAction(async () => {
      id = (await createCampaign(requireActor(await getActor()), application, campaignFormInput(fd))).id;
    });
    return withRedirect(r, `/staff/campaigns/${id}`);
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`Prepare campaign for ${app.reference}`}
        description={`Approved amount: ${app.decisions[0]?.approvedAmountMinor ? formatMoney(app.decisions[0].approvedAmountMinor) : "—"}`}
      />
      <Card>
        <CampaignForm
          action={create}
          lines={app.budgetItems.map((b, i) => ({
            id: b.id,
            campaignId: "",
            description: `${b.quantity} × ${b.description}`,
            amountMinor: b.unitCostMinor * BigInt(b.quantity),
            sortOrder: i,
          }))}
          submitLabel="Create draft campaign"
        />
      </Card>
    </div>
  );
}
