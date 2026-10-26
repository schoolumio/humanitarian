import Link from "@/components/ui/link";
import { notFound, redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { formatMoney, minorToMajorString } from "@/lib/money";
import { CAMPAIGN_STATUS_LABEL } from "@/lib/workflow/campaign";
import {
  Alert,
  Badge,
  Card,
  DefinitionList,
  Field,
  PageHeader,
  Section,
  formatDate,
  humanize,
  inputClass,
} from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { CampaignForm, campaignFormInput } from "@/components/staff/campaign-form";
import { requirePagePermission } from "@/server/current-user";
import { runAction, currentActor, str, withRedirect, type FormState } from "@/server/action";
import * as svc from "@/server/services/campaigns";
import { createIntervention } from "@/server/services/interventions";

export const metadata = { title: "Campaign" };

export default async function StaffCampaign({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePagePermission([
    "campaign.manage",
    "finance.view",
    "media.manage",
    "intervention.manage",
  ]);
  let data;
  try {
    data = await svc.getStaffCampaign(actor, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "FORBIDDEN") redirect("/forbidden");
    if (e instanceof AppError) notFound();
    throw e;
  }
  const { c, history, balance } = data;
  const blockers =
    actor.permissions.has("campaign.manage") && ["DRAFT", "READY_FOR_PUBLICATION"].includes(c.status)
      ? await svc.getPublicationBlockers(actor, id)
      : [];
  const can = (p: Parameters<typeof actor.permissions.has>[0]) => actor.permissions.has(p);

  async function update(_: FormState, fd: FormData): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await svc.updateCampaign(await currentActor(), id, campaignFormInput(fd));
      return "Saved.";
    });
  }
  async function ready(): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await svc.markReadyForPublication(await currentActor(), id);
      return "Marked ready. A different staff member must publish it.";
    });
  }
  async function publish(): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await svc.publishCampaign(await currentActor(), id);
      return "Published.";
    });
  }
  async function toDraft(_: FormState, fd: FormData): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await svc.returnToDraft(await currentActor(), id, str(fd, "reason"));
      return "Returned to draft.";
    });
  }
  async function closeFunding(_: FormState, fd: FormData): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await svc.closeFunding(await currentActor(), id, str(fd, "reason"));
      return "Funding closed as partially funded.";
    });
  }
  async function cancel(_: FormState, fd: FormData): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await svc.cancelCampaign(await currentActor(), id, str(fd, "reason"));
      return "Campaign cancelled. Finance has been alerted to any funds held.";
    });
  }
  async function startIntervention(_: FormState, fd: FormData): Promise<FormState> {
    "use server";
    let ivId = "";
    const r = await runAction(async () => {
      ivId = (await createIntervention(await currentActor(), id, Object.fromEntries(fd))).id;
    });
    return withRedirect(r, `/staff/interventions/${ivId}`);
  }

  const net = c.confirmedAmountMinor - c.refundedAmountMinor;
  return (
    <div>
      <PageHeader
        title={c.title}
        description={
          <>
            Case <Link href={`/staff/applications/${c.application.id}`}>{c.application.reference}</Link> ·{" "}
            <Badge>{CAMPAIGN_STATUS_LABEL[c.status]}</Badge> ·{" "}
            {c.visibility === "PUBLIC" ? (
              <Link href={`/cases/${c.publicId}`}>public page</Link>
            ) : (
              "sponsors only"
            )}
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <p className="text-sm text-muted">Target</p>
          <p className="text-xl font-bold text-teal">{formatMoney(c.targetAmountMinor)}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Confirmed (net of refunds)</p>
          <p className="text-xl font-bold text-teal">{formatMoney(net)}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Restricted fund balance (ledger)</p>
          <p className="text-xl font-bold text-teal">{formatMoney(balance)}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Sponsor pledges (not received)</p>
          <p className="text-xl font-bold text-teal">
            {formatMoney(
              c.agreements
                .filter((a) => ["APPROVED", "SIGNED"].includes(a.status))
                .reduce((s, a) => s + a.pledgedAmountMinor, 0n),
            )}
          </p>
        </Card>
      </div>

      {can("campaign.manage") && ["DRAFT", "READY_FOR_PUBLICATION"].includes(c.status) && (
        <Section title="Publication">
          {blockers.length > 0 ? (
            <Alert tone="warning" title="Cannot publish yet">
              <ul className="list-disc pl-5">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </Alert>
          ) : (
            <Alert tone="success" title="Consent and budget checks pass" />
          )}
          <div className="mt-3 flex flex-wrap gap-3">
            {c.status === "DRAFT" && (
              <ActionForm action={ready}>
                <SubmitButton>Mark ready for publication</SubmitButton>
              </ActionForm>
            )}
            {c.status === "READY_FOR_PUBLICATION" && can("campaign.publish") && (
              <ActionForm action={publish}>
                <SubmitButton variant="cta" confirm="Publish this campaign?">
                  Publish
                </SubmitButton>
              </ActionForm>
            )}
            {c.status === "READY_FOR_PUBLICATION" && (
              <ActionForm action={toDraft}>
                <input type="hidden" name="reason" value="Changes needed" />
                <SubmitButton variant="secondary">Return to draft</SubmitButton>
              </ActionForm>
            )}
          </div>
          {c.readyById && (
            <p className="mt-2 text-sm text-muted">
              Prepared by a colleague – the publisher must be a different person.
            </p>
          )}
        </Section>
      )}

      {can("campaign.manage") && ["DRAFT", "READY_FOR_PUBLICATION"].includes(c.status) && (
        <Section title="Edit">
          <Card>
            <CampaignForm action={update} campaign={c} lines={c.budgetLines} submitLabel="Save changes" />
          </Card>
        </Section>
      )}

      {!["DRAFT", "READY_FOR_PUBLICATION"].includes(c.status) && (
        <Section title="Published details">
          <Card>
            <DefinitionList
              items={[
                ["Summary", c.summary],
                ["Location", c.locationLabel],
                ["Intervention", c.interventionSummary],
                ["Verification", c.verificationSummary],
                ["Published", formatDate(c.publishedAt)],
                [
                  "Budget",
                  <ul key="b">
                    {c.budgetLines.map((l) => (
                      <li key={l.id}>
                        {l.description}: {formatMoney(l.amountMinor)}
                      </li>
                    ))}
                  </ul>,
                ],
              ]}
            />
          </Card>
        </Section>
      )}

      <Section title="Intervention">
        {c.intervention ? (
          <Card>
            <p>
              <Badge>{humanize(c.intervention.status)}</Badge> Budget{" "}
              {formatMoney(c.intervention.approvedBudgetMinor)}
            </p>
            <Link href={`/staff/interventions/${c.intervention.id}`} className="mt-2 block font-semibold">
              Open intervention
            </Link>
          </Card>
        ) : can("intervention.manage") && c.status !== "CANCELLED" ? (
          <Card>
            <ActionForm action={startIntervention}>
              <Field label="Approved scope" name="scope">
                <textarea
                  id="scope"
                  name="scope"
                  rows={3}
                  defaultValue={c.interventionSummary}
                  className={inputClass}
                />
              </Field>
              <Field label="Planned outcome" name="plannedOutcome">
                <textarea id="plannedOutcome" name="plannedOutcome" rows={2} className={inputClass} />
              </Field>
              <Field label="Approved budget (₦)" name="approvedBudget">
                <input
                  id="approvedBudget"
                  name="approvedBudget"
                  defaultValue={minorToMajorString(c.targetAmountMinor)}
                  className={inputClass}
                />
              </Field>
              <SubmitButton>Create intervention plan</SubmitButton>
            </ActionForm>
          </Card>
        ) : (
          <p className="text-muted">No intervention yet.</p>
        )}
      </Section>

      {can("campaign.manage") && (
        <Section title="Funding controls">
          <div className="grid gap-4 md:grid-cols-2">
            {c.status === "FUNDING_IN_PROGRESS" && (
              <Card>
                <h3 className="font-semibold">Close funding below target</h3>
                <ActionForm action={closeFunding} className="mt-2">
                  <input
                    name="reason"
                    className={inputClass}
                    aria-label="Reason"
                    placeholder="Reason, e.g. phased delivery approved"
                  />
                  <SubmitButton variant="secondary">Close as partially funded</SubmitButton>
                </ActionForm>
              </Card>
            )}
            {!["COMPLETED", "CANCELLED", "OUTCOME_REVIEW"].includes(c.status) && (
              <Card>
                <h3 className="font-semibold">Cancel campaign</h3>
                <p className="text-sm text-muted">
                  Funds held are not moved automatically. Finance will apply the published refund and
                  unspent-funds policy.
                </p>
                <ActionForm action={cancel} className="mt-2">
                  <input name="reason" className={inputClass} aria-label="Reason" placeholder="Reason" />
                  <SubmitButton variant="danger" confirm="Cancel this campaign?">
                    Cancel campaign
                  </SubmitButton>
                </ActionForm>
              </Card>
            )}
          </div>
        </Section>
      )}

      <Section title="Sponsorship and in-kind">
        <ul className="text-sm">
          {c.agreements.map((a) => (
            <li key={a.id}>
              {a.organisation.name}: {humanize(a.status)} · pledged {formatMoney(a.pledgedAmountMinor)}
            </li>
          ))}
          {c.inKind.map((i) => (
            <li key={i.id}>
              In-kind: {i.quantity} {i.unit} {i.description} · {humanize(i.status)}
            </li>
          ))}
          {!c.agreements.length && !c.inKind.length && <li className="text-muted">None yet.</li>}
        </ul>
      </Section>

      <Section title="History">
        <ol className="text-sm">
          {history.map((h) => (
            <li key={h.id}>
              {formatDate(h.createdAt, true)} · {h.fromStatus ? `${humanize(h.fromStatus)} → ` : ""}
              {humanize(h.toStatus)}
              {h.reason ? ` – ${h.reason}` : ""}
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
