import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { paymentModeLabel } from "@/lib/payments";
import { env } from "@/lib/env";
import { Alert, DataTable, PageHeader, Section, Stat } from "@/components/ui";
import { requirePagePermission } from "@/server/current-user";
import { financialSummary, fundStatements } from "@/server/services/reports";

export const metadata = { title: "Finance" };

export default async function FinancePage() {
  const actor = await requirePagePermission("finance.view");
  const canReports = actor.permissions.has("finance.reports");
  const [s, funds] = canReports ? await Promise.all([financialSummary(actor), fundStatements(actor)]) : [null, []];
  return (
    <div>
      <PageHeader title="Finance" description={`Payment mode: ${paymentModeLabel()} · Processing fees: ${env().PROCESSING_FEE_POLICY === "CHARGED_TO_FUND" ? "charged to fund" : "absorbed by platform"} · Platform fee: ${env().PLATFORM_FEE_BPS / 100}%`} />
      <nav className="mb-6 flex flex-wrap gap-3" aria-label="Finance sections">
        <Link href="/staff/finance/payments">Payments &amp; reconciliation</Link>
        <Link href="/staff/finance/refunds">Refunds</Link>
        <Link href="/staff/finance/disbursements">Disbursements</Link>
        <Link href="/staff/finance/ledger">Ledger</Link>
      </nav>
      {s && (
        <>
          <Alert tone="info">Figures come from verified payments and the double-entry ledger. Pledges are excluded. In-kind values are estimates and are never added to cash.</Alert>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Confirmed donations" value={formatMoney(s.totalConfirmedDonationsMinor)} hint={`${s.donationCount} payments`} />
            <Stat label="Confirmed sponsor funding" value={formatMoney(s.totalSponsorFundingMinor)} />
            <Stat label="Refunds and chargebacks" value={formatMoney(s.totalRefundsMinor)} />
            <Stat label="Processing fees" value={formatMoney(s.totalFeesMinor)} />
            <Stat label="Recorded expenditure (approved)" value={formatMoney(s.totalRecordedExpenditureMinor)} />
            <Stat label="Cash disbursed (paid)" value={formatMoney(s.totalCashDisbursedMinor)} />
            <Stat label="Restricted funds remaining" value={formatMoney(s.restrictedFundsRemainingMinor)} />
            <Stat label="Cash held (provider + bank)" value={formatMoney(s.cashBalanceMinor)} />
            <Stat label="Unreconciled confirmed payments" value={s.unreconciledCount} href="/staff/finance/payments?reconciliation=UNRECONCILED" />
            <Stat label="Refunds in progress" value={s.pendingRefunds} href="/staff/finance/refunds" />
            <Stat label="Platform revenue (unrestricted)" value={formatMoney(s.platformRevenueMinor)} />
            <Stat label="In-kind delivered (estimated, not cash)" value={formatMoney(s.inKindEstimatedValueMinor)} hint={`${s.inKindDeliveredCount} deliveries`} />
          </div>
          <Section title="Restricted fund statements">
            {funds.length ? <DataTable caption="Funds by campaign" rows={funds} rowKey={(r) => r.id} columns={[
              { header: "Campaign", cell: (r) => <Link href={`/staff/campaigns/${r.id}`}>{r.title}</Link> },
              { header: "Received", cell: (r) => formatMoney(r.received) },
              { header: "Refunds", cell: (r) => formatMoney(r.refunds) },
              { header: "Fees", cell: (r) => formatMoney(r.fees) },
              { header: "Spent", cell: (r) => formatMoney(r.spent) },
              { header: "Remaining", cell: (r) => <strong>{formatMoney(r.remaining)}</strong> },
            ]} /> : <p className="text-muted">No funds received yet.</p>}
          </Section>
        </>
      )}
    </div>
  );
}
