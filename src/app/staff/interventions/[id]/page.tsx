import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { InterventionStatus } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { INTERVENTION_TRANSITIONS, type ChecklistItem } from "@/lib/workflow/intervention";
import { Badge, Card, DataTable, Field, PageHeader, Section, formatDate, humanize, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { UploadField } from "@/components/applicant/uploader";
import { getActor, requirePagePermission } from "@/server/current-user";
import { requireActor } from "@/server/actor";
import { runAction, str, type FormState } from "@/server/action";
import * as svc from "@/server/services/interventions";

export const metadata = { title: "Intervention" };

export default async function InterventionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePagePermission(["intervention.manage", "finance.view", "intervention.outcome_review"]);
  let data;
  try {
    data = await svc.getInterventionForStaff(actor, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "FORBIDDEN") redirect("/forbidden");
    if (e instanceof AppError) notFound();
    throw e;
  }
  const { iv, balance, suppliers, history } = data;
  const can = (p: Parameters<typeof actor.permissions.has>[0]) => actor.permissions.has(p);
  const me = async () => requireActor(await getActor());
  const refresh = (m: string) => { revalidatePath(`/staff/interventions/${id}`); return m; };
  const checklist = iv.completionChecklist as ChecklistItem[];
  const nextStates = INTERVENTION_TRANSITIONS[iv.status].filter((s) => s !== "COMPLETED");

  async function move(_: FormState, fd: FormData): Promise<FormState> { "use server"; return runAction(async () => { await svc.moveIntervention(await me(), id, str(fd, "to") as InterventionStatus, str(fd, "reason")); return refresh("Updated."); }); }
  async function saveChecklist(_: FormState, fd: FormData): Promise<FormState> { "use server"; return runAction(async () => { await svc.updateChecklist(await me(), id, fd.getAll("done").map(String)); return refresh("Checklist saved."); }); }
  async function delivery(_: FormState, fd: FormData): Promise<FormState> { "use server"; return runAction(async () => { await svc.recordDelivery(await me(), id, { description: str(fd, "description"), deliveredAt: str(fd, "deliveredAt"), fileId: str(fd, "fileId") || null }); return refresh("Delivery recorded; supporters notified."); }); }
  async function feedback(_: FormState, fd: FormData): Promise<FormState> { "use server"; return runAction(async () => { await svc.recordFeedback(await me(), id, str(fd, "feedback"), fd.get("consent") === "on"); return refresh("Feedback saved."); }); }
  async function budgetChange(_: FormState, fd: FormData): Promise<FormState> { "use server"; return runAction(async () => { const r = await svc.requestBudgetChange(await me(), id, str(fd, "newBudget"), str(fd, "reason")); return refresh(r.requiresApproval ? "Submitted for independent approval." : "Minor change applied and recorded."); }); }
  async function decideChange(reqId: string, approve: boolean): Promise<FormState> { "use server"; return runAction(async () => { await svc.decideBudgetChange(await me(), reqId, approve); return refresh(approve ? "Approved." : "Rejected."); }); }
  async function addSupplier(_: FormState, fd: FormData): Promise<FormState> { "use server"; return runAction(async () => { await svc.createSupplier(await me(), Object.fromEntries(fd)); return refresh("Supplier added. Finance must verify payment details before any payment is approved."); }); }
  async function purchase(_: FormState, fd: FormData): Promise<FormState> { "use server"; return runAction(async () => { await svc.createPurchaseRequest(await me(), id, { supplierId: str(fd, "supplierId"), description: str(fd, "description"), amount: str(fd, "amount") }); return refresh("Purchase request submitted for approval."); }); }
  async function decidePurchase(prId: string, approve: boolean): Promise<FormState> { "use server"; return runAction(async () => { await svc.decidePurchaseRequest(await me(), prId, approve); return refresh(approve ? "Purchase approved." : "Purchase rejected."); }); }
  async function disburse(_: FormState, fd: FormData): Promise<FormState> { "use server"; return runAction(async () => { await svc.requestDisbursement(await me(), id, Object.fromEntries(fd)); return refresh("Disbursement requested. A different finance officer must approve it."); }); }
  async function outcome(_: FormState, fd: FormData): Promise<FormState> { "use server"; return runAction(async () => { await svc.completeOutcomeReview(await me(), id, { outcomeSummary: str(fd, "outcomeSummary"), result: str(fd, "result") as "COMPLETED" }); return refresh("Outcome review recorded."); }); }

  return (
    <div>
      <PageHeader title={`Intervention: ${iv.campaign.title}`} description={<><Link href={`/staff/campaigns/${iv.campaign.id}`}>Campaign</Link> · <Badge>{humanize(iv.status)}</Badge></>} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><p className="text-sm text-muted">Approved budget</p><p className="text-xl font-bold text-teal">{formatMoney(iv.approvedBudgetMinor)}</p></Card>
        <Card><p className="text-sm text-muted">Restricted funds available</p><p className="text-xl font-bold text-teal">{formatMoney(balance)}</p></Card>
        <Card><p className="text-sm text-muted">Paid to suppliers</p><p className="text-xl font-bold text-teal">{formatMoney(iv.disbursements.filter((d) => d.status === "PAID").reduce((s, d) => s + d.amountMinor, 0n))}</p></Card>
      </div>
      <Section title="Plan"><Card><p><strong>Scope:</strong> {iv.scope}</p><p className="mt-2"><strong>Planned outcome:</strong> {iv.plannedOutcome}</p></Card></Section>

      {can("intervention.manage") && nextStates.length > 0 && (
        <Section title="Progress">
          <Card><ActionForm action={move}>
            <select name="to" className={inputClass} aria-label="Next status">{nextStates.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select>
            <input name="reason" className={inputClass} aria-label="Reason" placeholder="Reason / note" />
            <SubmitButton variant="secondary">Update</SubmitButton>
          </ActionForm></Card>
        </Section>
      )}

      <Section title="Suppliers, purchases and disbursements">
        <p className="mb-2 text-sm text-muted">Pay suppliers directly where possible. Every disbursement needs independent approval by a finance officer who did not request it, a verified supplier, an invoice reference and available restricted funds.</p>
        {iv.purchaseRequests.length > 0 && <DataTable caption="Purchase requests" rows={iv.purchaseRequests} rowKey={(r) => r.id} columns={[
          { header: "Purchase", cell: (r) => r.description }, { header: "Supplier", cell: (r) => r.supplier.name }, { header: "Amount", cell: (r) => formatMoney(r.amountMinor) },
          { header: "Status", cell: (r) => <span className="flex flex-wrap gap-2"><Badge>{humanize(r.status)}</Badge>{r.status === "PENDING" && (can("finance.disbursement.approve") || can("intervention.outcome_review")) && r.requestedById !== actor.userId && <><ActionForm action={decidePurchase.bind(null, r.id, true)}><SubmitButton variant="ghost">Approve</SubmitButton></ActionForm><ActionForm action={decidePurchase.bind(null, r.id, false)}><SubmitButton variant="ghost">Reject</SubmitButton></ActionForm></>}</span> },
        ]} />}
        <div className="mt-3">
          {iv.disbursements.length > 0 && <DataTable caption="Disbursements" rows={iv.disbursements} rowKey={(r) => r.id} columns={[
            { header: "Purpose", cell: (r) => r.purpose }, { header: "Supplier", cell: (r) => <>{r.supplier.name} {r.supplier.status !== "VERIFIED" && <Badge tone="warning">unverified</Badge>}</> },
            { header: "Amount", cell: (r) => formatMoney(r.amountMinor) }, { header: "Invoice", cell: (r) => r.invoiceNumber ?? (r.invoiceFileId ? <a href={`/api/files/${r.invoiceFileId}`}>file</a> : "—") },
            { header: "Status", cell: (r) => <Badge tone={r.status === "PAID" ? "success" : r.status === "REJECTED" ? "danger" : "warning"}>{humanize(r.status)}</Badge> },
          ]} />}
        </div>
        {can("intervention.manage") && (
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card><h3 className="font-semibold">Add supplier</h3><ActionForm action={addSupplier} className="mt-2" resetOnSuccess>
              <input name="name" className={inputClass} aria-label="Supplier name" placeholder="Supplier name" />
              <input name="contactPhone" className={inputClass} aria-label="Phone" placeholder="Phone" />
              <input name="bankName" className={inputClass} aria-label="Bank name" placeholder="Bank name" />
              <input name="accountNumberLast4" className={inputClass} aria-label="Account last 4 digits" placeholder="Account no. last 4 digits" />
              <SubmitButton variant="secondary">Add supplier</SubmitButton>
            </ActionForm></Card>
            <Card><h3 className="font-semibold">Purchase request</h3><ActionForm action={purchase} className="mt-2" resetOnSuccess>
              <select name="supplierId" className={inputClass} aria-label="Supplier"><option value="">Supplier</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              <input name="description" className={inputClass} aria-label="Description" placeholder="What is being bought" />
              <input name="amount" inputMode="decimal" className={inputClass} aria-label="Amount" placeholder="₦" />
              <SubmitButton variant="secondary">Request</SubmitButton>
            </ActionForm></Card>
            {can("finance.disbursement.request") && <Card><h3 className="font-semibold">Request disbursement</h3><ActionForm action={disburse} className="mt-2" resetOnSuccess>
              <select name="supplierId" className={inputClass} aria-label="Supplier"><option value="">Supplier</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              <select name="purchaseRequestId" className={inputClass} aria-label="Purchase request"><option value="">Linked purchase (optional)</option>{iv.purchaseRequests.filter((p) => p.status === "APPROVED").map((p) => <option key={p.id} value={p.id}>{p.description}</option>)}</select>
              <input name="purpose" className={inputClass} aria-label="Purpose" placeholder="Purpose" />
              <input name="amount" inputMode="decimal" className={inputClass} aria-label="Amount" placeholder="₦" />
              <input name="invoiceNumber" className={inputClass} aria-label="Invoice number" placeholder="Invoice / quote number" />
              <UploadField purpose="INVOICE" name="invoiceFileId" label="Invoice file (optional)" />
              <SubmitButton variant="secondary">Request payment</SubmitButton>
            </ActionForm></Card>}
          </div>
        )}
      </Section>

      <Section title="Budget changes">
        <ul className="text-sm">{iv.budgetChanges.map((b) => <li key={b.id} className="flex flex-wrap items-center gap-2">{formatMoney(b.oldBudgetMinor)} → {formatMoney(b.newBudgetMinor)} · {b.reason} · <Badge>{humanize(b.status)}</Badge>
          {b.status === "PENDING" && can("intervention.budget_change.approve") && b.requestedById !== actor.userId && <><ActionForm action={decideChange.bind(null, b.id, true)}><SubmitButton variant="ghost">Approve</SubmitButton></ActionForm><ActionForm action={decideChange.bind(null, b.id, false)}><SubmitButton variant="ghost">Reject</SubmitButton></ActionForm></>}
        </li>)}{!iv.budgetChanges.length && <li className="text-muted">None.</li>}</ul>
        {can("intervention.manage") && <Card className="mt-2"><ActionForm action={budgetChange}>
          <Field label="New budget (₦)" name="newBudget"><input id="newBudget" name="newBudget" inputMode="decimal" className={inputClass} /></Field>
          <Field label="Reason" name="bc-reason"><input id="bc-reason" name="reason" className={inputClass} /></Field>
          <SubmitButton variant="secondary">Request change</SubmitButton>
        </ActionForm></Card>}
      </Section>

      <Section title="Delivery evidence">
        <ul className="flex flex-col gap-2">{iv.deliveries.map((d) => <li key={d.id} className="rounded border border-line bg-white p-3 text-sm"><p className="text-muted">{formatDate(d.deliveredAt)}</p><p>{d.description}</p>{d.fileId && <a href={`/api/files/${d.fileId}`}>Evidence file</a>}</li>)}{!iv.deliveries.length && <li className="text-muted">No delivery recorded yet.</li>}</ul>
        {can("intervention.manage") && ["IN_PROGRESS", "PARTIALLY_DELIVERED", "DELIVERED"].includes(iv.status) && (
          <Card className="mt-2"><ActionForm action={delivery} resetOnSuccess>
            <Field label="What was delivered, to whom, and in what condition?" name="del-desc"><textarea id="del-desc" name="description" rows={3} className={inputClass} /></Field>
            <Field label="Delivery date" name="del-date"><input id="del-date" type="date" name="deliveredAt" className={inputClass} /></Field>
            <UploadField purpose="DELIVERY_EVIDENCE" label="Delivery evidence photo or document (optional)" />
            <SubmitButton>Record delivery</SubmitButton>
          </ActionForm></Card>
        )}
      </Section>

      <Section title="Completion checklist and feedback">
        <div className="grid gap-4 md:grid-cols-2">
          <Card><ActionForm action={saveChecklist}>
            {checklist.map((c) => <label key={c.key} className="flex items-start gap-2"><input type="checkbox" name="done" value={c.key} defaultChecked={c.done} disabled={!can("intervention.manage")} className="mt-1 h-5 w-5" />{c.label}</label>)}
            {can("intervention.manage") && <SubmitButton variant="secondary">Save checklist</SubmitButton>}
          </ActionForm></Card>
          <Card><ActionForm action={feedback}>
            <Field label="Beneficiary feedback (or note a refusal)" name="feedback"><textarea id="feedback" name="feedback" rows={4} defaultValue={iv.beneficiaryFeedback ?? ""} className={inputClass} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="consent" defaultChecked={iv.feedbackConsentToShare} className="h-5 w-5" /> Beneficiary consents to sharing this feedback with sponsors</label>
            {can("intervention.manage") && <SubmitButton variant="secondary">Save feedback</SubmitButton>}
          </ActionForm></Card>
        </div>
      </Section>

      {iv.status === "OUTCOME_REVIEW" && can("intervention.outcome_review") && (
        <Section title="Independent outcome review">
          <Card><ActionForm action={outcome}>
            <p className="text-sm text-muted">Must be completed by someone other than the intervention&apos;s case manager. Reaching a funding target never completes an intervention.</p>
            <Field label="Verified outcome summary" name="outcomeSummary" hint="This text is shown publicly on the campaign page. Keep it anonymised. If the outcome cannot yet be measured, say so."><textarea id="outcomeSummary" name="outcomeSummary" rows={4} className={inputClass} /></Field>
            <Field label="Result" name="result"><select id="result" name="result" className={inputClass}><option value="COMPLETED">Completed</option><option value="IN_PROGRESS">Return to delivery</option><option value="UNSUCCESSFUL">Unsuccessful</option></select></Field>
            <SubmitButton>Record outcome review</SubmitButton>
          </ActionForm></Card>
        </Section>
      )}
      {iv.outcomeSummary && <Section title="Outcome"><Card><p className="whitespace-pre-line">{iv.outcomeSummary}</p><p className="mt-1 text-sm text-muted">{formatDate(iv.completedAt)}</p></Card></Section>}

      <Section title="History"><ol className="text-sm">{history.map((h) => <li key={h.id}>{formatDate(h.createdAt, true)} · {h.fromStatus ? `${humanize(h.fromStatus)} → ` : ""}{humanize(h.toStatus)}{h.reason ? ` – ${h.reason}` : ""}</li>)}</ol></Section>
    </div>
  );
}
