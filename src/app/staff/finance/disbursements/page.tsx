import Link from "next/link";
import { revalidatePath } from "next/cache";
import { formatMoney } from "@/lib/money";
import { db } from "@/lib/db";
import { Badge, DataTable, EmptyState, PageHeader, Section, formatDate, humanize, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { getActor, requirePagePermission } from "@/server/current-user";
import { requireActor } from "@/server/actor";
import { runAction, str, type FormState } from "@/server/action";
import { approveDisbursement, listDisbursements, markDisbursementPaid, rejectDisbursement, verifySupplier } from "@/server/services/interventions";

export const metadata = { title: "Disbursements" };

export default async function DisbursementsPage() {
  const actor = await requirePagePermission(["finance.view", "finance.disbursement.request"]);
  const [rows, suppliers] = await Promise.all([listDisbursements(actor), db.supplier.findMany({ where: { status: "PENDING_VERIFICATION" } })]);
  const me = async () => requireActor(await getActor());
  const refresh = (m: string) => { revalidatePath("/staff/finance/disbursements"); return m; };
  async function approve(id: string): Promise<FormState> { "use server"; return runAction(async () => { await approveDisbursement(await me(), id); return refresh("Approved and posted to the ledger."); }); }
  async function reject(id: string, _: FormState, fd: FormData): Promise<FormState> { "use server"; return runAction(async () => { await rejectDisbursement(await me(), id, str(fd, "reason")); return refresh("Rejected."); }); }
  async function paid(id: string, _: FormState, fd: FormData): Promise<FormState> { "use server"; return runAction(async () => { await markDisbursementPaid(await me(), id, str(fd, "reference")); return refresh("Marked as paid."); }); }
  async function verify(id: string): Promise<FormState> { "use server"; return runAction(async () => { await verifySupplier(await me(), id); return refresh("Supplier verified."); }); }
  const canApprove = actor.permissions.has("finance.disbursement.approve");
  return (
    <div>
      <PageHeader title="Disbursements" description="Maker–checker: the approver must differ from the requester (also enforced by the database). Approval checks supplier verification, invoice and available restricted funds." />
      {rows.length ? <DataTable caption="Disbursements" rows={rows} rowKey={(r) => r.id} columns={[
        { header: "Campaign", cell: (r) => <Link href={`/staff/interventions/${r.intervention.id}`}>{r.intervention.campaign.title}</Link> },
        { header: "Supplier", cell: (r) => <>{r.supplier.name} {r.supplier.status !== "VERIFIED" && <Badge tone="warning">unverified</Badge>}</> },
        { header: "Purpose", cell: (r) => r.purpose },
        { header: "Amount", cell: (r) => formatMoney(r.amountMinor) },
        { header: "Invoice", cell: (r) => r.invoiceNumber ?? (r.invoiceFileId ? <a href={`/api/files/${r.invoiceFileId}`}>file</a> : "—") },
        { header: "Status", cell: (r) => <Badge tone={r.status === "PAID" ? "success" : r.status === "REJECTED" ? "danger" : "warning"}>{humanize(r.status)}</Badge> },
        { header: "Requested", cell: (r) => formatDate(r.createdAt) },
        { header: "Action", cell: (r) => !canApprove ? "—" : r.status === "REQUESTED" ? (r.requestedById === actor.userId ? <span className="text-sm text-muted">Awaiting another officer</span> : (
          <div className="flex flex-col gap-1">
            <ActionForm action={approve.bind(null, r.id)}><SubmitButton variant="secondary" confirm="Approve this payment?">Approve</SubmitButton></ActionForm>
            <ActionForm action={reject.bind(null, r.id)}><input name="reason" className={inputClass} placeholder="Reason" aria-label="Reason" /><SubmitButton variant="ghost">Reject</SubmitButton></ActionForm>
          </div>)) : r.status === "APPROVED" ? (
          <ActionForm action={paid.bind(null, r.id)}><input name="reference" className={inputClass} placeholder="Bank / partner reference" aria-label="Payment reference" /><SubmitButton variant="secondary">Mark paid</SubmitButton></ActionForm>
        ) : r.paymentReference ?? "—" },
      ]} /> : <EmptyState title="No disbursements yet" />}
      {actor.permissions.has("finance.supplier.manage") && (
        <Section title="Suppliers awaiting verification">
          <p className="mb-2 text-sm text-muted">Confirm bank details independently (e.g. call the supplier on a known number) before verifying. You cannot verify a supplier you added.</p>
          {suppliers.length ? <ul className="flex flex-col gap-2">{suppliers.map((s) => <li key={s.id} className="flex flex-wrap items-center gap-3">{s.name} · {s.bankName ?? "bank?"} ****{s.accountNumberLast4 ?? "????"} {s.createdById !== actor.userId && <ActionForm action={verify.bind(null, s.id)}><SubmitButton variant="ghost">Verify</SubmitButton></ActionForm>}</li>)}</ul> : <p className="text-muted">None.</p>}
        </Section>
      )}
    </div>
  );
}
