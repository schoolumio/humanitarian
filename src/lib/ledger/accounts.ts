import type { AccountType } from "@prisma/client";

/**
 * Chart of accounts (fund accounting). Accounts marked `restricted` carry a campaign
 * (fund) dimension on every line; the balance of a campaign's restricted fund is
 *   Σ restricted revenue − Σ restricted expenses/contra-revenue for that campaign.
 *
 * Restricted beneficiary funding is never posted to platform revenue (4100).
 * In-kind contributions are tracked in InKindContribution and are NOT posted to this
 * cash ledger.
 */
export const ACCOUNTS = {
  CASH: { code: "1000", name: "Cash held with payment provider and bank", type: "ASSET", restricted: false },
  REFUNDS_PAYABLE: {
    code: "2000",
    name: "Refunds payable to contributors",
    type: "LIABILITY",
    restricted: false,
  },
  SUPPLIERS_PAYABLE: {
    code: "2100",
    name: "Amounts payable to suppliers",
    type: "LIABILITY",
    restricted: false,
  },
  RESTRICTED_DONATIONS: { code: "4000", name: "Restricted donations", type: "REVENUE", restricted: true },
  RESTRICTED_SPONSORSHIP: {
    code: "4010",
    name: "Restricted sponsor funding",
    type: "REVENUE",
    restricted: true,
  },
  PLATFORM_FEE_REVENUE: {
    code: "4100",
    name: "Platform fee revenue (unrestricted)",
    type: "REVENUE",
    restricted: false,
  },
  CONTRIBUTION_REFUNDS: {
    code: "4900",
    name: "Refunds and chargebacks (contra revenue)",
    type: "EXPENSE",
    restricted: true,
  },
  FUND_PROCESSING_FEES: {
    code: "5000",
    name: "Payment processing fees charged to fund",
    type: "EXPENSE",
    restricted: true,
  },
  PLATFORM_PROCESSING_FEES: {
    code: "5010",
    name: "Payment processing fees absorbed by platform",
    type: "EXPENSE",
    restricted: false,
  },
  INTERVENTION_EXPENDITURE: {
    code: "5100",
    name: "Intervention expenditure",
    type: "EXPENSE",
    restricted: true,
  },
  PLATFORM_FEE_CHARGED: {
    code: "5300",
    name: "Disclosed platform fee charged to fund",
    type: "EXPENSE",
    restricted: true,
  },
} as const satisfies Record<string, { code: string; name: string; type: AccountType; restricted: boolean }>;

export type AccountKey = keyof typeof ACCOUNTS;
export const ACCOUNT_BY_CODE = Object.fromEntries(Object.values(ACCOUNTS).map((a) => [a.code, a]));

export const FUND_REVENUE_CODES: readonly string[] = [
  ACCOUNTS.RESTRICTED_DONATIONS.code,
  ACCOUNTS.RESTRICTED_SPONSORSHIP.code,
];
export const FUND_EXPENSE_CODES: readonly string[] = [
  ACCOUNTS.CONTRIBUTION_REFUNDS.code,
  ACCOUNTS.FUND_PROCESSING_FEES.code,
  ACCOUNTS.INTERVENTION_EXPENDITURE.code,
  ACCOUNTS.PLATFORM_FEE_CHARGED.code,
];
