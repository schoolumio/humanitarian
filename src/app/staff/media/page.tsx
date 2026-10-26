import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge, Card, DataTable, EmptyState, Field, PageHeader, Section, formatDate, humanize, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { UploadField } from "@/components/applicant/uploader";
import { getActor, requirePagePermission } from "@/server/current-user";
import { requireActor } from "@/server/actor";
import { runAction, str, withRedirect, type FormState } from "@/server/action";
import * as svc from "@/server/services/media";

export const metadata = { title: "Media and stories" };

export default async function MediaWorkspace() {
  const actor = await requirePagePermission(["media.manage", "safeguarding.manage"]);
  if (!actor.permissions.has("media.manage")) redirect("/staff/safeguarding");
  const { assets, stories, campaigns } = await svc.mediaWorkspace(actor);
  const me = async () => requireActor(await getActor());
  const refresh = (m: string) => { revalidatePath("/staff/media"); return m; };
  async function addAsset(_: FormState, fd: FormData): Promise<FormState> { "use server"; return runAction(async () => { await svc.addMediaAsset(await me(), Object.fromEntries(fd)); return refresh("Media added. Another editor must review it."); }); }
  async function review(id: string, approve: boolean): Promise<FormState> { "use server"; return runAction(async () => { await svc.reviewMediaAsset(await me(), id, approve); return refresh(approve ? "Approved (not yet published)." : "Rejected."); }); }
  async function takedown(id: string, _: FormState, fd: FormData): Promise<FormState> { "use server"; return runAction(async () => { await svc.takeDownMedia(await me(), id, str(fd, "reason")); return refresh("Taken down from KindSpring channels. Remove external copies manually."); }); }
  async function newStory(_: FormState, fd: FormData): Promise<FormState> {
    "use server";
    let id = "";
    const r = await runAction(async () => { id = (await svc.createStory(await me(), { ...Object.fromEntries(fd), mediaIds: fd.getAll("mediaIds").map(String) })).id; });
    return withRedirect(r, `/staff/media/stories/${id}`);
  }
  return (
    <div>
      <PageHeader title="Media and stories" description="Source media is private. Nothing becomes public until a story using it is approved by a second editor and published, with the beneficiary's channel-specific consent." />
      {stories.some((s) => s.status === "UNDER_CONSENT_REVIEW") && <div className="mb-4"><Badge tone="danger">Publications under consent review – see below</Badge></div>}
      <Section title="Stories and updates">
        {stories.length ? <DataTable caption="Stories" rows={stories} rowKey={(s) => s.id} columns={[
          { header: "Title", cell: (s) => <Link href={`/staff/media/stories/${s.id}`} className="font-semibold">{s.title}</Link> },
          { header: "Case", cell: (s) => s.campaign.title },
          { header: "Type / channel", cell: (s) => `${humanize(s.type)} · ${humanize(s.channel)}` },
          { header: "Status", cell: (s) => <Badge tone={s.status === "PUBLISHED" ? "success" : s.status === "UNDER_CONSENT_REVIEW" ? "danger" : "neutral"}>{humanize(s.status)}</Badge> },
          { header: "Updated", cell: (s) => formatDate(s.updatedAt) },
        ]} /> : <EmptyState title="No stories yet" />}
        <details className="mt-3"><summary className="cursor-pointer font-semibold text-teal">Draft a new story or update</summary>
          <Card className="mt-2"><ActionForm action={newStory}>
            <Field label="Case" name="campaignId"><select id="campaignId" name="campaignId" className={inputClass}>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></Field>
            <Field label="Type" name="type"><select id="type" name="type" className={inputClass}>{["CASE_STORY", "PROGRESS_UPDATE", "VIDEO_SCRIPT", "PHOTO_CAPTION", "SPONSOR_ACKNOWLEDGEMENT", "COMPLETION_REPORT", "SOCIAL_POST"].map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</select></Field>
            <Field label="Channel" name="channel" hint="Each channel requires its own consent."><select id="channel" name="channel" className={inputClass}>{["CAMPAIGN_PAGE", "SOCIAL_MEDIA", "PAID_ADVERTISING", "SPONSOR_REPORT", "THIRD_PARTY_BRAND", "INTERNAL_ONLY"].map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</select></Field>
            <Field label="Title" name="title"><input id="title" name="title" className={inputClass} /></Field>
            <Field label="Text" name="body" hint="Never fabricate quotes, figures or outcomes. No sensational language."><textarea id="body" name="body" rows={6} className={inputClass} /></Field>
            <fieldset><legend className="font-semibold">Attach approved media</legend>{assets.filter((a) => a.status === "APPROVED").map((a) => <label key={a.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="mediaIds" value={a.id} className="h-5 w-5" />{a.campaign.title}: {humanize(a.phase)} {a.kind.toLowerCase()} – {a.caption ?? a.altText}</label>)}</fieldset>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="aiAssisted" className="h-5 w-5" /> AI tools helped draft this text (staff remain responsible and must verify every statement)</label>
            <SubmitButton>Create draft</SubmitButton>
          </ActionForm></Card>
        </details>
      </Section>
      <Section title="Media library">
        {assets.length ? <DataTable caption="Media" rows={assets} rowKey={(a) => a.id} columns={[
          { header: "Case", cell: (a) => a.campaign.title },
          { header: "Media", cell: (a) => <><a href={`/api/files/${a.originalFileId}`}>{humanize(a.phase)} {a.kind.toLowerCase()}</a><span className="block text-xs text-muted">{a.caption}</span></> },
          { header: "Flags", cell: (a) => <span className="flex flex-wrap gap-1">{a.depictsBeneficiary && <Badge>shows beneficiary</Badge>}{a.depictsMinor && <Badge tone="danger">child{a.safeguardingClearedById ? " – cleared" : " – needs safeguarding review"}</Badge>}{a.publicFileId && <Badge tone="success">public copy live</Badge>}</span> },
          { header: "Status", cell: (a) => <Badge>{humanize(a.status)}</Badge> },
          { header: "Action", cell: (a) => (
            <div className="flex flex-col gap-1">
              {a.status === "UPLOADED" && a.uploadedById !== actor.userId && actor.permissions.has("media.approve") && <><ActionForm action={review.bind(null, a.id, true)}><SubmitButton variant="ghost">Approve</SubmitButton></ActionForm><ActionForm action={review.bind(null, a.id, false)}><SubmitButton variant="ghost">Reject</SubmitButton></ActionForm></>}
              {a.status !== "TAKEN_DOWN" && <details><summary className="cursor-pointer text-sm text-coral-700">Take down</summary><ActionForm action={takedown.bind(null, a.id)}><input name="reason" className={inputClass} aria-label="Reason" placeholder="Reason / takedown request" /><SubmitButton variant="danger">Take down</SubmitButton></ActionForm></details>}
            </div>
          ) },
        ]} /> : <EmptyState title="No media uploaded" />}
        <details className="mt-3"><summary className="cursor-pointer font-semibold text-teal">Upload media</summary>
          <Card className="mt-2"><ActionForm action={addAsset} resetOnSuccess>
            <Field label="Case" name="m-campaign"><select id="m-campaign" name="campaignId" className={inputClass}>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></Field>
            <UploadField purpose="MEDIA_ORIGINAL" label="Original file (photo, short MP4 or interview notes .txt)" />
            <Field label="Kind" name="kind"><select id="kind" name="kind" className={inputClass}><option value="PHOTO">Photo</option><option value="VIDEO">Video</option><option value="INTERVIEW_NOTES">Interview notes</option></select></Field>
            <Field label="Phase" name="phase"><select id="phase" name="phase" className={inputClass}><option value="BEFORE">Before</option><option value="PROGRESS">Progress</option><option value="AFTER">After</option><option value="OTHER">Other</option></select></Field>
            <Field label="Caption" name="caption"><input id="caption" name="caption" className={inputClass} /></Field>
            <Field label="Alternative text (required for photos)" name="altText"><input id="altText" name="altText" className={inputClass} /></Field>
            <label className="flex items-center gap-2"><input type="checkbox" name="depictsBeneficiary" defaultChecked className="h-5 w-5" /> Shows the beneficiary or their home</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="depictsMinor" className="h-5 w-5" /> Shows a child (requires guardian consent and safeguarding clearance)</label>
            <SubmitButton>Add media</SubmitButton>
          </ActionForm></Card>
        </details>
      </Section>
    </div>
  );
}
