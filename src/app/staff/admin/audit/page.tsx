import { ROLE_LABELS } from "@/lib/permissions";
import { Badge, DataTable, PageHeader, Pagination, Section, buttonClass, formatDate, inputClass } from "@/components/ui";
import { requirePagePermission } from "@/server/current-user";
import { accessReview, searchAudit } from "@/server/services/admin";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePagePermission("admin.audit");
  const sp = await searchParams;
  const [res, staff] = await Promise.all([searchAudit(actor, sp), accessReview(actor)]);
  const qs = (p: number) => `/staff/admin/audit?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>, page: String(p) })}`;
  return (
    <div>
      <PageHeader title="Audit log" description="Append-only record of material actions. Searching the log is itself audited." />
      <form className="mb-4 grid gap-2 sm:grid-cols-5" role="search">
        <input name="action" defaultValue={sp.action} className={inputClass} aria-label="Action prefix" placeholder="Action (e.g. payment.)" />
        <input name="entityType" defaultValue={sp.entityType} className={inputClass} aria-label="Entity type" placeholder="Entity type" />
        <input name="entityId" defaultValue={sp.entityId} className={inputClass} aria-label="Entity id" placeholder="Entity id" />
        <input name="actorId" defaultValue={sp.actorId} className={inputClass} aria-label="Actor id" placeholder="Actor id" />
        <button className={buttonClass("secondary")}>Search</button>
      </form>
      <DataTable caption="Audit entries" rows={res.rows} rowKey={(r) => r.id} columns={[
        { header: "When", cell: (r) => formatDate(r.createdAt, true) },
        { header: "Actor", cell: (r) => (r.actorId ? res.names[r.actorId] ?? r.actorId : "System") },
        { header: "Action", cell: (r) => <code className="text-sm">{r.action}</code> },
        { header: "Entity", cell: (r) => <span className="text-sm">{r.entityType} {r.entityId}</span> },
        { header: "Details", cell: (r) => <code className="text-xs">{r.metadata ? JSON.stringify(r.metadata).slice(0, 160) : ""}</code> },
      ]} />
      <Pagination page={res.page} pageSize={res.pageSize} total={res.total} hrefFor={qs} />
      <Section title="Staff access review">
        <p className="mb-2 text-sm text-muted">Review regularly: remove roles that are no longer needed and follow up staff without two-step verification or with long inactivity.</p>
        <DataTable caption="Staff access" rows={staff} rowKey={(u) => u.id} columns={[
          { header: "Staff member", cell: (u) => <>{u.name}<span className="block text-sm text-muted">{u.email}</span></> },
          { header: "Roles", cell: (u) => <span className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r.role}>{ROLE_LABELS[r.role]} since {formatDate(r.createdAt)}</Badge>)}</span> },
          { header: "2SV", cell: (u) => (u.mfaEnabledAt ? "On" : <Badge tone="warning">Off</Badge>) },
          { header: "Last sign-in", cell: (u) => formatDate(u.lastLoginAt) },
          { header: "Status", cell: (u) => u.status.toLowerCase() },
        ]} />
      </Section>
    </div>
  );
}
