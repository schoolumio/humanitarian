import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { Badge, Card, EmptyState, PageHeader, Section, formatDate, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { getActor, requirePagePermission } from "@/server/current-user";
import { requireActor } from "@/server/actor";
import { runAction, str, type FormState } from "@/server/action";
import { listSafeguarding, resolveSafeguardingRecord } from "@/server/services/complaints";
import { clearMinorMedia } from "@/server/services/media";

export const metadata = { title: "Safeguarding" };

export default async function SafeguardingPage() {
  const actor = await requirePagePermission("safeguarding.manage");
  const [records, minorMedia] = await Promise.all([listSafeguarding(actor), db.mediaAsset.findMany({ where: { depictsMinor: true, safeguardingClearedById: null, status: { not: "TAKEN_DOWN" } }, include: { campaign: { select: { title: true } } } })]);
  const me = async () => requireActor(await getActor());
  async function resolve(id: string, _: FormState, fd: FormData): Promise<FormState> { "use server"; return runAction(async () => { await resolveSafeguardingRecord(await me(), id, str(fd, "resolution"), str(fd, "status") as "RESOLVED"); revalidatePath("/staff/safeguarding"); return "Updated."; }); }
  async function clear(id: string, _: FormState, fd: FormData): Promise<FormState> { "use server"; return runAction(async () => { await clearMinorMedia(await me(), id, str(fd, "note")); revalidatePath("/staff/safeguarding"); return "Cleared. Guardian consent is still required before publication."; }); }
  return (
    <div>
      <PageHeader title="Safeguarding" description="Restricted. Every access to this area is logged. Serious incidents require a documented resolution." />
      <Section title="Records">
        {records.length ? <div className="flex flex-col gap-3">{records.map((r) => (
          <Card key={r.id}>
            <p><Badge tone={r.severity === "HIGH" || r.severity === "CRITICAL" ? "danger" : "warning"}>{r.severity}</Badge> {r.status} · {formatDate(r.createdAt)} {r.complaint && `· complaint ${r.complaint.reference}`} {r.application && `· case ${r.application.reference}`} {r.restrictPublication && <Badge>publication restricted</Badge>}</p>
            <p className="mt-2 whitespace-pre-line">{r.summary}</p>
            {r.actionsTaken && <p className="mt-1 text-sm">Actions: {r.actionsTaken}</p>}
            {r.resolution && <p className="mt-1 text-sm">Resolution: {r.resolution}</p>}
            {r.status !== "RESOLVED" && <ActionForm action={resolve.bind(null, r.id)} className="mt-2">
              <select name="status" className={inputClass} aria-label="Status"><option value="MONITORING">Monitoring</option><option value="RESOLVED">Resolved</option></select>
              <textarea name="resolution" rows={3} className={inputClass} aria-label="Resolution" placeholder="Actions, outcome, referrals, who was informed" />
              <SubmitButton variant="secondary">Save</SubmitButton>
            </ActionForm>}
          </Card>
        ))}</div> : <EmptyState title="No safeguarding records" />}
      </Section>
      <Section title="Media showing children awaiting safeguarding review">
        {minorMedia.length ? <ul className="flex flex-col gap-2">{minorMedia.map((m) => (
          <li key={m.id} className="rounded border border-line bg-white p-3"><a href={`/api/files/${m.originalFileId}`}>{m.campaign.title}: {m.caption ?? m.altText}</a>
            <ActionForm action={clear.bind(null, m.id)} className="mt-2"><input name="note" className={inputClass} aria-label="Assessment" placeholder="Assessment: identifiable? risk? guardian consulted?" /><SubmitButton variant="secondary">Clear for possible publication</SubmitButton></ActionForm>
          </li>
        ))}</ul> : <p className="text-muted">None.</p>}
      </Section>
    </div>
  );
}
