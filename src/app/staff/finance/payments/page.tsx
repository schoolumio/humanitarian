import Link from "@/components/ui/link";
import { formatMoney } from "@/lib/money";
import { PAYMENT_STATUS_LABEL } from "@/lib/workflow/payment";
import { db } from "@/lib/db";
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  Field,
  PageHeader,
  Pagination,
  Section,
  buttonClass,
  formatDate,
  inputClass,
} from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { requirePagePermission } from "@/server/current-user";
import { runAction, currentActor, str, type FormState } from "@/server/action";
import {
  confirmOfflineReceipt,
  listPaymentsForFinance,
  reconcileNow,
  recordOfflineReceipt,
} from "@/server/services/payments";
import { requestRefund } from "@/server/services/refunds";

export const metadata = { title: "Payments" };

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requirePagePermission("finance.view");
  const sp = await searchParams;
  const res = await listPaymentsForFinance(actor, {
    status: sp.status,
    reconciliation: sp.reconciliation,
    q: sp.q,
    page: Number(sp.page ?? 1),
  });
  const signed = await db.sponsorshipAgreement.findMany({
    where: { status: "SIGNED" },
    include: { organisation: { select: { name: true } }, campaign: { select: { title: true } } },
  });

  async function reconcile(id: string): Promise<FormState> {
    "use server";
    return runAction(async () => {
      const r = await reconcileNow(await currentActor(), id);
      return `Checked with provider: ${r ?? "no provider record"}.`;
    });
  }
  async function refund(id: string, _: FormState, fd: FormData): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await requestRefund(await currentActor(), id, str(fd, "amount"), str(fd, "reason"));
      return "Refund requested. A second finance officer must approve it.";
    });
  }
  async function offline(_: FormState, fd: FormData): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await recordOfflineReceipt(await currentActor(), {
        agreementId: str(fd, "agreementId"),
        amount: str(fd, "amount"),
        bankReference: str(fd, "bankReference"),
        receivedOn: str(fd, "receivedOn"),
      });
      return "Receipt recorded. A different finance officer must confirm it against the bank statement.";
    });
  }
  async function confirm(id: string): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await confirmOfflineReceipt(await currentActor(), id);
      return "Receipt confirmed.";
    });
  }

  return (
    <div>
      <PageHeader
        title="Payments and reconciliation"
        description="Only provider-verified payments count toward funding. Use “Check with provider” to reconcile individual payments; a sweep also runs automatically."
      />
      <form className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end" role="search">
        <div>
          <label htmlFor="status" className="text-sm font-semibold">
            Status
          </label>
          <select id="status" name="status" defaultValue={sp.status ?? ""} className={inputClass}>
            <option value="">All</option>
            {Object.entries(PAYMENT_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="reconciliation" className="text-sm font-semibold">
            Reconciliation
          </label>
          <select
            id="reconciliation"
            name="reconciliation"
            defaultValue={sp.reconciliation ?? ""}
            className={inputClass}
          >
            <option value="">All</option>
            <option value="UNRECONCILED">Unreconciled</option>
            <option value="MATCHED">Matched</option>
            <option value="MISMATCH">Mismatch</option>
          </select>
        </div>
        <div>
          <label htmlFor="q" className="text-sm font-semibold">
            Reference
          </label>
          <input id="q" name="q" defaultValue={sp.q} className={inputClass} />
        </div>
        <button className={buttonClass("secondary")}>Filter</button>
      </form>
      {res.rows.length ? (
        <DataTable
          caption="Payments"
          rows={res.rows}
          rowKey={(r) => r.id}
          columns={[
            { header: "Reference", cell: (r) => <span className="font-mono text-sm">{r.reference}</span> },
            {
              header: "Campaign",
              cell: (r) => <Link href={`/cases/${r.campaign.publicId}`}>{r.campaign.title}</Link>,
            },
            {
              header: "Payer",
              cell: (r) => (
                <>
                  {r.payerName}
                  {r.isAnonymous && <Badge>anonymous publicly</Badge>}
                </>
              ),
            },
            {
              header: "Amount",
              cell: (r) => (
                <>
                  {formatMoney(r.amountMinor, r.currency)}
                  {r.feeMinor > 0n && (
                    <span className="block text-xs text-muted">fee {formatMoney(r.feeMinor)}</span>
                  )}
                  {r.refundedMinor > 0n && (
                    <span className="block text-xs text-muted">refunded {formatMoney(r.refundedMinor)}</span>
                  )}
                </>
              ),
            },
            {
              header: "Status",
              cell: (r) => (
                <>
                  <Badge
                    tone={r.status === "SUCCEEDED" ? "success" : r.status === "FAILED" ? "danger" : "neutral"}
                  >
                    {PAYMENT_STATUS_LABEL[r.status]}
                  </Badge>{" "}
                  <Badge
                    tone={
                      r.reconciliation === "MATCHED"
                        ? "success"
                        : r.reconciliation === "MISMATCH"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {r.reconciliation.toLowerCase()}
                  </Badge>
                </>
              ),
            },
            { header: "Created", cell: (r) => formatDate(r.createdAt, true) },
            {
              header: "Actions",
              cell: (r) => (
                <div className="flex flex-col gap-1">
                  {r.provider !== "offline" && actor.permissions.has("finance.reconcile") && (
                    <ActionForm action={reconcile.bind(null, r.id)}>
                      <SubmitButton variant="ghost" pendingText="Checking…">
                        Check with provider
                      </SubmitButton>
                    </ActionForm>
                  )}
                  {r.provider === "offline" &&
                    r.status === "PENDING" &&
                    actor.permissions.has("finance.offline_receipt") &&
                    r.recordedById !== actor.userId && (
                      <ActionForm action={confirm.bind(null, r.id)}>
                        <SubmitButton variant="ghost">Confirm receipt</SubmitButton>
                      </ActionForm>
                    )}
                  {["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(r.status) &&
                    actor.permissions.has("finance.refund.request") && (
                      <details>
                        <summary className="cursor-pointer text-sm text-teal">Request refund</summary>
                        <ActionForm action={refund.bind(null, r.id)} className="mt-1">
                          <input
                            name="amount"
                            inputMode="decimal"
                            className={inputClass}
                            placeholder="₦ amount"
                            aria-label="Refund amount"
                          />
                          <input
                            name="reason"
                            className={inputClass}
                            placeholder="Reason / policy basis"
                            aria-label="Refund reason"
                          />
                          <SubmitButton variant="secondary">Request</SubmitButton>
                        </ActionForm>
                      </details>
                    )}
                </div>
              ),
            },
          ]}
        />
      ) : (
        <EmptyState title="No payments match" />
      )}
      <Pagination
        page={res.page}
        pageSize={res.pageSize}
        total={res.total}
        hrefFor={(p) =>
          `/staff/finance/payments?page=${p}${sp.status ? `&status=${sp.status}` : ""}${sp.reconciliation ? `&reconciliation=${sp.reconciliation}` : ""}`
        }
      />

      {actor.permissions.has("finance.offline_receipt") && (
        <Section title="Record a sponsor bank transfer">
          <Card>
            {signed.length ? (
              <ActionForm action={offline} resetOnSuccess>
                <Field label="Signed agreement" name="agreementId">
                  <select id="agreementId" name="agreementId" className={inputClass}>
                    {signed.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.organisation.name} – {a.campaign.title} (pledged{" "}
                        {formatMoney(a.pledgedAmountMinor)})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Amount received (₦)" name="amount">
                  <input id="amount" name="amount" inputMode="decimal" className={inputClass} />
                </Field>
                <Field label="Bank statement reference" name="bankReference">
                  <input id="bankReference" name="bankReference" className={inputClass} />
                </Field>
                <Field label="Date received" name="receivedOn">
                  <input id="receivedOn" type="date" name="receivedOn" className={inputClass} />
                </Field>
                <SubmitButton>Record receipt</SubmitButton>
              </ActionForm>
            ) : (
              <p className="text-muted">No signed sponsorship agreements awaiting payment.</p>
            )}
          </Card>
        </Section>
      )}
    </div>
  );
}
