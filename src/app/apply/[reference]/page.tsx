import Link from "@/components/ui/link";
import { notFound, redirect } from "next/navigation";
import type { ConsentType } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { APPLICANT_STATUS_TEXT, APPLICATION_TRANSITIONS } from "@/lib/workflow/application";
import { CONSENT_TEXT, OPTIONAL_CONSENTS } from "@/lib/consent";
import { Alert, Badge, Card, Field, PageHeader, Section, formatDate, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Uploader } from "@/components/applicant/uploader";
import { getActor, requirePageActor } from "@/server/current-user";
import { requireActor } from "@/server/actor";
import { runAction, str, type FormState } from "@/server/action";
import {
  getOwnApplication,
  respondToInformationRequest,
  saveConsents,
  withdrawApplication,
} from "@/server/services/applications";

export const metadata = { title: "Request status" };

export default async function ApplicationStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { reference } = await params;
  const { submitted } = await searchParams;
  const actor = await requirePageActor(`/apply/${reference}`);
  let data;
  try {
    data = await getOwnApplication(actor, reference);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const { app, infoRequests, history, consents, files, decision, campaign } = data;
  if (app.status === "DRAFT") redirect(`/apply/${reference}/step/${app.draftStep}`);
  const text = APPLICANT_STATUS_TEXT[app.status];
  const canWithdraw = APPLICATION_TRANSITIONS[app.status]?.WITHDRAWN?.includes("OWNER");
  const canAddEvidence = [
    "SUBMITTED",
    "INITIAL_REVIEW",
    "ADDITIONAL_INFORMATION_REQUIRED",
    "VERIFICATION_IN_PROGRESS",
    "FIELD_VISIT_REQUIRED",
  ].includes(app.status);

  async function respond(_: FormState, fd: FormData): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await respondToInformationRequest(
        requireActor(await getActor()),
        reference,
        str(fd, "requestId"),
        str(fd, "response"),
      );
      return "Thank you. Your response has been sent to our team.";
    });
  }
  async function withdraw(_: FormState, fd: FormData): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await withdrawApplication(requireActor(await getActor()), reference, str(fd, "reason"));
      return "Your request has been withdrawn.";
    });
  }
  async function updateConsents(_: FormState, fd: FormData): Promise<FormState> {
    "use server";
    return runAction(async () => {
      const choices: Partial<Record<ConsentType, boolean>> = {};
      for (const t of OPTIONAL_CONSENTS) choices[t] = fd.get(t) === "on";
      const r = await saveConsents(requireActor(await getActor()), reference, choices);
      return r.changed
        ? "Your choices were saved. If you withdrew a permission, we have stopped using material that depends on it and our team will review anything already shared."
        : "No changes.";
    });
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`Request ${app.reference}`}
        description={`Submitted ${formatDate(app.submittedAt)}`}
      />
      {submitted && (
        <div className="mb-4">
          <Alert tone="success" title="Your request has been submitted">
            Your reference is {app.reference}. We have sent a confirmation to your email.
          </Alert>
        </div>
      )}
      <Card>
        <p className="text-sm text-muted">Current status</p>
        <p className="mt-1">
          <Badge tone={app.status === "APPROVED" ? "success" : app.status === "DECLINED" ? "danger" : "info"}>
            {text.label}
          </Badge>
        </p>
        <p className="mt-3">{text.explanation}</p>
        {app.status === "DECLINED" && (decision?.reasonForApplicant || app.declineReasonForApplicant) && (
          <div className="mt-3">
            <Alert tone="neutral" title="Explanation">
              {decision?.reasonForApplicant ?? app.declineReasonForApplicant}
            </Alert>
          </div>
        )}
        {app.status === "DECLINED" && (
          <p className="mt-3 text-sm">
            If you think something was missed, you can{" "}
            <Link href="/complaints/new">ask us to look again</Link>.
          </p>
        )}
        {campaign && (
          <p className="mt-3">
            Your case has a{" "}
            {campaign.visibility === "PUBLIC" ? (
              <Link href={`/cases/${campaign.publicId}`}>public campaign page</Link>
            ) : (
              "private sponsor listing"
            )}
            .
          </p>
        )}
      </Card>

      {infoRequests.length > 0 && (
        <Section title="Messages from our team">
          <div className="flex flex-col gap-3">
            {infoRequests.map((r) => (
              <Card key={r.id}>
                <p className="text-sm text-muted">{formatDate(r.createdAt, true)}</p>
                <p className="mt-1 whitespace-pre-line">{r.message}</p>
                {r.respondedAt ? (
                  <div className="mt-3 rounded bg-ivory p-3">
                    <p className="text-sm text-muted">Your reply · {formatDate(r.respondedAt, true)}</p>
                    <p className="whitespace-pre-line">{r.responseText}</p>
                  </div>
                ) : (
                  <ActionForm action={respond} className="mt-3">
                    <input type="hidden" name="requestId" value={r.id} />
                    <Field label="Your reply" name={`response-${r.id}`}>
                      <textarea id={`response-${r.id}`} name="response" rows={4} className={inputClass} />
                    </Field>
                    <SubmitButton>Send reply</SubmitButton>
                  </ActionForm>
                )}
              </Card>
            ))}
          </div>
        </Section>
      )}

      {canAddEvidence && (
        <Section title="Add supporting evidence">
          <Card>
            <Uploader purpose="APPLICATION_EVIDENCE" applicationId={app.id} />
            {files.length > 0 && (
              <p className="mt-3 text-sm text-muted">{files.length} file(s) uploaded so far.</p>
            )}
          </Card>
        </Section>
      )}

      <Section title="Progress">
        <ol className="flex flex-col gap-2">
          {history.map((h, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-36 shrink-0 text-sm text-muted">{formatDate(h.createdAt, true)}</span>
              <span>
                {APPLICANT_STATUS_TEXT[h.toStatus as keyof typeof APPLICANT_STATUS_TEXT]?.label ?? h.toStatus}
              </span>
            </li>
          ))}
        </ol>
        {app.requestedAmountMinor !== null && (
          <p className="mt-3 text-sm text-muted">Amount requested: {formatMoney(app.requestedAmountMinor)}</p>
        )}
      </Section>

      <Section title="Your publicity and sharing choices">
        <Card>
          <ActionForm action={updateConsents}>
            <p className="text-sm">
              You can change these at any time. Withdrawing a permission stops new use immediately on
              KindSpring&apos;s own channels; material already shared elsewhere will be reviewed and we will
              ask for its removal, but copies made by others may not be fully removable.
            </p>
            {OPTIONAL_CONSENTS.map((t) => (
              <label key={t} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name={t}
                  defaultChecked={consents.get(t) === true}
                  className="mt-1 h-5 w-5"
                />
                <span>{CONSENT_TEXT[t].title}</span>
              </label>
            ))}
            <SubmitButton variant="secondary">Save my choices</SubmitButton>
          </ActionForm>
        </Card>
      </Section>

      {canWithdraw && (
        <Section title="Withdraw this request">
          <Card>
            <ActionForm action={withdraw}>
              <Field label="Reason (optional)" name="reason">
                <input id="reason" name="reason" className={inputClass} />
              </Field>
              <SubmitButton variant="danger" confirm="Withdraw this request? You can submit a new one later.">
                Withdraw request
              </SubmitButton>
            </ActionForm>
          </Card>
        </Section>
      )}
    </div>
  );
}
