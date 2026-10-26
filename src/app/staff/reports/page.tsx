import { formatMoney } from "@/lib/money";
import { Card, PageHeader, Section, Stat } from "@/components/ui";
import { requirePagePermission } from "@/server/current-user";
import { internalReport, operationsDashboard, publicImpact } from "@/server/services/reports";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const actor = await requirePagePermission("reports.internal");
  const [r, ops, pub] = await Promise.all([internalReport(actor), operationsDashboard(actor), publicImpact()]);
  return (
    <div>
      <PageHeader title="Reports" description="All metrics are calculated from current records. Where an outcome cannot yet be measured, it is shown as such." />
      <Section title="Internal">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Stat label="Median days from submission to decision" value={r.medianDaysToDecision === null ? "Not yet measurable" : r.medianDaysToDecision.toFixed(1)} />
          <Stat label="Approved / declined decisions" value={`${r.decisions.APPROVED ?? 0} / ${r.decisions.DECLINED ?? 0}`} />
          <Stat label="Field visits completed" value={r.fieldVisitsCompleted} hint={`Recorded cost ${formatMoney(r.fieldVisitCostMinor)}`} />
          <Stat label="Approved cases that became campaigns" value={r.campaignConversionRate === null ? "Not yet measurable" : `${r.campaignConversionRate}%`} />
          <Stat label="Open verification tasks" value={ops.verifying} />
          <Stat label="Active interventions" value={ops.activeInterventions} />
          <Stat label="Contributions awaiting reconciliation" value={ops.unreconciled} />
          <Stat label="Unresolved complaints" value={ops.complaints} />
          <Stat label="Open risk alerts" value={ops.openAlerts} />
        </div>
      </Section>
      <Section title="Public impact figures (as published)">
        <Card>
          <ul className="list-disc pl-5">
            <li>Cases approved after verification: {pub.casesApproved}</li>
            <li>Interventions completed after independent review: {pub.interventionsCompleted}</li>
            <li>Completion rate of closed interventions: {pub.completionRate === null ? "not yet measurable" : `${pub.completionRate}%`}</li>
            <li>Spent on approved interventions: {formatMoney(pub.fundingDeliveredMinor)}</li>
            <li>In-kind deliveries: {pub.inKindDeliveries}</li>
          </ul>
          <p className="mt-2 text-sm text-muted">Definitions are documented in docs/reporting.md. Pledges are never counted as received; funded cases are never counted as completed.</p>
        </Card>
      </Section>
    </div>
  );
}
