import Link from "@/components/ui/link";
import { notFound, redirect } from "next/navigation";
import type { ConsentType } from "@prisma/client";
import { db } from "@/lib/db";
import { formatMoney, minorToMajorString } from "@/lib/money";
import { NIGERIAN_STATES } from "@/lib/nigeria";
import { CONSENT_TEXT, OPTIONAL_CONSENTS } from "@/lib/consent";
import { AppError } from "@/lib/errors";
import { Alert, Card, DefinitionList, Field, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Uploader } from "@/components/applicant/uploader";
import { requirePageActor } from "@/server/current-user";
import { runAction, withRedirect, type FormState } from "@/server/action";
import {
  CONTACT_METHODS,
  CONTACT_METHOD_LABEL,
  STEPS,
  submissionProblems,
} from "@/server/validation/application";
import { getOwnApplication, saveConsents, saveStep, submitApplication } from "@/server/services/applications";
import { getActor } from "@/server/current-user";
import { requireActor } from "@/server/actor";

export const metadata = { title: "Request assistance" };

function formToStepInput(step: number, fd: FormData) {
  if (step === 4) {
    const items: Record<string, string>[] = [];
    for (const [k, v] of fd.entries()) {
      const m = /^items\.(\d+)\.(\w+)$/.exec(k);
      if (m && typeof v === "string") (items[Number(m[1])] ??= {})[m[2]!] = v;
    }
    return {
      items: items.filter((i) => i && (i.description || i.unitCost)),
      budgetNotes: fd.get("budgetNotes") ?? "",
    };
  }
  if (step === 6) return { ...Object.fromEntries(fd), contactMethods: fd.getAll("contactMethods") };
  return Object.fromEntries(fd);
}

