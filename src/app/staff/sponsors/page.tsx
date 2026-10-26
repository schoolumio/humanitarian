import { formatMoney } from "@/lib/money";
import {
  Badge,
  Card,
  EmptyState,
  Field,
  PageHeader,
  Section,
  formatDate,
  humanize,
  inputClass,
} from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { requirePagePermission } from "@/server/current-user";
import { runAction, currentActor, str, type FormState } from "@/server/action";
import * as svc from "@/server/services/sponsors";

export const metadata = { title: "Sponsors" };

export default async function StaffSponsors() {
  const actor = await requirePagePermission(["sponsor.review", "sponsor.agreement.approve"]);
  const { orgs, proposals, agreements } = actor.permissions.has("sponsor.review")
    ? await svc.listOrganisationsForReview(actor)
    : {
        orgs: [],
        proposals: [],
        agreements: await (
          await import("@/lib/db")
        ).db.sponsorshipAgreement.findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
          include: {
            organisation: { select: { name: true } },
            campaign: { select: { id: true, title: true } },
          },
        }),
      };
  async function review(id: string, _: FormState, fd: FormData): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await svc.reviewOrganisation(
        await currentActor(),
        id,
        str(fd, "outcome") as "APPROVED",
        str(fd, "notes"),
        str(fd, "publicDisplayName"),
      );
      return "Organisation updated.";
    });
  }
  async function respond(id: string, _: FormState, fd: FormData): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await svc.respondToProposal(
        await currentActor(),
        id,
        str(fd, "status") as "IN_DISCUSSION",
        str(fd, "response"),
      );
      return "Response sent.";
    });
  }
  async function prepare(id: string, _: FormState, fd: FormData): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await svc.prepareAgreement(await currentActor(), id, Object.fromEntries(fd));
      return "Offer prepared. A different staff member must approve it before the sponsor can sign.";
    });
  }
  async function approve(id: string): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await svc.approveAgreement(await currentActor(), id);
      return "Agreement approved; the sponsor can now sign.";
    });
  }
  return (
    <div>
      <PageHeader
        title="Sponsors"
        description="Proposal → offer → approved agreement → signed agreement → pledge → confirmed payment. A pledge is never treated as money received."
      />
      {actor.permissions.has("sponsor.review") && (
        <>
          <Section title="Organisations">
            {orgs.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {orgs.map((o) => (
                  <Card key={o.id}>
                    <p className="font-semibold">
                      {o.name}{" "}
                      <Badge
                        tone={
                          o.status === "APPROVED"
                            ? "success"
                            : o.status === "PENDING_REVIEW"
                              ? "warning"
                              : "danger"
                        }
                      >
                        {humanize(o.status)}
                      </Badge>
                    </p>
                    <p className="text-sm text-muted">
                      {o.registrationNumber ? `CAC ${o.registrationNumber} · ` : ""}
                      {o.sector ?? ""} · {o.contactEmail}
                    </p>
                    <p className="mt-1 text-sm">
                      Representatives:{" "}
                      {o.members
                        .map((m) => `${m.user.name}${m.isAuthorisedRepresentative ? " (authorised)" : ""}`)
                        .join(", ")}
                    </p>
                    {o.reviewNotes && <p className="mt-1 text-sm">Review: {o.reviewNotes}</p>}
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-teal">Review</summary>
                      <ActionForm action={review.bind(null, o.id)} className="mt-2">
                        <select name="outcome" className={inputClass} aria-label="Outcome">
                          <option value="APPROVED">Approve</option>
                          <option value="REJECTED">Reject</option>
                          <option value="SUSPENDED">Suspend</option>
                        </select>
                        <input
                          name="notes"
                          className={inputClass}
                          placeholder="Checks performed"
                          aria-label="Notes"
                        />
                        <input
                          name="publicDisplayName"
                          className={inputClass}
                          placeholder="Public credit name (optional)"
                          aria-label="Public display name"
                          defaultValue={o.publicDisplayName ?? ""}
                        />
                        <SubmitButton variant="secondary">Save review</SubmitButton>
                      </ActionForm>
                    </details>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptyState title="No sponsor organisations yet" />
            )}
          </Section>
          <Section title="Open proposals and enquiries">
            {proposals.length ? (
              <div className="flex flex-col gap-3">
                {proposals.map((p) => (
                  <Card key={p.id}>
                    <p className="font-semibold">
                      {p.organisation.name} · {humanize(p.type)} <Badge>{humanize(p.status)}</Badge>
                    </p>
                    <p className="text-sm text-muted">
                      {formatDate(p.createdAt)}
                      {p.campaign ? ` · Case: ${p.campaign.title}` : ""}
                      {p.proposedAmountMinor ? ` · Proposed ${formatMoney(p.proposedAmountMinor)}` : ""}
                    </p>
                    <p className="mt-2 whitespace-pre-line">{p.message}</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <ActionForm action={respond.bind(null, p.id)}>
                        <select name="status" className={inputClass} aria-label="Status">
                          <option value="IN_DISCUSSION">Reply / in discussion</option>
                          <option value="DECLINED">Decline</option>
                        </select>
                        <textarea
                          name="response"
                          rows={2}
                          className={inputClass}
                          aria-label="Response"
                          placeholder="Response to sponsor"
                        />
                        <SubmitButton variant="secondary">Send</SubmitButton>
                      </ActionForm>
                      {p.campaign &&
                        actor.permissions.has("sponsor.agreement.prepare") &&
                        p.organisation.status === "APPROVED" && (
                          <ActionForm action={prepare.bind(null, p.id)}>
                            <Field label="Pledged amount (₦)" name={`pledge-${p.id}`}>
                              <input
                                id={`pledge-${p.id}`}
                                name="pledgedAmount"
                                inputMode="decimal"
                                className={inputClass}
                              />
                            </Field>
                            <Field label="In-kind support (if any)" name={`ik-${p.id}`}>
                              <input id={`ik-${p.id}`} name="inKindDescription" className={inputClass} />
                            </Field>
                            <Field label="Terms" name={`terms-${p.id}`}>
                              <textarea
                                id={`terms-${p.id}`}
                                name="terms"
                                rows={3}
                                className={inputClass}
                                defaultValue="Funds are restricted to the named case. Sponsor receives progress and financial reports. No direct contact with the beneficiary. Branding only as permitted below and subject to beneficiary consent. Excess or unspent funds follow KindSpring's published funding policy."
                              />
                            </Field>
                            <label className="flex items-center gap-2 text-sm">
                              <input type="checkbox" name="brandingPermitted" className="h-5 w-5" /> Sponsor
                              may be credited publicly
                            </label>
                            <SubmitButton>Prepare offer</SubmitButton>
                          </ActionForm>
                        )}
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptyState title="No open proposals" />
            )}
          </Section>
        </>
      )}
      <Section title="Agreements">
        {agreements.length ? (
          <ul className="flex flex-col gap-2">
            {agreements.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-2 rounded border border-line bg-white p-3"
              >
                <strong>{a.organisation.name}</strong> · {a.campaign.title} · pledged{" "}
                {formatMoney(a.pledgedAmountMinor)} <Badge>{humanize(a.status)}</Badge>
                {a.status === "DRAFT" &&
                  actor.permissions.has("sponsor.agreement.approve") &&
                  a.preparedById !== actor.userId && (
                    <ActionForm action={approve.bind(null, a.id)}>
                      <SubmitButton variant="ghost">Approve</SubmitButton>
                    </ActionForm>
                  )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No agreements yet" />
        )}
      </Section>
    </div>
  );
}
