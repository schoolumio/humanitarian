import Link from "@/components/ui/link";
import { notFound, redirect } from "next/navigation";
import type { ConsentType } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { CONSENT_TEXT, effectiveConsents } from "@/lib/consent";
import { APPLICANT_STATUS_TEXT, APPLICATION_TRANSITIONS } from "@/lib/workflow/application";
import { CAMPAIGN_STATUS_LABEL } from "@/lib/workflow/campaign";
import { canTransition, nextStates } from "@/lib/workflow/machine";
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
import { Uploader } from "@/components/applicant/uploader";
import { requirePagePermission } from "@/server/current-user";
import { getCaseForStaff, listInvestigators } from "@/server/services/cases";
import { CONTACT_METHOD_LABEL } from "@/server/validation/application";
import * as A from "./actions";

export const metadata = { title: "Case workspace" };

const STAGE_LABEL = {
  SCREENING: "Stage 1 – Initial screening",
  REMOTE: "Stage 2 – Remote verification",
  FIELD: "Stage 3 – Field investigation",
  REVIEW: "Stage 4 – Review",
} as const;

export default async function CaseWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePagePermission(["application.view_all", "application.view_assigned"]);
  let data;
  try {
    data = await getCaseForStaff(actor, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "FORBIDDEN") redirect("/forbidden");
    if (e instanceof AppError) notFound();
    throw e;
  }
  const {
    app,
    items,
    files,
    tasks,
    assignments,
    visits,
    notes,
    reports,
    reviews,
    decisions,
    infoRequests,
    history,
    alerts,
    campaign,
    category,
    safeguarding,
    names,
  } = data;
  const consents = effectiveConsents(data.consents);
  const can = (p: Parameters<typeof actor.permissions.has>[0]) => actor.permissions.has(p);
  const myAssignment = assignments.find((a) => a.active && a.investigator.id === actor.userId);
  const investigators = can("investigation.assign") ? await listInvestigators() : [];
  const transitions = nextStates(APPLICATION_TRANSITIONS, app.status).filter(
    (to) =>
      to !== "APPROVED" &&
      to !== "DECLINED" &&
      to !== "WITHDRAWN" &&
      canTransition(APPLICATION_TRANSITIONS, app.status, to, { permissions: actor.permissions }),
  );
  const closed = ["DECLINED", "WITHDRAWN", "CLOSED"].includes(app.status);
  const name = (uid: string | null) => (uid ? (names[uid] ?? "Staff member") : "System");

  return (
    <div>
      <PageHeader
        title={`Case ${app.reference}`}
        description={
          <>
            {category?.name ?? "No category"} · Submitted {formatDate(app.submittedAt)} ·{" "}
            <Badge tone="info">{APPLICANT_STATUS_TEXT[app.status].label}</Badge>{" "}
            <Badge tone={app.riskLevel === "HIGH" ? "danger" : "neutral"}>
              {app.riskLevel.toLowerCase()} risk
            </Badge>
          </>
        }
      />

      {app.urgentSafetyConcern && (
        <div className="mb-4">
          <Alert tone="danger" title="Urgent safety concern reported">
            Follow the urgent safety procedure.{" "}
            {app.safetyConcernDetails && (
              <span className="block mt-1 whitespace-pre-line">{app.safetyConcernDetails}</span>
            )}
          </Alert>
        </div>
      )}
      {alerts
        .filter((a) => a.status === "OPEN")
        .map((a) => (
          <div key={a.id} className="mb-2">
            <Alert tone="warning" title={`Risk indicator: ${humanize(a.type)}`}>
              {a.details} <Link href="/staff/risk">Review</Link>. Risk indicators prompt human review; they do
              not decide eligibility.
            </Alert>
          </div>
        ))}

      {myAssignment && !myAssignment.noConflictDeclared && (
        <Card className="mb-4 border-sun-600">
          <h2 className="text-lg">Conflict of interest declaration</h2>
          <p className="mt-1">
            Before working on this case, confirm you have no personal, family, financial or community
            relationship with the applicant that could affect your judgement.
          </p>
          <ActionForm action={A.conflictAction.bind(null, app.id, myAssignment.id)} className="mt-3">
            <label className="flex items-center gap-2">
              <input type="radio" name="hasConflict" value="no" defaultChecked className="h-5 w-5" /> I have
              no conflict of interest
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="hasConflict" value="yes" className="h-5 w-5" /> I have a conflict of
              interest
            </label>
            <Field label="Details (if you have a conflict)" name="details">
              <input id="details" name="details" className={inputClass} />
            </Field>
            <SubmitButton>Submit declaration</SubmitButton>
          </ActionForm>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <Card>
            <h2 className="mb-3 text-lg">Applicant&apos;s request</h2>
            <DefinitionList
              items={[
                ["Name", app.fullName],
                ["Phone", app.phone],
                ["Location", [app.community, app.lga, app.state].filter(Boolean).join(", ")],
                ["Household size", app.householdSize],
                ["Completed with help from", app.completedWithHelpFrom],
                [
                  "What happened",
                  <span key="a" className="whitespace-pre-line">
                    {app.whatHappened}
                  </span>,
                ],
                [
                  "Assistance needed",
                  <span key="b" className="whitespace-pre-line">
                    {app.assistanceNeeded}
                  </span>,
                ],
                ["Why now", app.whyNow],
                ["Successful outcome", app.successOutcome],
                [
                  "Contact methods",
                  app.contactMethods
                    .map((m) => CONTACT_METHOD_LABEL[m as keyof typeof CONTACT_METHOD_LABEL] ?? m)
                    .join(", "),
                ],
                ["Safe contact times", app.safeContactTimes],
                ["Contact safety notes", app.contactSafetyNotes],
                ["Verification alternatives", app.verificationAlternatives],
                ["References", app.referenceContacts],
              ]}
            />
            <h3 className="mt-5 font-semibold">Budget ({formatMoney(app.requestedAmountMinor ?? 0n)})</h3>
            <ul className="mt-1 list-disc pl-5">
              {items.map((i) => (
                <li key={i.id}>
                  {i.quantity} × {i.description} @ {formatMoney(i.unitCostMinor)}
                  {i.sourceNote ? ` (${i.sourceNote})` : ""}
                </li>
              ))}
            </ul>
            {app.budgetNotes && <p className="mt-1 text-sm">{app.budgetNotes}</p>}
          </Card>

          <Section title="Evidence">
            <Card>
              {files.length ? (
                <ul className="divide-y divide-line">
                  {files.map((f) => (
                    <li key={f.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                      <a href={`/api/files/${f.id}`} rel="noopener">
                        {f.originalName}
                      </a>
                      <span className="text-muted">
                        {humanize(f.purpose)} · {Math.ceil(f.sizeBytes / 1024)} KB ·{" "}
                        {f.scanStatus === "NOT_SCANNED_DEV" ? "not scanned (dev)" : humanize(f.scanStatus)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">
                  No evidence uploaded. Lack of documents is not a reason to decline – use an alternative
                  verification method.
                </p>
              )}
              {!closed && (can("application.triage") || myAssignment) && (
                <div className="mt-4">
                  <Uploader
                    purpose="VERIFICATION_EVIDENCE"
                    applicationId={app.id}
                    label="Add verification evidence"
                  />
                </div>
              )}
              <p className="mt-3 text-xs text-muted">
                Downloads use short-lived links and every access is logged.
              </p>
            </Card>
          </Section>

          <Section title="Verification checklist">
            {(["SCREENING", "REMOTE", "FIELD", "REVIEW"] as const).map((stage) => {
              const list = tasks.filter((t) => t.stage === stage);
              if (!list.length) return null;
              return (
                <div key={stage} className="mb-4">
                  <h3 className="mb-2 font-semibold text-brand">{STAGE_LABEL[stage]}</h3>
                  <ul className="flex flex-col gap-2">
                    {list.map((t) => (
                      <li key={t.id} className="rounded border border-line bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>{t.label}</span>
                          <Badge
                            tone={
                              t.status === "DONE"
                                ? "success"
                                : t.status === "NOT_APPLICABLE"
                                  ? "neutral"
                                  : "warning"
                            }
                          >
                            {t.status === "DONE"
                              ? "Done"
                              : t.status === "NOT_APPLICABLE"
                                ? "Not applicable"
                                : "Open"}
                          </Badge>
                        </div>
                        {t.outcomeNote && (
                          <p className="mt-1 text-sm text-muted">
                            {t.outcomeNote} — {name(t.completedById)}, {formatDate(t.completedAt)}
                          </p>
                        )}
                        {!closed && (can("application.triage") || myAssignment) && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-sm text-brand">Update</summary>
                            <ActionForm action={A.taskAction.bind(null, app.id, t.id)} className="mt-2">
                              <select
                                name="status"
                                defaultValue={t.status}
                                className={inputClass}
                                aria-label="Check status"
                              >
                                <option value="OPEN">Open</option>
                                <option value="DONE">Done</option>
                                <option value="NOT_APPLICABLE">Not applicable</option>
                              </select>
                              <input
                                name="note"
                                className={inputClass}
                                placeholder="What was checked / outcome"
                                aria-label="Outcome note"
                                defaultValue={t.outcomeNote ?? ""}
                              />
                              <SubmitButton variant="secondary">Save</SubmitButton>
                            </ActionForm>
                          </details>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </Section>

          <Section title="Field visits">
            {visits.length ? (
              visits.map((v) => (
                <Card key={v.id} className="mb-3">
                  <p>
                    <Badge>{humanize(v.status)}</Badge> requested {formatDate(v.createdAt)} by{" "}
                    {name(v.requestedById)}
                  </p>
                  <p className="mt-1 text-sm">Reason: {v.reason}</p>
                  <p className="mt-1 text-sm">
                    Estimated cost {v.estimatedCostMinor ? formatMoney(v.estimatedCostMinor) : "—"} · Actual{" "}
                    {v.actualCostMinor ? formatMoney(v.actualCostMinor) : "—"} · Scheduled{" "}
                    {formatDate(v.scheduledFor, true)}
                  </p>
                  {v.notes && <p className="mt-1 whitespace-pre-line text-sm">{v.notes}</p>}
                  {!closed &&
                    ["REQUESTED", "SCHEDULED"].includes(v.status) &&
                    (can("application.triage") || myAssignment) && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm text-brand">Update visit</summary>
                        <ActionForm
                          action={A.fieldVisitUpdateAction.bind(null, app.id, v.id)}
                          className="mt-2"
                        >
                          <select name="status" className={inputClass} aria-label="Visit status">
                            <option value="SCHEDULED">Scheduled</option>
                            <option value="COMPLETED">Completed</option>
                            <option value="CANCELLED">Cancelled</option>
                          </select>
                          {investigators.length > 0 && (
                            <select
                              name="investigatorId"
                              className={inputClass}
                              aria-label="Investigator"
                              defaultValue={v.investigatorId ?? ""}
                            >
                              <option value="">Me</option>
                              {investigators.map((i) => (
                                <option key={i.id} value={i.id}>
                                  {i.name}
                                </option>
                              ))}
                            </select>
                          )}
                          <Field label="Date and time" name={`when-${v.id}`}>
                            <input
                              id={`when-${v.id}`}
                              type="datetime-local"
                              name="scheduledFor"
                              className={inputClass}
                            />
                          </Field>
                          <Field label="Actual cost (₦)" name={`cost-${v.id}`}>
                            <input
                              id={`cost-${v.id}`}
                              name="actualCost"
                              inputMode="decimal"
                              className={inputClass}
                            />
                          </Field>
                          <Field label="Visit notes" name={`notes-${v.id}`}>
                            <textarea id={`notes-${v.id}`} name="notes" rows={3} className={inputClass} />
                          </Field>
                          <SubmitButton variant="secondary">Save</SubmitButton>
                        </ActionForm>
                      </details>
                    )}
                </Card>
              ))
            ) : (
              <p className="text-muted">
                No field visits. Request one only when the risk level or evidence gaps justify it.
              </p>
            )}
            {!closed &&
              ["VERIFICATION_IN_PROGRESS", "FIELD_VISIT_REQUIRED", "INITIAL_REVIEW"].includes(app.status) &&
              (can("application.triage") || myAssignment) && (
                <details className="mt-2">
                  <summary className="cursor-pointer font-semibold text-brand">Request a field visit</summary>
                  <Card className="mt-2">
                    <ActionForm action={A.fieldVisitRequestAction.bind(null, app.id)}>
                      <Field label="Why is a visit justified?" name="fv-reason">
                        <textarea id="fv-reason" name="reason" rows={3} className={inputClass} />
                      </Field>
                      <Field label="Estimated cost (₦)" name="fv-cost">
                        <input id="fv-cost" name="estimatedCost" inputMode="decimal" className={inputClass} />
                      </Field>
                      <SubmitButton variant="secondary">Request visit</SubmitButton>
                    </ActionForm>
                  </Card>
                </details>
              )}
          </Section>

          <Section title="Investigation notes">
            {!closed && (can("application.triage") || myAssignment) && (
              <Card className="mb-3">
                <ActionForm action={A.noteAction.bind(null, app.id)} resetOnSuccess>
                  <Field
                    label="Add a note"
                    name="note-body"
                    hint="Record facts and sources. Do not include unnecessary personal detail."
                  >
                    <textarea id="note-body" name="body" rows={3} className={inputClass} />
                  </Field>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="restricted" className="h-5 w-5" /> Restricted (visible only
                    to case managers and safeguarding officers)
                  </label>
                  <SubmitButton variant="secondary">Add note</SubmitButton>
                </ActionForm>
              </Card>
            )}
            {notes.length ? (
              <ul className="flex flex-col gap-2">
                {notes.map((n) => (
                  <li key={n.id} className="rounded border border-line bg-white p-3">
                    <p className="text-sm text-muted">
                      {name(n.authorId)} · {formatDate(n.createdAt, true)}{" "}
                      {n.restricted && <Badge tone="warning">restricted</Badge>}
                    </p>
                    <p className="mt-1 whitespace-pre-line">{n.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">No notes yet.</p>
            )}
          </Section>

          <Section title="Investigation reports">
            {reports.map((r) => (
              <Card key={r.id} className="mb-3">
                <p className="text-sm text-muted">
                  {name(r.investigatorId)} · {formatDate(r.createdAt, true)} · Recommendation:{" "}
                  <strong>{humanize(r.recommendation)}</strong>
                </p>
                <p className="mt-2 font-semibold">Summary</p>
                <p className="whitespace-pre-line">{r.summary}</p>
                <p className="mt-2 font-semibold">Findings</p>
                <p className="whitespace-pre-line">{r.findings}</p>
                {r.evidenceGaps && (
                  <>
                    <p className="mt-2 font-semibold">Evidence gaps</p>
                    <p className="whitespace-pre-line">{r.evidenceGaps}</p>
                  </>
                )}
              </Card>
            ))}
            {!closed &&
              can("investigation.record") &&
              (myAssignment?.noConflictDeclared || can("application.triage")) && (
                <details>
                  <summary className="cursor-pointer font-semibold text-brand">
                    Submit investigation report
                  </summary>
                  <Card className="mt-2">
                    <ActionForm action={A.reportAction.bind(null, app.id)}>
                      <Field label="Summary" name="rep-summary">
                        <textarea id="rep-summary" name="summary" rows={3} className={inputClass} />
                      </Field>
                      <Field label="Findings" name="rep-findings">
                        <textarea id="rep-findings" name="findings" rows={5} className={inputClass} />
                      </Field>
                      <Field label="Evidence gaps (optional)" name="rep-gaps">
                        <textarea id="rep-gaps" name="evidenceGaps" rows={2} className={inputClass} />
                      </Field>
                      <Field label="Recommendation" name="rep-rec">
                        <select id="rep-rec" name="recommendation" className={inputClass}>
                          <option value="APPROVE">Approve</option>
                          <option value="FURTHER_INVESTIGATION">Further investigation</option>
                          <option value="DECLINE">Decline</option>
                        </select>
                      </Field>
                      <SubmitButton>Submit report</SubmitButton>
                    </ActionForm>
                  </Card>
                </details>
              )}
          </Section>

          <Section title="Independent review and decision">
            {reviews.map((r) => (
              <Card key={r.id} className="mb-2">
                <p className="text-sm text-muted">
                  Review by {name(r.reviewerId)} · {formatDate(r.createdAt, true)} ·{" "}
                  <strong>{humanize(r.recommendation)}</strong>
                </p>
                <p className="mt-1 whitespace-pre-line">{r.comments}</p>
              </Card>
            ))}
            {decisions.map((d) => (
              <Card key={d.id} className="mb-2">
                <p className="text-sm text-muted">
                  Decision by {name(d.decidedById)} · {formatDate(d.createdAt, true)} ·{" "}
                  <strong>{humanize(d.decision)}</strong>
                  {d.approvedAmountMinor ? ` · ${formatMoney(d.approvedAmountMinor)}` : ""}
                </p>
                <p className="mt-1 whitespace-pre-line">{d.reasonInternal}</p>
                {d.reasonForApplicant && (
                  <p className="mt-1 text-sm">Told to applicant: {d.reasonForApplicant}</p>
                )}
              </Card>
            ))}
            {!closed &&
              can("case.review") &&
              [
                "VERIFICATION_IN_PROGRESS",
                "FIELD_VISIT_REQUIRED",
                "PENDING_APPROVAL",
                "INITIAL_REVIEW",
              ].includes(app.status) && (
                <details className="mb-3">
                  <summary className="cursor-pointer font-semibold text-brand">
                    Record an independent review
                  </summary>
                  <Card className="mt-2">
                    <ActionForm action={A.reviewAction.bind(null, app.id)}>
                      <p className="text-sm text-muted">
                        You must not have investigated this case. Your review is a recommendation; the final
                        decision is recorded separately.
                      </p>
                      <Field label="Recommendation" name="rev-rec">
                        <select id="rev-rec" name="recommendation" className={inputClass}>
                          <option value="APPROVE">Approve</option>
                          <option value="FURTHER_INVESTIGATION">Further investigation</option>
                          <option value="DECLINE">Decline</option>
                        </select>
                      </Field>
                      <Field label="Comments" name="rev-comments">
                        <textarea id="rev-comments" name="comments" rows={4} className={inputClass} />
                      </Field>
                      <SubmitButton>Record review</SubmitButton>
                    </ActionForm>
                  </Card>
                </details>
              )}
            {can("case.decide") && !closed && APPLICATION_TRANSITIONS[app.status]?.DECLINED !== undefined && (
              <details>
                <summary className="cursor-pointer font-semibold text-brand">Record final decision</summary>
                <Card className="mt-2">
                  <ActionForm action={A.decisionAction.bind(null, app.id)}>
                    <p className="text-sm text-muted">
                      Approval requires: Pending approval status, an approving review by someone else,
                      completed screening and remote checks. You cannot decide a case you investigated.
                      Decisions are made by people, never automatically.
                    </p>
                    <Field label="Decision" name="dec">
                      <select id="dec" name="decision" className={inputClass}>
                        <option value="APPROVED">Approve</option>
                        <option value="DECLINED">Decline</option>
                      </select>
                    </Field>
                    <Field label="Approved amount (₦, if approving)" name="dec-amount">
                      <input
                        id="dec-amount"
                        name="approvedAmount"
                        inputMode="decimal"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Reasons (internal record)" name="dec-reason">
                      <textarea id="dec-reason" name="reasonInternal" rows={3} className={inputClass} />
                    </Field>
                    <Field
                      label="Explanation for the applicant (required if declining)"
                      name="dec-app"
                      hint="Be clear and respectful. Omit details restricted for safeguarding or fraud-prevention reasons."
                    >
                      <textarea id="dec-app" name="reasonForApplicant" rows={3} className={inputClass} />
                    </Field>
                    <SubmitButton confirm="Record this decision? The applicant will be notified.">
                      Record decision
                    </SubmitButton>
                  </ActionForm>
                </Card>
              </details>
            )}
            {can("case.decide") && app.status === "DECLINED" && (
              <details>
                <summary className="cursor-pointer font-semibold text-brand">Reopen case</summary>
                <Card className="mt-2">
                  <ActionForm action={A.reopenAction.bind(null, app.id)}>
                    <Field label="Justification" name="reopen">
                      <textarea id="reopen" name="reason" rows={2} className={inputClass} />
                    </Field>
                    <SubmitButton variant="secondary">Reopen</SubmitButton>
                  </ActionForm>
                </Card>
              </details>
            )}
          </Section>
        </div>

        <aside className="flex flex-col gap-4">
          {transitions.length > 0 && (
            <Card>
              <h2 className="text-lg">Move case</h2>
              <ActionForm action={A.transitionAction.bind(null, app.id)} className="mt-2">
                <select name="to" className={inputClass} aria-label="New status">
                  {transitions.map((t) => (
                    <option key={t} value={t}>
                      {APPLICANT_STATUS_TEXT[t].label}
                    </option>
                  ))}
                </select>
                <input
                  name="reason"
                  className={inputClass}
                  placeholder="Reason (recorded)"
                  aria-label="Reason"
                />
                <SubmitButton variant="secondary">Update status</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {!closed && (can("application.triage") || myAssignment) && (
            <Card>
              <h2 className="text-lg">Request information</h2>
              <ActionForm action={A.requestInfoAction.bind(null, app.id)} className="mt-2" resetOnSuccess>
                <textarea
                  name="message"
                  rows={3}
                  className={inputClass}
                  aria-label="Message to applicant"
                  placeholder="What do you need from the applicant?"
                />
                <SubmitButton variant="secondary">Send request</SubmitButton>
              </ActionForm>
              {infoRequests.length > 0 && (
                <ul className="mt-3 flex flex-col gap-2 text-sm">
                  {infoRequests.map((r) => (
                    <li key={r.id} className="rounded bg-cream p-2">
                      <p>{r.message}</p>
                      <p className="mt-1 text-muted">
                        {r.respondedAt ? `Reply: ${r.responseText}` : "Awaiting reply"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <Card>
            <h2 className="text-lg">Investigators</h2>
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {assignments.map((a) => (
                <li key={a.id}>
                  {a.investigator.name} {a.active ? <Badge tone="info">active</Badge> : <Badge>ended</Badge>}{" "}
                  {a.active && !a.noConflictDeclared && <Badge tone="warning">no declaration</Badge>}
                  {a.active && can("investigation.assign") && (
                    <ActionForm action={A.endAssignmentAction.bind(null, app.id, a.id)}>
                      <input type="hidden" name="reason" value="Reassigned" />
                      <SubmitButton variant="ghost">End assignment</SubmitButton>
                    </ActionForm>
                  )}
                </li>
              ))}
              {!assignments.length && <li className="text-muted">None assigned.</li>}
            </ul>
            {!closed && can("investigation.assign") && (
              <ActionForm action={A.assignAction.bind(null, app.id)} className="mt-3">
                <select name="investigatorId" className={inputClass} aria-label="Investigator">
                  <option value="">Choose investigator</option>
                  {investigators.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                <select name="priority" className={inputClass} aria-label="Priority" defaultValue="2">
                  <option value="1">High priority</option>
                  <option value="2">Normal priority</option>
                  <option value="3">Low priority</option>
                </select>
                <Field label="Follow up by" name="followUpAt">
                  <input id="followUpAt" type="date" name="followUpAt" className={inputClass} />
                </Field>
                <SubmitButton variant="secondary">Assign</SubmitButton>
              </ActionForm>
            )}
          </Card>
          <Card>
            <h2 className="text-lg">Consents</h2>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {(Object.keys(CONSENT_TEXT) as ConsentType[]).map((t) => (
                <li key={t} className="flex justify-between gap-2">
                  <span>{CONSENT_TEXT[t].title}</span>
                  <Badge tone={consents.get(t) ? "success" : "neutral"}>
                    {consents.get(t) ? "Yes" : "No"}
                  </Badge>
                </li>
              ))}
            </ul>
            {can("consent.record_on_behalf") && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-brand">Record consent given offline</summary>
                <ActionForm action={A.consentOnBehalfAction.bind(null, app.id)} className="mt-2">
                  <select name="type" className={inputClass} aria-label="Consent type">
                    {(Object.keys(CONSENT_TEXT) as ConsentType[]).map((t) => (
                      <option key={t} value={t}>
                        {CONSENT_TEXT[t].title}
                      </option>
                    ))}
                  </select>
                  <select name="granted" className={inputClass} aria-label="Granted">
                    <option value="yes">Granted</option>
                    <option value="no">Withdrawn / refused</option>
                  </select>
                  <select name="method" className={inputClass} aria-label="Method">
                    <option value="WRITTEN_FORM">Written form</option>
                    <option value="VERBAL_RECORDED_BY_STAFF">Verbal, recorded by staff</option>
                  </select>
                  <input
                    name="notes"
                    className={inputClass}
                    placeholder="When, how, witness"
                    aria-label="Notes"
                  />
                  <SubmitButton variant="secondary">Record</SubmitButton>
                </ActionForm>
              </details>
            )}
          </Card>
          {campaign ? (
            <Card>
              <h2 className="text-lg">Campaign</h2>
              <p className="mt-1 text-sm">{campaign.title}</p>
              <p className="mt-1">
                <Badge>{CAMPAIGN_STATUS_LABEL[campaign.status]}</Badge>
              </p>
              {can("campaign.manage") && (
                <Link href={`/staff/campaigns/${campaign.id}`} className="mt-2 block">
                  Open campaign
                </Link>
              )}
            </Card>
          ) : app.status === "APPROVED" && can("campaign.manage") ? (
            <Card>
              <h2 className="text-lg">Campaign</h2>
              <p className="mt-1 text-sm">
                Approved cases can be funded publicly, privately through sponsors, or both.
              </p>
              <Link href={`/staff/campaigns/new?application=${app.id}`} className="mt-2 block font-semibold">
                Prepare campaign
              </Link>
            </Card>
          ) : null}
          {can("safeguarding.manage") && (
            <Card>
              <h2 className="text-lg">Safeguarding</h2>
              {safeguarding.map((s) => (
                <p key={s.id} className="mt-1 text-sm">
                  <Badge tone="danger">{s.severity}</Badge> {s.status} – {s.summary.slice(0, 80)}
                </p>
              ))}
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-brand">Open a safeguarding record</summary>
                <ActionForm action={A.safeguardingAction.bind(null, app.id)} className="mt-2">
                  <select name="severity" className={inputClass} aria-label="Severity">
                    <option>LOW</option>
                    <option>MEDIUM</option>
                    <option>HIGH</option>
                    <option>CRITICAL</option>
                  </select>
                  <textarea
                    name="summary"
                    rows={3}
                    className={inputClass}
                    aria-label="Summary"
                    placeholder="Summary"
                  />
                  <textarea
                    name="actionsTaken"
                    rows={2}
                    className={inputClass}
                    aria-label="Actions taken"
                    placeholder="Immediate actions taken"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="restrictPublication" defaultChecked className="h-5 w-5" />{" "}
                    Restrict publication
                  </label>
                  <SubmitButton variant="secondary">Create record</SubmitButton>
                </ActionForm>
              </details>
            </Card>
          )}
          <Card>
            <h2 className="text-lg">Decision history</h2>
            <ol className="mt-2 flex flex-col gap-2 text-sm">
              {history.map((h) => (
                <li key={h.id}>
                  <span className="text-muted">{formatDate(h.createdAt, true)}</span> ·{" "}
                  {h.fromStatus ? `${humanize(h.fromStatus)} → ` : ""}
                  <strong>{humanize(h.toStatus)}</strong> · {name(h.actorId)}
                  {h.reason ? ` – ${h.reason}` : ""}
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </div>
  );
}
