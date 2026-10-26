import type { Campaign, CampaignBudgetLine } from "@prisma/client";
import { minorToMajorString } from "@/lib/money";
import { Field, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import type { FormState } from "@/server/action";

/** Shared create/edit form. Budget lines are posted as budgetLines.N.description / .amount. */
export function CampaignForm({
  action,
  campaign,
  lines,
  submitLabel,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  campaign?: Campaign;
  lines?: CampaignBudgetLine[];
  submitLabel: string;
}) {
  const rows = Math.max(6, (lines?.length ?? 0) + 2);
  return (
    <ActionForm action={action}>
      <p className="text-sm text-muted">
        Public text must be anonymised: no full names, phone numbers, exact addresses or identifying details.
        Use respectful, factual language.
      </p>
      <Field label="Public title" name="title">
        <input id="title" name="title" defaultValue={campaign?.title} className={inputClass} />
      </Field>
      <Field label="Approved summary" name="summary">
        <textarea
          id="summary"
          name="summary"
          rows={5}
          defaultValue={campaign?.summary}
          className={inputClass}
        />
      </Field>
      <Field
        label="General location"
        name="locationLabel"
        hint="Town/LGA and state only, e.g. “Ikorodu, Lagos State”."
      >
        <input
          id="locationLabel"
          name="locationLabel"
          defaultValue={campaign?.locationLabel}
          className={inputClass}
        />
      </Field>
      <Field label="Requested intervention" name="interventionSummary">
        <textarea
          id="interventionSummary"
          name="interventionSummary"
          rows={3}
          defaultValue={campaign?.interventionSummary}
          className={inputClass}
        />
      </Field>
      <Field label="Public verification explanation" name="verificationSummary">
        <textarea
          id="verificationSummary"
          name="verificationSummary"
          rows={3}
          defaultValue={campaign?.verificationSummary}
          className={inputClass}
        />
      </Field>
      <Field
        label="Visibility"
        name="visibility"
        hint="Sponsors-only campaigns are never listed publicly and accept sponsor funding only."
      >
        <select
          id="visibility"
          name="visibility"
          defaultValue={campaign?.visibility ?? "PUBLIC"}
          className={inputClass}
        >
          <option value="PUBLIC">Public campaign page</option>
          <option value="SPONSORS_ONLY">Approved sponsors only</option>
        </select>
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="font-semibold">Funding methods</legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="acceptsDonations"
            defaultChecked={campaign?.acceptsDonations ?? true}
            className="h-5 w-5"
          />{" "}
          Individual contributions
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="acceptsSponsorship"
            defaultChecked={campaign?.acceptsSponsorship ?? true}
            className="h-5 w-5"
          />{" "}
          Corporate sponsorship
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="acceptsInKind"
            defaultChecked={campaign?.acceptsInKind ?? false}
            className="h-5 w-5"
          />{" "}
          In-kind goods and services
        </label>
      </fieldset>
      <Field label="Funding end date (optional)" name="endsAt">
        <input
          id="endsAt"
          type="date"
          name="endsAt"
          defaultValue={campaign?.endsAt?.toISOString().slice(0, 10)}
          className={inputClass}
        />
      </Field>
      <fieldset>
        <legend className="mb-2 font-semibold">Itemised budget (the target is the total)</legend>
        <div className="flex flex-col gap-2">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_10rem]">
              <input
                name={`budgetLines.${i}.description`}
                defaultValue={lines?.[i]?.description}
                className={inputClass}
                aria-label={`Budget line ${i + 1} description`}
                placeholder={`Line ${i + 1}`}
              />
              <input
                name={`budgetLines.${i}.amount`}
                defaultValue={lines?.[i] ? minorToMajorString(lines[i]!.amountMinor) : ""}
                inputMode="decimal"
                className={inputClass}
                aria-label={`Budget line ${i + 1} amount in naira`}
                placeholder="₦"
              />
            </div>
          ))}
        </div>
      </fieldset>
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}

export function campaignFormInput(fd: FormData) {
  const lines: { description: string; amount: string }[] = [];
  for (const [k, v] of fd.entries()) {
    const m = /^budgetLines\.(\d+)\.(description|amount)$/.exec(k);
    if (m && typeof v === "string")
      (lines[Number(m[1])] ??= { description: "", amount: "" })[m[2] as "description" | "amount"] = v;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries())
    if (!k.startsWith("budgetLines.") && !k.startsWith("$ACTION")) out[k] = v;
  out.budgetLines = lines.filter((l) => l && (l.description.trim() || l.amount.trim()));
  return out;
}
