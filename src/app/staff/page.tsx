import { PageHeader, Stat } from "@/components/ui";
import { requirePagePermission } from "@/server/current-user";
import { operationsDashboard } from "@/server/services/reports";

export const metadata = { title: "Staff dashboard" };

export default async function StaffDashboard() {
  const actor = await requirePagePermission("staff.dashboard");
  const m = await operationsDashboard(actor);
  const p = (perm: Parameters<typeof actor.permissions.has>[0]) => actor.permissions.has(perm);
  return (
    <div>
      <PageHeader
        title={`Welcome, ${actor.name.split(" ")[0]}`}
        description="Live figures from the database. Select a figure to open the related queue."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>*:nth-child(4n+2)]:border-l-sea [&>*:nth-child(4n+3)]:border-l-grape [&>*:nth-child(4n+4)]:border-l-sun-600">
        {p("application.view_all") && (
          <Stat
            label="Applications awaiting review"
            value={m.awaitingReview}
            href="/staff/applications?status=OPEN"
          />
        )}
        {p("application.view_all") && (
          <Stat
            label="Awaiting more information from applicant"
            value={m.awaitingInfo}
            href="/staff/applications?status=ADDITIONAL_INFORMATION_REQUIRED"
          />
        )}
        {p("application.view_all") && (
          <Stat
            label="Open verification tasks"
            value={m.verifying}
            href="/staff/applications?status=VERIFICATION_IN_PROGRESS"
          />
        )}
        {p("application.view_all") && (
          <Stat
            label="Field visits needing an investigator"
            value={m.fieldVisitsUnassigned}
            href="/staff/applications?status=FIELD_VISIT_REQUIRED"
          />
        )}
        {p("application.view_all") && (
          <Stat
            label="Cases awaiting approval"
            value={m.awaitingApproval}
            href="/staff/applications?status=PENDING_APPROVAL"
          />
        )}
        {p("application.view_all") && (
          <Stat
            label="Overdue case follow-ups (14+ days)"
            value={m.overdueFollowUps}
            href="/staff/applications?status=OPEN"
          />
        )}
        {(p("campaign.manage") || p("intervention.manage")) && (
          <Stat label="Live campaigns" value={m.published} href="/staff/campaigns" />
        )}
        {(p("campaign.manage") || p("intervention.manage")) && (
          <Stat
            label="Active interventions"
            value={m.activeInterventions}
            href="/staff/campaigns?status=INTERVENTION_IN_PROGRESS"
          />
        )}
        {p("finance.view") && (
          <Stat
            label="Contributions awaiting reconciliation"
            value={m.unreconciled}
            href="/staff/finance/payments?reconciliation=UNRECONCILED"
          />
        )}
        {p("finance.view") && (
          <Stat label="Refunds in progress" value={m.pendingRefunds} href="/staff/finance/refunds" />
        )}
        {p("finance.view") && (
          <Stat
            label="Disbursements awaiting approval"
            value={m.disbursementsAwaiting}
            href="/staff/finance/disbursements"
          />
        )}
        {p("sponsor.review") && (
          <Stat label="Open sponsor enquiries" value={m.sponsorEnquiries} href="/staff/sponsors" />
        )}
        {p("complaint.manage") && (
          <Stat label="Unresolved complaints" value={m.complaints} href="/staff/complaints" />
        )}
        {p("risk.review") && <Stat label="Open risk alerts" value={m.openAlerts} href="/staff/risk" />}
        {p("investigation.record") && !p("application.view_all") && (
          <Stat label="My investigations" value="Open" href="/staff/investigations" />
        )}
        {p("media.manage") && <Stat label="Media workspace" value="Open" href="/staff/media" />}
      </div>
    </div>
  );
}
