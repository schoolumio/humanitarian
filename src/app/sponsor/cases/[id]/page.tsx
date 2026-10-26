import { notFound, redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { Card, Field, PageHeader, Section, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { FundingSummary } from "@/components/public/campaign-card";
import { getActor, requirePageActor } from "@/server/current-user";
import { requireActor } from "@/server/actor";
import { runAction, type FormState } from "@/server/action";
import { getSponsorCase, offerInKind, submitProposal } from "@/server/services/sponsors";

export const metadata = { title: "Case details" };

export default async function SponsorCase({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageActor(`/sponsor/cases/${id}`);
  let c;
  try {
    c = await getSponsorCase(actor, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "FORBIDDEN") redirect("/sponsor");
    if (e instanceof AppError) notFound();
    throw e;
  }
  async function propose(_: FormState, fd: FormData): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await submitProposal(requireActor(await getActor()), { ...Object.fromEntries(fd), campaignId: id });
      return "Proposal submitted. We will respond through your sponsor portal.";
    });
  }
  async function inKind(_: FormState, fd: FormData): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await offerInKind(requireActor(await getActor()), { ...Object.fromEntries(fd), campaignId: id });
      return "In-kind offer submitted for review.";
    });
  }
  return (
    <div className="max-w-4xl">
      <PageHeader title={c.title} description={`${c.category.name} · ${c.locationLabel}`} />
      <Card>
        <FundingSummary c={c} />
        <p className="mt-3 whitespace-pre-line">{c.summary}</p>
        <p className="mt-3">
          <strong>Intervention:</strong> {c.interventionSummary}
        </p>
        <p className="mt-2 text-sm">
          <strong>Verification:</strong> {c.verificationSummary}
        </p>
        <ul className="mt-3 text-sm">
          {c.budgetLines.map((l, i) => (
            <li key={i}>
              {l.description}: {formatMoney(l.amountMinor)}
            </li>
          ))}
        </ul>
      </Card>
      <p className="mt-3 text-sm text-muted">
        Sponsors do not receive beneficiaries&apos; personal information or direct contact. Branding and story
        reuse depend on the beneficiary&apos;s consent and your agreement.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {c.acceptsSponsorship && (
          <Section title="Make a sponsorship proposal">
            <Card>
              <ActionForm action={propose} resetOnSuccess>
                <Field label="Proposal type" name="type">
                  <select id="type" name="type" className={inputClass}>
                    <option value="FULL_CASH_SPONSORSHIP">Fund the full intervention</option>
                    <option value="PARTIAL_CASH_SPONSORSHIP">Fund an approved portion</option>
                    <option value="PROFESSIONAL_SERVICES">Professional services</option>
                    <option value="ENQUIRY">Request more information</option>
                  </select>
                </Field>
                <Field label="Proposed amount (₦, optional)" name="proposedAmount">
                  <input
                    id="proposedAmount"
                    name="proposedAmount"
                    inputMode="decimal"
                    className={inputClass}
                  />
                </Field>
                <Field label="Message" name="message">
                  <textarea id="message" name="message" rows={4} className={inputClass} />
                </Field>
                <SubmitButton>Submit proposal</SubmitButton>
              </ActionForm>
            </Card>
          </Section>
        )}
        {c.acceptsInKind && (
          <Section title="Offer goods or services">
            <Card>
              <ActionForm action={inKind} resetOnSuccess>
                <Field label="Type" name="itemCategory">
                  <select id="itemCategory" name="itemCategory" className={inputClass}>
                    {[
                      "FURNITURE",
                      "FOOD",
                      "BUILDING_MATERIALS",
                      "ACCOMMODATION",
                      "BUSINESS_EQUIPMENT",
                      "TRAINING",
                      "PROFESSIONAL_SERVICES",
                      "TRANSPORT",
                      "OTHER",
                    ].map((t) => (
                      <option key={t} value={t}>
                        {t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Description" name="ik-desc">
                  <input id="ik-desc" name="description" className={inputClass} />
                </Field>
                <Field label="Quantity" name="quantity">
                  <input id="quantity" name="quantity" type="number" min={1} className={inputClass} />
                </Field>
                <Field label="Unit" name="unit">
                  <input id="unit" name="unit" defaultValue="items" className={inputClass} />
                </Field>
                <Field label="Estimated value (₦, optional)" name="estimatedValue">
                  <input
                    id="estimatedValue"
                    name="estimatedValue"
                    inputMode="decimal"
                    className={inputClass}
                  />
                </Field>
                <Field label="How was the value estimated?" name="valuationBasis">
                  <input id="valuationBasis" name="valuationBasis" className={inputClass} />
                </Field>
                <Field label="Delivery arrangements" name="deliveryArrangements">
                  <input id="deliveryArrangements" name="deliveryArrangements" className={inputClass} />
                </Field>
                <SubmitButton variant="secondary">Offer</SubmitButton>
              </ActionForm>
            </Card>
          </Section>
        )}
      </div>
    </div>
  );
}
