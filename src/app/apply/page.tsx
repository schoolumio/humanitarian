import Link from "@/components/ui/link";
import { redirect } from "next/navigation";
import { APPLICANT_STATUS_TEXT } from "@/lib/workflow/application";
import { Badge, ButtonLink, EmptyState, PageHeader, DataTable, formatDate } from "@/components/ui";
import { requirePageActor } from "@/server/current-user";
import { listOwnApplications } from "@/server/services/applications";

export const metadata = { title: "My requests" };

export default async function ApplyHome() {
  const actor = await requirePageActor("/apply");
  if (!actor.roles.includes("APPLICANT")) redirect("/apply/start");
  const apps = await listOwnApplications(actor);
  return (
    <div>
      <PageHeader
        title="My requests for assistance"
        actions={
          <ButtonLink href="/apply/start" variant="cta">
            Start a new request
          </ButtonLink>
        }
      />
      {apps.length ? (
        <DataTable
          caption="Your requests"
          rows={apps}
          rowKey={(a) => a.reference}
          columns={[
            {
              header: "Reference",
              className: "whitespace-nowrap",
              cell: (a) => (
                <Link href={`/apply/${a.reference}`} className="font-semibold">
                  {a.reference}
                </Link>
              ),
            },
            { header: "Type", cell: (a) => a.category?.name ?? "Not chosen yet" },
            {
              header: "Status",
              cell: (a) => (
                <Badge tone={a.status === "DRAFT" ? "warning" : "info"}>
                  {APPLICANT_STATUS_TEXT[a.status].label}
                </Badge>
              ),
            },
            { header: "Submitted", cell: (a) => (a.submittedAt ? formatDate(a.submittedAt) : "Not yet") },
          ]}
        />
      ) : (
        <EmptyState
          title="You have not started a request yet"
          action={<ButtonLink href="/apply/start">Start a request</ButtonLink>}
        >
          Requests are private. Only KindSpring staff who need to assess your request can see them.
        </EmptyState>
      )}
    </div>
  );
}
