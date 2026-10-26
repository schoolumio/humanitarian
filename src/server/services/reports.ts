import { db } from "@/lib/db";
import { ACCOUNTS } from "@/lib/ledger/accounts";
import { trialBalance } from "@/lib/ledger/journal";
import { OPEN_REVIEW_STATUSES } from "@/lib/workflow/application";
import { requireAnyPermission, requirePermission, type Actor } from "../actor";

/**
 * Metric definitions (all computed from underlying records, never stored or estimated):
 *  - Confirmed contributions: sum of amountMinor of payments whose provider-verified status is
 *    SUCCEEDED or later (REFUND_PENDING, PARTIALLY_REFUNDED, REFUNDED, DISPUTED). Pledges excluded.
 *  - Refunds: processed refunds + lost chargebacks (payment.refundedMinor).
 *  - Fees: provider fees recorded on verified payments.
 *  - Cash disbursed: disbursements in PAID status.
 *  - Recorded expenditure: ledger account 5100 (approved disbursements).
 *  - Interventions completed: interventions with status COMPLETED after independent outcome review.
 *    A fully funded campaign is NOT counted as completed.
 *  - In-kind delivered: in-kind contributions with status DELIVERED/PARTIALLY_DELIVERED (estimated
 *    value shown separately and never added to cash).
 */
const CONFIRMED = ["SUCCEEDED", "REFUND_PENDING", "PARTIALLY_REFUNDED", "REFUNDED", "DISPUTED"] as const;

