import Link from "next/link";
import { redirect } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { Alert, Badge, ButtonLink, Card, DataTable, EmptyState, Field, PageHeader, Section, formatDate, humanize, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { getActor, requirePageActor } from "@/server/current-user";
import { requireActor } from "@/server/actor";
import { runAction, withRedirect, type FormState } from "@/server/action";
import { registerOrganisation, sponsorDashboard, submitProposal } from "@/server/services/sponsors";

export const metadata = { title: "Sponsor portal" };

export default async function SponsorHome() {
  const actor = await requirePageActor("/sponsor");
  if (!actor.permissions.has("sponsor.own")) redirect("/forbidden");
  const dash = await sponsorDashboard(actor);
  async function register(_: FormState, fd: FormData): Promise<FormState> { "use server"; const r = await runAction(async () => { await registerOrganisation(requireActor(await getActor()), Object.fromEntries(fd)); }); return withRedirect(r, "/sponsor"); }
  async function enquiry(_: FormState, fd: FormData): Promise<FormState> { "use server"; return runAction(async () => { await submitProposal(requireActor(await getActor()), { type: "ENQUIRY", message: fd.get("message") }); return "Thank you – our partnerships team will reply."; }); }

  if (!dash) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Register your organisation" description="KindSpring reviews every organisation before granting access to case details." />
        <Card><ActionForm action={register}>
          <Field label="Organisation name" name="name"><input id="name" name="name" className={inputClass} /></Field>
          <Field label="CAC registration number (if registered)" name="registrationNumber"><input id="registrationNumber" name="registrationNumber" className={inputClass} /></Field>
          <Field label="Website" name="website"><input id="website" name="website" className={inputClass} placeholder="https://" /></Field>
          <Field label="Sector" name="sector"><input id="sector" name="sector" className={inputClass} /></Field>
          <Field label="Address" name="address"><input id="address" name="address" className={inputClass} /></Field>
          <Field label="Contact email" name="contactEmail"><input id="contactEmail" name="contactEmail" type="email" defaultValue={actor.email} className={inputClass} /></Field>
          <Field label="Contact phone" name="contactPhone"><input id="contactPhone" name="contactPhone" className={inputClass} /></Field>
          <Field label="About your organisation" name="description"><textarea id="description" name="description" rows={3} className={inputClass} /></Field>
          <Field label="Your job title" name="jobTitle"><input id="jobTitle" name="jobTitle" className={inputClass} /></Field>
          <label className="flex items-center gap-2"><input type="checkbox" name="isAuthorisedRepresentative" className="h-5 w-5" /> I am authorised to sign agreements on behalf of this organisation</label>
          <SubmitButton>Submit for review</SubmitButton>
        </ActionForm></Card>
      </div>
    );
  }
  const { membership: m, proposals, agreements, inKind } = dash;
  const approved = m.organisation.status === "APPROVED";
  return (
    <div>
      <PageHeader title={m.organisation.name} description={<>Organisation status: <Badge tone={approved ? "success" : "warning"}>{humanize(m.organisation.status)}</Badge></>} actions={approved ? <ButtonLink href="/sponsor/cases" variant="cta">Browse eligible cases</ButtonLink> : undefined} />
      {!approved && <Alert tone="info" title="Your organisation is awaiting review">You can send general enquiries now. Case details and sponsorship offers are available once approved.</Alert>}
      <Section title="Agreements and contributions">
        {agreements.length ? <DataTable caption="Agreements" rows={agreements} rowKey={(a) => a.id} columns={[
          { header: "Case", cell: (a) => <Link href={`/sponsor/agreements/${a.id}`}>{a.campaign.title}</Link> },
          { header: "Agreement", cell: (a) => <Badge>{humanize(a.status)}</Badge> },
          { header: "Pledged", cell: (a) => formatMoney(a.pledgedAmountMinor) },
          { header: "Confirmed paid", cell: (a) => formatMoney(a.payments.filter((p) => ["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(p.status)).reduce((s, p) => s + p.amountMinor - p.refundedMinor, 0n)) },
          { header: "Case status", cell: (a) => humanize(a.campaign.status) },
        ]} /> : <EmptyState title="No agreements yet">Agreements appear here after you make an offer and it is approved.</EmptyState>}
      </Section>
      <Section title="Proposals and enquiries">
        {proposals.length ? <ul className="flex flex-col gap-2">{proposals.map((p) => <li key={p.id} className="rounded border border-line bg-white p-3"><p>{humanize(p.type)} {p.campaign && `· ${p.campaign.title}`} <Badge>{humanize(p.status)}</Badge> <span className="text-sm text-muted">{formatDate(p.createdAt)}</span></p>{p.staffResponse && <p className="mt-1 text-sm">KindSpring: {p.staffResponse}</p>}</li>)}</ul> : <p className="text-muted">None yet.</p>}
        <Card className="mt-3"><ActionForm action={enquiry} resetOnSuccess><Field label="Send a general enquiry" name="message"><textarea id="message" name="message" rows={3} className={inputClass} /></Field><SubmitButton variant="secondary">Send</SubmitButton></ActionForm></Card>
      </Section>
      <Section title="In-kind offers">
        {inKind.length ? <ul className="text-sm">{inKind.map((i) => <li key={i.id}>{i.quantity} {i.unit} {i.description} for {i.campaign.title}: {humanize(i.status)} ({i.quantityDelivered} delivered)</li>)}</ul> : <p className="text-muted">None yet.</p>}
      </Section>
    </div>
  );
}