export default async function StepPage({ params }: { params: Promise<{ reference: string; step: string }> }) {
  const { reference, step: stepParam } = await params;
  const step = Number(stepParam);
  if (!Number.isInteger(step) || step < 1 || step > 8) notFound();
  const actor = await requirePageActor(`/apply/${reference}/step/${step}`);
  let data;
  try {
    data = await getOwnApplication(actor, reference);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const { app, items, consents, files } = data;
  if (app.status !== "DRAFT") redirect(`/apply/${reference}`);
  if (step > app.draftStep) redirect(`/apply/${reference}/step/${app.draftStep}`);

  async function save(_: FormState, fd: FormData): Promise<FormState> {
    "use server";
    let next = 0;
    const r = await runAction(async () => {
      const res = await saveStep(requireActor(await getActor()), reference, step, formToStepInput(step, fd));
      next = res.nextStep;
    });
    return withRedirect(r, `/apply/${reference}/step/${next}?saved=1`);
  }

  async function saveConsentChoices(_: FormState, fd: FormData): Promise<FormState> {
    "use server";
    const r = await runAction(async () => {
      const choices: Partial<Record<ConsentType, boolean>> = {};
      for (const t of ["ASSESSMENT_DATA_PROCESSING", ...OPTIONAL_CONSENTS] as ConsentType[])
        choices[t] = fd.get(t) === "on";
      await saveConsents(requireActor(await getActor()), reference, choices);
    });
    return withRedirect(r, `/apply/${reference}/step/8`);
  }

  async function submit(): Promise<FormState> {
    "use server";
    const r = await runAction(async () => {
      await submitApplication(requireActor(await getActor()), reference);
    });
    return withRedirect(r, `/apply/${reference}?submitted=1`);
  }

  const categories =
    step === 2 || step === 8
      ? await db.caseCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } })
      : [];

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-muted">Request {app.reference}</p>
      <h1 className="text-2xl sm:text-3xl">
        Step {step} of 8: {STEPS[step - 1]!.title}
      </h1>
      <nav aria-label="Progress" className="my-4">
        <ol className="flex flex-wrap gap-1 text-sm">
          {STEPS.map((s) => (
            <li key={s.n}>
              {s.n <= app.draftStep ? (
                <Link
                  href={`/apply/${reference}/step/${s.n}`}
                  aria-current={s.n === step ? "step" : undefined}
                  className={`inline-block rounded px-2 py-1 no-underline ${s.n === step ? "bg-brand text-white" : "bg-leaf-50 text-brand"}`}
                >
                  {s.n}. {s.title}
                </Link>
              ) : (
                <span className="inline-block rounded bg-white px-2 py-1 text-muted">
                  {s.n}. {s.title}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <Card>
        {step === 1 && (
          <ActionForm action={save}>
            <p className="text-muted">We only ask for what we need to assess your request.</p>
            <Field label="Full name" name="fullName">
              <input
                id="fullName"
                name="fullName"
                defaultValue={app.fullName ?? ""}
                autoComplete="name"
                className={inputClass}
              />
            </Field>
            <Field
              label="Phone number"
              name="phone"
              hint="A number we can reach you on, or a trusted contact's number."
            >
              <input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={app.phone ?? ""}
                autoComplete="tel"
                className={inputClass}
              />
            </Field>
            <Field label="State" name="state">
              <select id="state" name="state" defaultValue={app.state ?? ""} className={inputClass}>
                <option value="">Choose your state</option>
                {NIGERIAN_STATES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Local government area (LGA)" name="lga">
              <input id="lga" name="lga" defaultValue={app.lga ?? ""} className={inputClass} />
            </Field>
            <Field
              label="Town or community"
              name="community"
              hint="This is never published. Public pages show only a general location."
            >
              <input
                id="community"
                name="community"
                defaultValue={app.community ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="How many people live in your household?" name="householdSize">
              <input
                id="householdSize"
                name="householdSize"
                type="number"
                min={1}
                max={50}
                defaultValue={app.householdSize ?? ""}
                className={inputClass}
              />
            </Field>
            <Field
              label="Is someone helping you complete this form? (optional)"
              name="completedWithHelpFrom"
              hint="For example: “My community leader, Mrs A.”"
            >
              <input
                id="completedWithHelpFrom"
                name="completedWithHelpFrom"
                defaultValue={app.completedWithHelpFrom ?? ""}
                className={inputClass}
              />
            </Field>
            <SubmitButton>Save and continue</SubmitButton>
          </ActionForm>
        )}

        {step === 2 && (
          <ActionForm action={save}>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 font-semibold">What kind of assistance do you need?</legend>
              {categories.map((c) => (
                <label key={c.id} className="flex items-start gap-3 rounded border border-line p-3">
                  <input
                    type="radio"
                    name="categoryId"
                    value={c.id}
                    defaultChecked={app.categoryId === c.id}
                    className="mt-1 h-5 w-5"
                  />
                  <span>
                    <span className="font-semibold">{c.name}</span>
                    <br />
                    <span className="text-sm text-muted">{c.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <SubmitButton>Save and continue</SubmitButton>
          </ActionForm>
        )}

        {step === 3 && (
          <div>
            <ActionForm action={save} autosaveKey={`ks-${reference}-3`}>
              <Field
                label="What happened?"
                name="whatHappened"
                hint="In your own words. Share only what you are comfortable sharing."
              >
                <textarea
                  id="whatHappened"
                  name="whatHappened"
                  rows={6}
                  defaultValue={app.whatHappened ?? ""}
                  className={inputClass}
                />
              </Field>
              <Field label="What assistance do you need?" name="assistanceNeeded">
                <textarea
                  id="assistanceNeeded"
                  name="assistanceNeeded"
                  rows={4}
                  defaultValue={app.assistanceNeeded ?? ""}
                  className={inputClass}
                />
              </Field>
              <Field label="Why is the assistance needed now?" name="whyNow">
                <textarea
                  id="whyNow"
                  name="whyNow"
                  rows={3}
                  defaultValue={app.whyNow ?? ""}
                  className={inputClass}
                />
              </Field>
              <Field label="What would successful support achieve?" name="successOutcome">
                <textarea
                  id="successOutcome"
                  name="successOutcome"
                  rows={3}
                  defaultValue={app.successOutcome ?? ""}
                  className={inputClass}
                />
              </Field>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name="urgentSafetyConcern"
                  defaultChecked={app.urgentSafetyConcern}
                  className="mt-1 h-5 w-5"
                />
                <span>
                  There is an urgent safety concern (for example, risk of violence, eviction tonight, or a
                  health emergency).
                </span>
              </label>
              <Field
                label="If yes, please describe the safety concern"
                name="safetyConcernDetails"
                hint="A safeguarding officer will review this the same working day. If you are in immediate danger call 112."
              >
                <textarea
                  id="safetyConcernDetails"
                  name="safetyConcernDetails"
                  rows={3}
                  defaultValue={app.safetyConcernDetails ?? ""}
                  className={inputClass}
                />
              </Field>
              <SubmitButton>Save and continue</SubmitButton>
            </ActionForm>
          </div>
        )}

        {step === 4 && (
          <ActionForm action={save}>
            <p className="text-muted">
              List what is needed and the estimated cost of each item in naira. Add up to 10 items here; tell
              us about any others in the notes.
            </p>
            {Array.from({ length: Math.max(10, items.length) }).map((_, i) => {
              const it = items[i];
              return (
                <fieldset
                  key={i}
                  className="grid gap-2 rounded border border-line p-3 sm:grid-cols-[minmax(0,1fr)_6rem_9rem]"
                >
                  <legend className="px-1 text-sm font-semibold">
                    Item {i + 1}
                    {i > 0 ? " (optional)" : ""}
                  </legend>
                  <div>
                    <label htmlFor={`d${i}`} className="text-sm">
                      Description
                    </label>
                    <input
                      id={`d${i}`}
                      name={`items.${i}.description`}
                      defaultValue={it?.description ?? ""}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor={`q${i}`} className="text-sm">
                      Quantity
                    </label>
                    <input
                      id={`q${i}`}
                      name={`items.${i}.quantity`}
                      type="number"
                      min={1}
                      defaultValue={it?.quantity ?? 1}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor={`c${i}`} className="text-sm">
                      Cost each (₦)
                    </label>
                    <input
                      id={`c${i}`}
                      name={`items.${i}.unitCost`}
                      inputMode="decimal"
                      defaultValue={it ? minorToMajorString(it.unitCostMinor) : ""}
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label htmlFor={`s${i}`} className="text-sm">
                      Where did this price come from? (optional)
                    </label>
                    <input
                      id={`s${i}`}
                      name={`items.${i}.sourceNote`}
                      defaultValue={it?.sourceNote ?? ""}
                      className={inputClass}
                      placeholder="e.g. quote from a local shop"
                    />
                  </div>
                </fieldset>
              );
            })}
            {app.requestedAmountMinor !== null && (
              <p>
                Current total: <strong>{formatMoney(app.requestedAmountMinor)}</strong>
              </p>
            )}
            <Field label="Notes about the budget (optional)" name="budgetNotes">
              <textarea
                id="budgetNotes"
                name="budgetNotes"
                rows={3}
                defaultValue={app.budgetNotes ?? ""}
                className={inputClass}
              />
            </Field>
            <SubmitButton>Save and continue</SubmitButton>
          </ActionForm>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-4">
            <p>
              Upload anything that helps explain your situation – for example photos, a quote, a letter, a
              receipt or a school document. <strong>This is optional.</strong> If you do not have documents,
              you can continue: we will discuss other ways to verify your request.
            </p>
            <Alert tone="info">
              Your files are stored privately. Only KindSpring staff assessing your request can open them.
            </Alert>
            <Uploader purpose="APPLICATION_EVIDENCE" applicationId={app.id} />
            {files.length > 0 && (
              <ul className="divide-y divide-line rounded border border-line">
                {files.map((f) => (
                  <li key={f.id} className="flex justify-between gap-3 p-3 text-sm">
                    <span>{f.originalName}</span>
                    <span className="text-muted">{Math.ceil(f.sizeBytes / 1024)} KB</span>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={save}>
              <SubmitButton>Continue</SubmitButton>
            </ActionForm>
          </div>
        )}

        {step === 6 && (
          <ActionForm action={save}>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 font-semibold">How can we contact you safely?</legend>
              {CONTACT_METHODS.map((m) => (
                <label key={m} className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    name="contactMethods"
                    value={m}
                    defaultChecked={app.contactMethods.includes(m)}
                    className="h-5 w-5"
                  />
                  {CONTACT_METHOD_LABEL[m]}
                </label>
              ))}
            </fieldset>
            <Field label="Safe times to contact you (optional)" name="safeContactTimes">
              <input
                id="safeContactTimes"
                name="safeContactTimes"
                defaultValue={app.safeContactTimes ?? ""}
                className={inputClass}
              />
            </Field>
            <Field
              label="Anything we should know to contact you safely? (optional)"
              name="contactSafetyNotes"
              hint="For example: do not leave voice messages; ask for me by my first name only."
            >
              <textarea
                id="contactSafetyNotes"
                name="contactSafetyNotes"
                rows={2}
                defaultValue={app.contactSafetyNotes ?? ""}
                className={inputClass}
              />
            </Field>
            <Field
              label="If you lack documents or digital access, how could we verify your situation? (optional)"
              name="verificationAlternatives"
              hint="For example: a community leader, religious leader, employer or a visit."
            >
              <textarea
                id="verificationAlternatives"
                name="verificationAlternatives"
                rows={3}
                defaultValue={app.verificationAlternatives ?? ""}
                className={inputClass}
              />
            </Field>
            <Field
              label="References we may contact, if you agree (optional)"
              name="referenceContacts"
              hint="Name, relationship and phone number."
            >
              <textarea
                id="referenceContacts"
                name="referenceContacts"
                rows={2}
                defaultValue={app.referenceContacts ?? ""}
                className={inputClass}
              />
            </Field>
            <SubmitButton>Save and continue</SubmitButton>
          </ActionForm>
        )}

        {step === 7 && (
          <ActionForm action={saveConsentChoices}>
            <p>
              We use your information to assess your request. Publication, filming, advertising and sharing
              with sponsors are <strong>separate choices</strong>. Saying no to any of them does not affect
              whether we can help you. You can change these later.
            </p>
            <label className="flex items-start gap-3 rounded border border-brand p-3">
              <input
                type="checkbox"
                name="ASSESSMENT_DATA_PROCESSING"
                defaultChecked={consents.get("ASSESSMENT_DATA_PROCESSING") === true}
                className="mt-1 h-5 w-5"
              />
              <span>
                <span className="font-semibold">{CONSENT_TEXT.ASSESSMENT_DATA_PROCESSING.title}</span>
                <br />
                <span className="text-sm">{CONSENT_TEXT.ASSESSMENT_DATA_PROCESSING.description}</span>
              </span>
            </label>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 font-semibold">Optional choices</legend>
              {OPTIONAL_CONSENTS.map((t) => (
                <label key={t} className="flex items-start gap-3 rounded border border-line p-3">
                  <input
                    type="checkbox"
                    name={t}
                    defaultChecked={consents.get(t) === true}
                    className="mt-1 h-5 w-5"
                  />
                  <span>
                    <span className="font-semibold">{CONSENT_TEXT[t].title}</span>
                    <br />
                    <span className="text-sm text-muted">{CONSENT_TEXT[t].description}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="text-sm text-muted">
              Read our <Link href="/policies/privacy">privacy policy</Link>.
            </p>
            <SubmitButton>Save and continue</SubmitButton>
          </ActionForm>
        )}

        {step === 8 && (
          <ReviewStep
            app={app}
            items={items}
            consents={consents}
            files={files}
            categories={categories}
            reference={reference}
            submit={submit}
          />
        )}
      </Card>
    </div>
  );
}

function ReviewStep({
  app,
  items,
  consents,
  files,
  categories,
  reference,
  submit,
}: {
  app: Awaited<ReturnType<typeof getOwnApplication>>["app"];
  items: Awaited<ReturnType<typeof getOwnApplication>>["items"];
  consents: Map<ConsentType, boolean>;
  files: Awaited<ReturnType<typeof getOwnApplication>>["files"];
  categories: { id: string; name: string }[];
  reference: string;
  submit: () => Promise<FormState>;
}) {
  const problems = submissionProblems({
    ...app,
    budgetItemCount: items.length,
    assessmentConsent: consents.get("ASSESSMENT_DATA_PROCESSING") === true,
  });
  const yes = (t: ConsentType) => (consents.get(t) ? "Yes" : "No");
  return (
    <div className="flex flex-col gap-5">
      <p>Please check your request. You can go back to any step to make changes.</p>
      {problems.length > 0 && (
        <Alert tone="warning" title="A few things are missing">
          <ul className="list-disc pl-5">
            {problems.map((p) => (
              <li key={p.message}>
                <Link href={`/apply/${reference}/step/${p.step}`}>{p.message}</Link>
              </li>
            ))}
          </ul>
        </Alert>
      )}
      <DefinitionList
        items={[
          ["Name", app.fullName],
          ["Phone", app.phone],
          ["Location", [app.community, app.lga, app.state].filter(Boolean).join(", ")],
          ["Type of assistance", categories.find((c) => c.id === app.categoryId)?.name],
          [
            "What happened",
            <span key="w" className="whitespace-pre-line">
              {app.whatHappened}
            </span>,
          ],
          ["Assistance needed", app.assistanceNeeded],
          ["Urgent safety concern", app.urgentSafetyConcern ? "Yes" : "No"],
          [
            "Budget",
            items.length ? (
              <ul key="b">
                {items.map((i) => (
                  <li key={i.id}>
                    {i.quantity} × {i.description} – {formatMoney(i.unitCostMinor * BigInt(i.quantity))}
                  </li>
                ))}
                <li className="font-semibold">Total {formatMoney(app.requestedAmountMinor ?? 0n)}</li>
              </ul>
            ) : null,
          ],
          ["Evidence", files.length ? `${files.length} file(s)` : "None (that is fine)"],
          [
            "Contact methods",
            app.contactMethods
              .map((m) => CONTACT_METHOD_LABEL[m as keyof typeof CONTACT_METHOD_LABEL] ?? m)
              .join(", "),
          ],
          ["Public campaign page", yes("PUBLIC_CAMPAIGN_PAGE")],
          ["Photography / filming", yes("FILMING_AND_PHOTOGRAPHY")],
          ["Social media", yes("SOCIAL_MEDIA")],
          ["Sponsor reports", yes("SPONSOR_REPORTING")],
        ]}
      />
      <Alert tone="info" title="What happens next">
        Our team will review your request and may contact you using the methods you chose. Verification can
        take time, and submitting does not guarantee approval. You can check the status at any time.
      </Alert>
      <ActionForm action={submit}>
        <SubmitButton variant="cta" pendingText="Submitting…">
          Submit my request
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
