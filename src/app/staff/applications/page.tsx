import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { APPLICANT_STATUS_TEXT } from "@/lib/workflow/application";
import { Badge, DataTable, EmptyState, PageHeader, Pagination, buttonClass, formatDate, inputClass } from "@/components/ui";
import { requirePagePermission } from "@/server/current-user";
import { listCases } from "@/server/services/cases";

export const metadata = { title: "Cases" };

const FILTERS = ["OPEN", "SUBMITTED", "INITIAL_REVIEW", "ADDITIONAL_INFORMATION_REQUIRED", "VERIFICATION_IN_PROGRESS", "FIELD_VISIT_REQUIRED", "PENDING_APPROVAL", "APPROVED", "DECLINED", "WITHDRAWN", "CLOSED"];

export default async function CasesQueue({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePagePermission(["application.view_all", "application.view_assigned"]);
  const sp = await searchParams;
  const res = await listCases(actor, { status: sp.status ?? "OPEN", q: sp.q, page: sp.page ?? 1 });
  return (
    <div>
      <PageHeader title="Cases" description="Higher-risk and urgent cases are listed first, then oldest first." />
      <form className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end" role="search">
        <div><label htmlFor="status" className="text-sm font-semibold">Status</label>
          <select id="status" name="status" defaultValue={sp.status ?? "OPEN"} className={inputClass}>
            {FILTERS.map((f) => <option key={f} value={f}>{f === "OPEN" ? "All open" : APPLICANT_STATUS_TEXT[f as keyof typeof APPLICANT_STATUS_TEXT].label}</option>)}
          </select></div>
        <div><label htmlFor="q" className="text-sm font-semibold">Reference</label><input id="q" name="q" defaultValue={sp.q} className={inputClass} placeholder="KS-…" /></div>
        <button className={buttonClass("secondary")}>Filter</button>
      </form>
      {res.rows.length ? (
        <>
          <DataTable caption="Cases" rows={res.rows} rowKey={(r) => r.id} columns={[
            { header: "Reference", cell: (r) => <Link href={`/staff/applications/${r.id}`} className="font-semibold">{r.reference}</Link> },
            { header: "Category", cell: (r) => r.category?.name ?? "—" },
            { header: "Status", cell: (r) => <Badge tone="info">{APPLICANT_STATUS_TEXT[r.status].label}</Badge> },
            { header: "Risk", cell: (r) => <span className="flex flex-wrap gap-1"><Badge tone={r.riskLevel === "HIGH" ? "danger" : r.riskLevel === "MEDIUM" ? "warning" : "neutral"}>{r.riskLevel.toLowerCase()} risk</Badge>{r.urgentSafetyConcern && <Badge tone="danger">urgent safety</Badge>}</span> },
            { header: "Amount", cell: (r) => (r.requestedAmountMinor ? formatMoney(r.requestedAmountMinor) : "—") },
            { header: "State", cell: (r) => r.state ?? "—" },
            { header: "Investigator", cell: (r) => r.assignments.map((a) => a.investigator.name).join(", ") || "Unassigned" },
            { header: "Submitted", cell: (r) => formatDate(r.submittedAt) },
          ]} />
          <Pagination page={res.page} pageSize={res.pageSize} total={res.total} hrefFor={(p) => `/staff/applications?status=${sp.status ?? "OPEN"}&page=${p}`} />
        </>
      ) : <EmptyState title="No cases in this queue" />}
    </div>
  );
}