export async function publicImpact() {
  const [approved, completed, interventions, funding, inKind, categories, locations] = await Promise.all([
    db.caseDecision.groupBy({ by: ["applicationId"], where: { decision: "APPROVED" } }).then((r) => r.length),
    db.intervention.count({ where: { status: "COMPLETED" } }),
    db.intervention.count({ where: { status: { in: ["COMPLETED", "UNSUCCESSFUL"] } } }),
    db.journalLine.aggregate({
      where: { accountCode: ACCOUNTS.INTERVENTION_EXPENDITURE.code },
      _sum: { debitMinor: true, creditMinor: true },
    }),
    db.inKindContribution.aggregate({
      where: { status: { in: ["DELIVERED", "PARTIALLY_DELIVERED"] } },
      _count: true,
    }),
    db.campaign.groupBy({
      by: ["categoryId"],
      where: { status: "COMPLETED", visibility: "PUBLIC" },
      _count: true,
    }),
    db.campaign.findMany({
      where: { status: { in: ["COMPLETED", "INTERVENTION_IN_PROGRESS"] }, visibility: "PUBLIC" },
      select: { locationLabel: true },
    }),
  ]);
  const cats = await db.caseCategory.findMany({
    where: { id: { in: categories.map((c) => c.categoryId) } },
    select: { id: true, name: true },
  });
  const states = new Map<string, number>();
  for (const l of locations) {
    const s = l.locationLabel.split(",").pop()!.trim();
    states.set(s, (states.get(s) ?? 0) + 1);
  }
  return {
    casesApproved: approved,
    interventionsCompleted: completed,
    completionRate: interventions ? Math.round((completed / interventions) * 100) : null,
    fundingDeliveredMinor: (funding._sum.debitMinor ?? 0n) - (funding._sum.creditMinor ?? 0n),
    inKindDeliveries: inKind._count,
    byCategory: categories.map((c) => ({
      name: cats.find((x) => x.id === c.categoryId)?.name ?? "Other",
      count: c._count,
    })),
    byState: [...states.entries()]
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export async function financialSummary(actor: Actor) {
  requirePermission(actor, "finance.reports");
  const [confirmed, sponsor, refunds, fees, disbursedPaid, unreconciled, pendingRefunds, inKind, balances] =
    await Promise.all([
      db.payment.aggregate({
        where: { status: { in: [...CONFIRMED] }, kind: "DONATION" },
        _sum: { amountMinor: true },
        _count: true,
      }),
      db.payment.aggregate({
        where: { status: { in: [...CONFIRMED] }, kind: "SPONSOR_PAYMENT" },
        _sum: { amountMinor: true },
      }),
      db.payment.aggregate({ _sum: { refundedMinor: true } }),
      db.payment.aggregate({ where: { status: { in: [...CONFIRMED] } }, _sum: { feeMinor: true } }),
      db.disbursement.aggregate({ where: { status: "PAID" }, _sum: { amountMinor: true } }),
      db.payment.count({ where: { reconciliation: { not: "MATCHED" }, status: { in: [...CONFIRMED] } } }),
      db.refund.count({ where: { status: { in: ["REQUESTED", "APPROVED", "PENDING_PROVIDER"] } } }),
      db.inKindContribution.aggregate({
        where: { status: { in: ["DELIVERED", "PARTIALLY_DELIVERED"] } },
        _sum: { estimatedValueMinor: true },
        _count: true,
      }),
      trialBalance(db),
    ]);
  const bal = (code: string) => balances.find((b) => b.code === code)?.balance ?? 0n;
  const fundRevenue = bal(ACCOUNTS.RESTRICTED_DONATIONS.code) + bal(ACCOUNTS.RESTRICTED_SPONSORSHIP.code);
  const fundExpense =
    bal(ACCOUNTS.CONTRIBUTION_REFUNDS.code) +
    bal(ACCOUNTS.FUND_PROCESSING_FEES.code) +
    bal(ACCOUNTS.INTERVENTION_EXPENDITURE.code) +
    bal(ACCOUNTS.PLATFORM_FEE_CHARGED.code);
  return {
    totalConfirmedDonationsMinor: confirmed._sum.amountMinor ?? 0n,
    donationCount: confirmed._count,
    totalSponsorFundingMinor: sponsor._sum.amountMinor ?? 0n,
    totalRefundsMinor: refunds._sum.refundedMinor ?? 0n,
    totalFeesMinor: fees._sum.feeMinor ?? 0n,
    totalCashDisbursedMinor: disbursedPaid._sum.amountMinor ?? 0n,
    totalRecordedExpenditureMinor: bal(ACCOUNTS.INTERVENTION_EXPENDITURE.code),
    restrictedFundsRemainingMinor: fundRevenue - fundExpense,
    cashBalanceMinor: bal(ACCOUNTS.CASH.code),
    platformRevenueMinor: bal(ACCOUNTS.PLATFORM_FEE_REVENUE.code),
    unreconciledCount: unreconciled,
    pendingRefunds,
    inKindDeliveredCount: inKind._count,
    inKindEstimatedValueMinor: inKind._sum.estimatedValueMinor ?? 0n,
    trialBalance: balances,
  };
}

/** Per-campaign fund statement for finance. */
export async function fundStatements(actor: Actor) {
  requirePermission(actor, "finance.reports");
  const lines = await db.journalLine.groupBy({
    by: ["campaignId", "accountCode"],
    where: { campaignId: { not: null } },
    _sum: { debitMinor: true, creditMinor: true },
  });
  const campaigns = await db.campaign.findMany({
    select: { id: true, publicId: true, title: true, status: true, targetAmountMinor: true },
  });
  return campaigns
    .map((c) => {
      const get = (code: string) => {
        const r = lines.find((l) => l.campaignId === c.id && l.accountCode === code);
        return { d: r?._sum.debitMinor ?? 0n, c: r?._sum.creditMinor ?? 0n };
      };
      const received = get("4000").c - get("4000").d + get("4010").c - get("4010").d;
      const refunds = get("4900").d - get("4900").c;
      const fees = get("5000").d - get("5000").c + get("5300").d - get("5300").c;
      const spent = get("5100").d - get("5100").c;
      return { ...c, received, refunds, fees, spent, remaining: received - refunds - fees - spent };
    })
    .filter((r) => r.received > 0n || r.spent > 0n);
}

/** Operations dashboard counts (live). */
export async function operationsDashboard(actor: Actor) {
  requireAnyPermission(actor, ["staff.dashboard"]);
  const overdue = new Date(Date.now() - 14 * 864e5);
  const [
    awaitingReview,
    awaitingInfo,
    verifying,
    fieldVisitsUnassigned,
    awaitingApproval,
    published,
    activeInterventions,
    unreconciled,
    pendingRefunds,
    sponsorEnquiries,
    overdueFollowUps,
    complaints,
    openAlerts,
    disbursementsAwaiting,
  ] = await Promise.all([
    db.application.count({ where: { status: { in: ["SUBMITTED", "INITIAL_REVIEW"] } } }),
    db.application.count({ where: { status: "ADDITIONAL_INFORMATION_REQUIRED" } }),
    db.verificationTask.count({
      where: {
        status: "OPEN",
        application: { status: { in: ["VERIFICATION_IN_PROGRESS", "FIELD_VISIT_REQUIRED"] } },
      },
    }),
    db.fieldVisit.count({ where: { status: "REQUESTED", investigatorId: null } }),
    db.application.count({ where: { status: "PENDING_APPROVAL" } }),
    db.campaign.count({
      where: { status: { in: ["PUBLISHED", "FUNDING_IN_PROGRESS", "FULLY_FUNDED", "PARTIALLY_FUNDED"] } },
    }),
    db.intervention.count({
      where: {
        status: { in: ["PLANNING", "IN_PROGRESS", "PARTIALLY_DELIVERED", "DELIVERED", "OUTCOME_REVIEW"] },
      },
    }),
    db.payment.count({ where: { reconciliation: { not: "MATCHED" }, status: { in: [...CONFIRMED] } } }),
    db.refund.count({ where: { status: { in: ["REQUESTED", "APPROVED", "PENDING_PROVIDER"] } } }),
    db.sponsorshipProposal.count({ where: { status: { in: ["SUBMITTED", "IN_DISCUSSION"] } } }),
    db.application.count({
      where: { status: { in: [...OPEN_REVIEW_STATUSES] }, updatedAt: { lt: overdue } },
    }),
    db.complaint.count({
      where: {
        status: { in: ["RECEIVED", "INVESTIGATING"] },
        ...(actor.permissions.has("safeguarding.manage") ? {} : { isSafeguarding: false }),
      },
    }),
    db.riskAlert.count({ where: { status: "OPEN" } }),
    db.disbursement.count({ where: { status: "REQUESTED" } }),
  ]);
  return {
    awaitingReview,
    awaitingInfo,
    verifying,
    fieldVisitsUnassigned,
    awaitingApproval,
    published,
    activeInterventions,
    unreconciled,
    pendingRefunds,
    sponsorEnquiries,
    overdueFollowUps,
    complaints,
    openAlerts,
    disbursementsAwaiting,
  };
}

/** Internal operational report. */
export async function internalReport(actor: Actor) {
  requirePermission(actor, "reports.internal");
  const decided = await db.application.findMany({
    where: { decidedAt: { not: null }, submittedAt: { not: null } },
    select: { submittedAt: true, decidedAt: true, status: true },
  });
  const days = decided
    .map((d) => (d.decidedAt!.getTime() - d.submittedAt!.getTime()) / 864e5)
    .sort((a, b) => a - b);
  const median = days.length ? days[Math.floor(days.length / 2)]! : null;
  const [decisions, visits, approvedCount, campaigns] = await Promise.all([
    db.caseDecision.groupBy({ by: ["decision"], _count: true }),
    db.fieldVisit.aggregate({
      where: { status: "COMPLETED" },
      _sum: { actualCostMinor: true },
      _count: true,
    }),
    db.application.count({ where: { status: { in: ["APPROVED", "CLOSED"] }, decidedAt: { not: null } } }),
    db.campaign.count({ where: { publishedAt: { not: null } } }),
  ]);
  return {
    medianDaysToDecision: median,
    decisions: Object.fromEntries(decisions.map((d) => [d.decision, d._count])) as Record<string, number>,
    fieldVisitsCompleted: visits._count,
    fieldVisitCostMinor: visits._sum.actualCostMinor ?? 0n,
    campaignConversionRate: approvedCount ? Math.round((campaigns / approvedCount) * 100) : null,
  };
}
