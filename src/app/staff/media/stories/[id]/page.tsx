import Link from "@/components/ui/link";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/errors";
import {
  Alert,
  Badge,
  Card,
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
import * as svc from "@/server/services/media";

export const metadata = { title: "Story" };

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePagePermission("media.manage");
  let data;
  try {
    data = await svc.getStory(actor, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const { s, history, blockers } = data;
  async function edit(_: FormState, fd: FormData): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await svc.editStory(await currentActor(), id, { title: str(fd, "title"), body: str(fd, "body") });
      return "Saved. Approved or published content returns to review after edits.";
    });
  }
  async function submit(): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await svc.submitStoryForReview(await currentActor(), id);
      return "Submitted for review.";
    });
  }
  async function approve(): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await svc.approveStory(await currentActor(), id);
      return "Approved.";
    });
  }
  async function publish(_: FormState, fd: FormData): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await svc.publishStory(await currentActor(), id, str(fd, "externalUrl") || undefined);
      return "Published.";
    });
  }
  async function withdraw(_: FormState, fd: FormData): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await svc.withdrawStory(await currentActor(), id, str(fd, "reason"));
      return "Withdrawn from KindSpring channels.";
    });
  }
  async function metrics(_: FormState, fd: FormData): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await svc.recordStoryMetrics(await currentActor(), id, {
        views: Number(str(fd, "views") || 0),
        reactions: Number(str(fd, "reactions") || 0),
        shares: Number(str(fd, "shares") || 0),
      });
      return "Metrics recorded.";
    });
  }
  const external = !["CAMPAIGN_PAGE", "SPONSOR_REPORT", "INTERNAL_ONLY"].includes(s.channel);
  const m = s.metrics as { views?: number; reactions?: number; shares?: number; recordedAt?: string } | null;
  return (
    <div className="max-w-4xl">
      <PageHeader
        title={s.title}
        description={
          <>
            {humanize(s.type)} · {humanize(s.channel)} · <Badge>{humanize(s.status)}</Badge> ·{" "}
            <Link href={`/staff/campaigns/${s.campaign.id}`}>{s.campaign.title}</Link>
          </>
        }
      />
      {s.status === "UNDER_CONSENT_REVIEW" && (
        <div className="mb-4">
          <Alert tone="danger" title="Consent review required">
            A consent this publication depends on was withdrawn, or its media was taken down. It has been
            removed from KindSpring channels. If it was posted externally, remove it there and record what was
            done. Copies made by third parties may not be fully removable.
          </Alert>
        </div>
      )}
      {blockers.length > 0 && (
        <div className="mb-4">
          <Alert tone="warning" title="Publication blocked">
            <ul className="list-disc pl-5">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </Alert>
        </div>
      )}
      {s.aiAssisted && (
        <p className="mb-3 text-sm">
          <Badge tone="warning">AI-assisted draft</Badge> Every statement must be checked against case records
          before approval.
        </p>
      )}
      <Card>
        <ActionForm action={edit}>
          <Field label="Title" name="title">
            <input id="title" name="title" defaultValue={s.title} className={inputClass} />
          </Field>
          <Field label="Text" name="body">
            <textarea id="body" name="body" rows={10} defaultValue={s.body} className={inputClass} />
          </Field>
          <SubmitButton variant="secondary">Save edits</SubmitButton>
        </ActionForm>
      </Card>
      <div className="mt-4 flex flex-wrap gap-3">
        {["DRAFT", "UNDER_CONSENT_REVIEW"].includes(s.status) && (
          <ActionForm action={submit}>
            <SubmitButton>Submit for editorial review</SubmitButton>
          </ActionForm>
        )}
        {s.status === "IN_REVIEW" &&
          actor.permissions.has("media.approve") &&
          s.authorId !== actor.userId && (
            <ActionForm action={approve}>
              <SubmitButton>Approve</SubmitButton>
            </ActionForm>
          )}
        {s.status === "APPROVED" && actor.permissions.has("media.approve") && (
          <ActionForm action={publish}>
            {external && (
              <Field
                label="Link to the post (after posting manually through the official account)"
                name="externalUrl"
              >
                <input id="externalUrl" name="externalUrl" className={inputClass} placeholder="https://" />
              </Field>
            )}
            <SubmitButton variant="cta">{external ? "Record as published" : "Publish"}</SubmitButton>
          </ActionForm>
        )}
        {s.status !== "WITHDRAWN" && (
          <ActionForm action={withdraw}>
            <input
              name="reason"
              className={inputClass}
              aria-label="Withdrawal reason"
              placeholder="Reason for withdrawal"
            />
            <SubmitButton variant="danger">Withdraw</SubmitButton>
          </ActionForm>
        )}
      </div>
      {s.externalUrl && (
        <p className="mt-3">
          Posted at{" "}
          <a href={s.externalUrl} rel="noopener noreferrer">
            {s.externalUrl}
          </a>
        </p>
      )}
      {s.status === "PUBLISHED" && external && (
        <Section title="Performance (entered from the platform's own analytics)">
          {m && (
            <p className="mb-2 text-sm">
              Views {m.views ?? 0} · Reactions {m.reactions ?? 0} · Shares {m.shares ?? 0} (recorded{" "}
              {formatDate(m.recordedAt, true)})
            </p>
          )}
          <Card>
            <ActionForm action={metrics} className="sm:flex-row">
              <input
                name="views"
                type="number"
                min={0}
                className={inputClass}
                placeholder="Views"
                aria-label="Views"
              />
              <input
                name="reactions"
                type="number"
                min={0}
                className={inputClass}
                placeholder="Reactions"
                aria-label="Reactions"
              />
              <input
                name="shares"
                type="number"
                min={0}
                className={inputClass}
                placeholder="Shares"
                aria-label="Shares"
              />
              <SubmitButton variant="secondary">Record</SubmitButton>
            </ActionForm>
          </Card>
        </Section>
      )}
      <Section title="Attached media">
        <ul className="text-sm">
          {s.media.map((m) => (
            <li key={m.mediaAssetId}>
              {humanize(m.mediaAsset.phase)} {m.mediaAsset.kind.toLowerCase()} –{" "}
              {m.mediaAsset.caption ?? m.mediaAsset.altText} <Badge>{humanize(m.mediaAsset.status)}</Badge>
            </li>
          ))}
          {!s.media.length && <li className="text-muted">None.</li>}
        </ul>
      </Section>
      <Section title="Edit and review history">
        <ol className="text-sm">
          {history.map((h) => (
            <li key={h.id}>
              {formatDate(h.createdAt, true)} · {humanize(h.toStatus)}
              {h.reason ? ` – ${h.reason}` : ""}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-sm text-muted">{s.revisions.length} saved revision(s).</p>
      </Section>
    </div>
  );
}
