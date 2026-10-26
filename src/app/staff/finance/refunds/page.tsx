import { revalidatePath } from "next/cache";
import { formatMoney } from "@/lib/money";
import { Badge, DataTable, EmptyState, PageHeader, formatDate, humanize, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { requirePagePermission } from "@/server/current-user";
import { runAction, currentActor, str, type FormState } from "@/server/action";
import { approveRefund, listRefunds, rejectRefund } from "@/server/services/refunds";

export const metadata = { title: "Refunds" };

export default async function RefundsPage() {
  const actor = await requirePagePermission("finance.view");
  const rows = await listRefunds(actor);
  async function approve(id: string): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await approveRefund(await currentActor(), id);
      revalidatePath("/staff/finance/refunds");
      return "Approved. The refund is being submitted to the provider.";
    });
  }
  async function reject(id: string, _: FormState, fd: FormData): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await rejectRefund(await currentActor(), id, str(fd, "reason"));
      revalidatePath("/staff/finance/refunds");
      return "Rejected.";
    });
  }
  return (
    <div>
      <PageHeader
        title="Refunds"
        description="Refunds are requested by one finance officer and approved by another. Approval reduces the restricted fund; cash leaves when the provider settles."
      />
      {rows.length ? (
        <DataTable
          caption="Refunds"
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            {
              header: "Payment",
              cell: (r) => <span className="font-mono text-sm">{r.payment.reference}</span>,
            },
            { header: "Campaign", cell: (r) => r.payment.campaign.title },
            {
              header: "Amount",
              cell: (r) => `${formatMoney(r.amountMinor)} of ${formatMoney(r.payment.amountMinor)}`,
            },
            { header: "Reason", cell: (r) => r.reason },
            {
              header: "Status",
              cell: (r) => (
                <Badge
                  tone={
                    r.status === "PROCESSED"
                      ? "success"
                      : r.status === "FAILED" || r.status === "REJECTED"
                        ? "danger"
                        : "warning"
                  }
                >
                  {humanize(r.status)}
                </Badge>
              ),
            },
            { header: "Requested", cell: (r) => formatDate(r.createdAt, true) },
            {
              header: "Decision",
              cell: (r) =>
                r.status === "REQUESTED" && actor.permissions.has("finance.refund.approve") ? (
                  r.requestedById === actor.userId ? (
                    <span className="text-sm text-muted">Awaiting another officer</span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <ActionForm action={approve.bind(null, r.id)}>
                        <SubmitButton variant="secondary" confirm="Approve this refund?">
                          Approve
                        </SubmitButton>
                      </ActionForm>
                      <ActionForm action={reject.bind(null, r.id)}>
                        <input
                          name="reason"
                          className={inputClass}
                          placeholder="Reason"
                          aria-label="Rejection reason"
                        />
                        <SubmitButton variant="ghost">Reject</SubmitButton>
                      </ActionForm>
                    </div>
                  )
                ) : (
                  "—"
                ),
            },
          ]}
        />
      ) : (
        <EmptyState title="No refunds" />
      )}
    </div>
  );
}
