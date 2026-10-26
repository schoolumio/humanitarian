import { revalidatePath } from "next/cache";
import { formatMoney } from "@/lib/money";
import { Badge, DataTable, EmptyState, PageHeader, humanize, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { getActor, requirePagePermission } from "@/server/current-user";
import { requireActor } from "@/server/actor";
import { runAction, str, type FormState } from "@/server/action";
import { listInKindForStaff, updateInKind } from "@/server/services/sponsors";

export const metadata = { title: "In-kind contributions" };

export default async function InKindPage() {
  const actor = await requirePagePermission("inkind.manage");
  const rows = await listInKindForStaff(actor);
  async function act(id: string, _: FormState, fd: FormData): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await updateInKind(requireActor(await getActor()), id, str(fd, "action") as "ACCEPT", {
        quantityDelivered: Number(str(fd, "quantity") || 0),
        note: str(fd, "note"),
      });
      revalidatePath("/staff/in-kind");
      return "Updated.";
    });
  }
  return (
    <div>
      <PageHeader
        title="In-kind contributions"
        description="Offers are not donations until delivery is confirmed. Estimated values are shown separately and never counted as cash."
      />
      {rows.length ? (
        <DataTable
          caption="In-kind"
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { header: "From", cell: (r) => r.organisation?.name ?? "Individual" },
            { header: "Case", cell: (r) => r.campaign.title },
            {
              header: "Item",
              cell: (r) => (
                <>
                  {humanize(r.itemCategory)}: {r.description}
                </>
              ),
            },
            { header: "Quantity", cell: (r) => `${r.quantityDelivered}/${r.quantity} ${r.unit} delivered` },
            {
              header: "Estimated value",
              cell: (r) =>
                r.estimatedValueMinor ? (
                  <>
                    {formatMoney(r.estimatedValueMinor)}
                    <span className="block text-xs text-muted">{r.valuationBasis}</span>
                  </>
                ) : (
                  "—"
                ),
            },
            { header: "Status", cell: (r) => <Badge>{humanize(r.status)}</Badge> },
            {
              header: "Action",
              cell: (r) =>
                ["DELIVERED", "DECLINED", "CANCELLED"].includes(r.status) ? (
                  "—"
                ) : (
                  <ActionForm action={act.bind(null, r.id)}>
                    <select name="action" className={inputClass} aria-label="Action">
                      {r.status === "OFFERED" && (
                        <>
                          <option value="ACCEPT">Accept offer</option>
                          <option value="DECLINE">Decline offer</option>
                        </>
                      )}
                      {["ACCEPTED", "PARTIALLY_DELIVERED"].includes(r.status) && (
                        <option value="DELIVER">Confirm delivery</option>
                      )}
                      <option value="CANCEL">Cancel</option>
                    </select>
                    <input
                      name="quantity"
                      type="number"
                      min={1}
                      className={inputClass}
                      placeholder="Qty delivered"
                      aria-label="Quantity delivered"
                    />
                    <input
                      name="note"
                      className={inputClass}
                      placeholder="Delivery evidence / note"
                      aria-label="Note"
                    />
                    <SubmitButton variant="secondary">Apply</SubmitButton>
                  </ActionForm>
                ),
            },
          ]}
        />
      ) : (
        <EmptyState title="No in-kind offers yet" />
      )}
    </div>
  );
}
