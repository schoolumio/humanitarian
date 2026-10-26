import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Badge, Card, EmptyState, PageHeader, Pagination, formatDate, humanize, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { getActor, requirePagePermission } from "@/server/current-user";
import { requireActor } from "@/server/actor";
import { runAction, str, type FormState } from "@/server/action";
import { listRiskAlerts, reviewRiskAlert } from "@/server/services/risk";

export const metadata = { title: "Risk alerts" };

export default async function RiskPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const actor = await requirePagePermission("risk.review");
  const sp = await searchParams;
  const status = (["OPEN", "REVIEWED", "DISMISSED"].includes(sp.status ?? "") ? sp.status : "OPEN") as "OPEN";
  const res = await listRiskAlerts(actor, { status, page: Number(sp.page ?? 1) });
  async function review(id: string, _: FormState, fd: FormData): Promise<FormState> { "use server"; return runAction(async () => { await reviewRiskAlert(requireActor(await getActor()), id, str(fd, "outcome") as "REVIEWED", str(fd, "note")); revalidatePath("/staff/risk"); return "Recorded."; }); }
  return (
    <div>
      <PageHeader title="Risk alerts" description="Indicators that route records to a person for review. They never decide eligibility or block support on their own." actions={<><Link href="/staff/risk?status=OPEN">Open</Link> <Link href="/staff/risk?status=REVIEWED">Reviewed</Link> <Link href="/staff/risk?status=DISMISSED">Dismissed</Link></>} />
      {res.rows.length ? <div className="flex flex-col gap-3">{res.rows.map((a) => (
        <Card key={a.id}>
          <p><Badge tone={a.severity === "HIGH" || a.severity === "CRITICAL" ? "danger" : "warning"}>{a.severity.toLowerCase()}</Badge> <strong>{humanize(a.type)}</strong> · {formatDate(a.createdAt, true)}</p>
          <p className="mt-1">{a.details}</p>
          <p className="mt-1 text-sm">{a.applicationId && <Link href={`/staff/applications/${a.applicationId}`}>Open case</Link>} {a.campaignId && <Link href={`/staff/campaigns/${a.campaignId}`}>Open campaign</Link>}</p>
          {a.reviewNote && <p className="mt-1 text-sm text-muted">Review: {a.reviewNote}</p>}
          {a.status === "OPEN" && <ActionForm action={review.bind(null, a.id)} className="mt-2">
            <select name="outcome" className={inputClass} aria-label="Outcome"><option value="REVIEWED">Reviewed – action taken</option><option value="DISMISSED">Dismissed – no concern</option></select>
            <input name="note" className={inputClass} aria-label="Review note" placeholder="What did you check, and what was done?" />
            <SubmitButton variant="secondary">Record review</SubmitButton>
          </ActionForm>}
        </Card>
      ))}</div> : <EmptyState title="No alerts" />}
      <Pagination page={res.page} pageSize={res.pageSize} total={res.total} hrefFor={(p) => `/staff/risk?status=${status}&page=${p}`} />
    </div>
  );
}
