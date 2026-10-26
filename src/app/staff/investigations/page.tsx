import Link from "@/components/ui/link";
import { APPLICANT_STATUS_TEXT } from "@/lib/workflow/application";
import { Badge, Card, EmptyState, PageHeader, formatDate } from "@/components/ui";
import { requirePagePermission } from "@/server/current-user";
import { myAssignments } from "@/server/services/cases";
import { CONTACT_METHOD_LABEL } from "@/server/validation/application";

export const metadata = { title: "My investigations" };

export default async function InvestigatorDashboard() {
  const actor = await requirePagePermission("investigation.record");
  const rows = await myAssignments(actor);
  return (
    <div>
      <PageHeader
        title="My investigations"
        description="Cases assigned to you. Confirm you have no conflict of interest before starting work on a case."
      />
      {rows.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Card>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/staff/applications/${r.application.id}`} className="text-lg font-semibold">
                    {r.application.reference}
                  </Link>
                  <Badge tone={r.priority === 1 ? "danger" : "neutral"}>
                    {r.priority === 1 ? "High" : r.priority === 2 ? "Normal" : "Low"} priority
                  </Badge>
                  {r.application.urgentSafetyConcern && <Badge tone="danger">Urgent safety</Badge>}
                  {!r.noConflictDeclared && <Badge tone="warning">Conflict declaration needed</Badge>}
                </div>
                <p className="mt-2 text-sm">
                  {r.application.category?.name} · {r.application.lga}, {r.application.state} ·{" "}
                  {APPLICANT_STATUS_TEXT[r.application.status].label}
                </p>
                <p className="mt-1 text-sm">
                  Contact:{" "}
                  {r.application.contactMethods
                    .map((m) => CONTACT_METHOD_LABEL[m as keyof typeof CONTACT_METHOD_LABEL] ?? m)
                    .join(", ")}
                </p>
                <p className="mt-1 text-sm">
                  {r.application.tasks.length} open checks ·{" "}
                  {r.application.fieldVisits.length
                    ? `${r.application.fieldVisits.length} field visit(s) pending`
                    : "no field visit pending"}
                </p>
                {r.followUpAt && (
                  <p className="mt-1 text-sm">
                    Follow up by {formatDate(r.followUpAt)}
                    {r.followUpAt < new Date() && <Badge tone="danger">overdue</Badge>}
                  </p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No cases are assigned to you" />
      )}
    </div>
  );
}
