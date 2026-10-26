import Link from "@/components/ui/link";
import { Badge, DataTable, EmptyState, PageHeader, formatDate, humanize } from "@/components/ui";
import { requirePagePermission } from "@/server/current-user";
import { listComplaints } from "@/server/services/complaints";

export const metadata = { title: "Complaints" };

export default async function ComplaintsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const actor = await requirePagePermission("complaint.manage");
  const { status } = await searchParams;
  const rows = await listComplaints(actor, status);
  return (
    <div>
      <PageHeader
        title="Complaints"
        description={
          actor.permissions.has("safeguarding.manage")
            ? "Including safeguarding concerns."
            : "Safeguarding concerns are handled separately by safeguarding officers."
        }
        actions={
          <>
            <Link href="/staff/complaints">Open</Link>{" "}
            <Link href="/staff/complaints?status=RESOLVED">Resolved</Link>
          </>
        }
      />
      {rows.length ? (
        <DataTable
          caption="Complaints"
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            {
              header: "Reference",
              cell: (r) => (
                <Link href={`/staff/complaints/${r.id}`} className="font-semibold">
                  {r.reference}
                </Link>
              ),
            },
            { header: "Subject", cell: (r) => r.subject },
            {
              header: "Category",
              cell: (r) => (
                <>
                  {humanize(r.category)} {r.isSafeguarding && <Badge tone="danger">safeguarding</Badge>}
                </>
              ),
            },
            {
              header: "Severity",
              cell: (r) => (
                <Badge tone={r.severity === "HIGH" || r.severity === "CRITICAL" ? "danger" : "neutral"}>
                  {r.severity.toLowerCase()}
                </Badge>
              ),
            },
            { header: "Status", cell: (r) => humanize(r.status) },
            { header: "From", cell: (r) => humanize(r.complainantRole) },
            { header: "Received", cell: (r) => formatDate(r.createdAt) },
          ]}
        />
      ) : (
        <EmptyState title="No complaints in this view" />
      )}
    </div>
  );
}
