import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { formatMoney, max0 } from "@/lib/money";
import { Alert, Badge, Card, DefinitionList, Field, PageHeader, Section, formatDate, humanize, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { getActor, requirePageActor } from "@/server/current-user";
import { requireActor } from "@/server/actor";
import { runAction, str, withRedirect, type FormState } from "@/server/action";
import { initiateSponsorPayment, signAgreement, sponsorReport } from "@/server/services/sponsors";

export const metadata = { title: "Sponsorship report" };

export default async function AgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageActor(`/sponsor/agreements/${id}`);
  let r;
  try { r = await sponsorReport(actor, id); } catch (e) { if (e instanceof AppError && e.code === "FORBIDDEN") redirect("/sponsor"); if (e instanceof AppError) notFound(); throw e; }
  const { agreement: a, timeline, feedback } = r;
  const iv = a.campaign.intervention;
  const paid = a.payments.reduce((s, p) => s + p.amountMinor - p.refundedMinor, 0n);
  async function sign(_: FormState, fd: FormData): Promise<FormState> { "use server"; return runAction(async () => { await signAgreement(requireActor(await getActor()), id, str(fd, "signedByName")); revalidatePath(`/sponsor/agreements/${id}`); return "Agreement signed."; }); }
  async function pay(_: FormState, fd: FormData): Promise<FormState> { "use server"; let url = ""; const res = await runAction(async () => { url = (await initiateSponsorPayment(requireActor(await getActor()), id, str(fd, "amount"))).checkoutUrl; }); return withRedirect(res, url); }
  return (
    <div className="max-w-4xl">
      <PageHeader title={`Sponsorship: ${a.campaign.title}`} description={<>Agreement <Badge>{humanize(a.status)}</Badge> · Case {humanize(a.campaign.status)}</>} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><p className="text-sm text-muted">Pledged (not money received)</p><p className="text-xl font-bold text-teal">{formatMoney(a.pledgedAmountMinor)}</p></Card>
        <Card><p className="text-sm text-muted">Confirmed payments</p><p className="text-xl font-bold text-teal">{formatMoney(paid)}</p></Card>
        <Card><p className="text-sm text-muted">Spent on intervention (all funding sources)</p><p className="text-xl font-bold text-teal">{formatMoney(iv?.disbursements.reduce((s, d) => s + d.amountMinor, 0n) ?? 0n)}</p></Card>
      </div>
      <Section title="Agreement terms"><Card><p className="whitespace-pre-line">{a.terms}</p>{a.inKindDescription && <p className="mt-2">In-kind: {a.inKindDescription}</p>}<p className="mt-2 text-sm">Public credit: {a.brandingPermitted ? "permitted" : "not permitted"}</p>{a.signedAt && <p className="mt-2 text-sm">Signed by {a.signedByName} on {formatDate(a.signedAt)}</p>}</Card></Section>
      {a.status === "APPROVED" && (
        <Section title="Sign"><Card><ActionForm action={sign}>
          <p className="text-sm">Only an authorised representative may sign. Signing records your organisation&apos;s acceptance of the terms above.</p>
          <Field label="Type your full name" name="signedByName"><input id="signedByName" name="signedByName" className={inputClass} /></Field>
          <SubmitButton confirm="Sign this agreement on behalf of your organisation?">Sign agreement</SubmitButton>
        </ActionForm></Card></Section>
      )}
      {a.status === "SIGNED" && max0(a.pledgedAmountMinor - paid) > 0n && (
        <Section title="Pay pledge online"><Card><ActionForm action={pay}>
          <p className="text-sm">Outstanding: {formatMoney(max0(a.pledgedAmountMinor - paid))}. You can also pay by bank transfer; our finance team will confirm receipt.</p>
          <Field label="Amount (₦)" name="amount"><input id="amount" name="amount" inputMode="decimal" className={inputClass} /></Field>
          <SubmitButton variant="cta">Continue to secure payment</SubmitButton>
        </ActionForm></Card></Section>
      )}
      <Section title="Progress and outcome">
        {iv ? <Card><DefinitionList items={[["Intervention status", humanize(iv.status)], ["Planned outcome", iv.plannedOutcome], ["Approved budget", formatMoney(iv.approvedBudgetMinor)], ["Outcome", iv.outcomeSummary ?? "Not yet reviewed – outcome cannot yet be reported."], ["Completed", formatDate(iv.completedAt)], ["Beneficiary feedback", feedback ?? "Not shared (requires the beneficiary's consent)"]]} />
          <h3 className="mt-4 font-semibold">Delivery evidence</h3><ul className="text-sm">{iv.deliveries.map((d, i) => <li key={i}>{formatDate(d.deliveredAt)}: {d.description}</li>)}{!iv.deliveries.length && <li className="text-muted">None yet.</li>}</ul>
          <h3 className="mt-4 font-semibold">Approved expenditure</h3><ul className="text-sm">{iv.disbursements.map((d, i) => <li key={i}>{formatDate(d.paidAt)}: {d.purpose} – {formatMoney(d.amountMinor)}</li>)}{!iv.disbursements.length && <li className="text-muted">None yet.</li>}</ul>
        </Card> : <Alert tone="info">The intervention has not started yet.</Alert>}
      </Section>
      <Section title="Updates">{a.campaign.stories.length ? a.campaign.stories.map((s, i) => <Card key={i} className="mb-2"><p className="text-sm text-muted">{formatDate(s.publishedAt)}</p><p className="font-semibold">{s.title}</p><p className="whitespace-pre-line">{s.body}</p></Card>) : <p className="text-muted">No approved updates yet.</p>}</Section>
      <Section title="Timeline"><ol className="text-sm">{timeline.map((t, i) => <li key={i}>{formatDate(t.createdAt)} · {humanize(t.toStatus)}</li>)}</ol></Section>
      <p className="mt-6 text-sm text-muted">To keep a copy, use your browser&apos;s print function and choose “Save as PDF”.</p>
    </div>
  );
}
