# Payments, funds and the ledger

> Real-money collection is **disabled** until the operating model, provider approval and the
> launch checklist are signed off. A live Paystack key (`sk_live_…`) is rejected at start-up unless
> `PAYMENTS_LIVE_MODE_APPROVED=true`.

## Legal and operating-model boundary

KindSpring does not implement escrow or assume it may hold or pool public donations. Before launch,
qualified advisers must confirm the legal structure, fundraising model, who holds funds (KindSpring,
a partner charity, or the provider's split/sub-account features), Nigerian regulatory and tax
obligations, and disbursement procedures. The ledger and provider abstraction are designed so the
approved model can be configured (fee policy, accounts, provider) without rewriting the core.

## Units

- All amounts are `BigInt` in the currency's minor unit with an ISO-4217 currency column.
- NGN: `₦1 = 100 kobo`. Paystack also uses kobo. Example: ₦25,000 = `2_500_000n`.
- User input is parsed with `parseMajorToMinor` (no floats, max 2 decimals). Display uses
  `formatMoney`. Allocation uses largest-remainder rounding so parts always sum to the total.

## Concepts kept separate

| Concept                       | Where                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Pledged (sponsor)             | `sponsorship_agreements.pledgedAmountMinor` – never counted as received         |
| Paid / confirmed received     | `payments` in SUCCEEDED or later states, only after provider verification       |
| Processing fees               | `payments.feeMinor`; ledger 5000 (charged to fund) or 5010 (absorbed)           |
| Refunds & chargebacks         | `refunds`, `chargebacks`, `payments.refundedMinor`; ledger 4900                 |
| Available for intervention    | restricted fund balance (ledger, per campaign)                                  |
| Disbursed / paid to suppliers | `disbursements` PAID; ledger 2100 → 1000                                        |
| Spent (recorded expenditure)  | ledger 5100 (on disbursement approval)                                          |
| Remaining                     | fund balance = restricted revenue − refunds − fees − platform fee − expenditure |
| Platform revenue              | ledger 4100, only from a disclosed `PLATFORM_FEE_BPS` (default 0)               |
| In-kind                       | `in_kind_contributions` – never in the cash ledger; estimates shown separately  |

## Chart of accounts

`1000` Cash (provider + bank) · `2000` Refunds payable · `2100` Suppliers payable · `4000`
Restricted donations* · `4010` Restricted sponsor funding* · `4100` Platform fee revenue · `4900`
Refunds & chargebacks (contra)* · `5000` Processing fees charged to fund* · `5010` Processing fees
absorbed · `5100` Intervention expenditure* · `5300` Disclosed platform fee charged to fund*
(*restricted: every line carries the campaign/fund).

## Postings

| Event                     | Journal                          |
| ------------------------- | -------------------------------- |
| Payment verified          | Dr 1000 / Cr 4000 or 4010 (fund) |
| Provider fee              | Dr 5000 (fund) or 5010 / Cr 1000 |
| Platform fee (if enabled) | Dr 5300 (fund) / Cr 4100         |
| Refund approved           | Dr 4900 (fund) / Cr 2000         |
| Refund processed          | Dr 2000 / Cr 1000                |
| Refund failed             | reversal of the approval entry   |
| Chargeback lost           | Dr 4900 (fund) / Cr 1000         |
| Disbursement approved     | Dr 5100 (fund) / Cr 2100         |
| Disbursement paid         | Dr 2100 / Cr 1000                |

Journals are idempotent (`idempotencyKey`), append-only (DB trigger) and must balance (deferred DB
constraint trigger, plus code validation). Corrections are reversing entries.

## Contribution flow

1. Server validates campaign state and amount (min ₦100, max ₦5m per online payment, never more than
   the remaining need), creates `Payment(CREATED)` with a random reference. Idempotent per client key.
2. Provider `initialize` → hosted checkout URL → `PENDING`. A reconciliation job is scheduled.
3. Provider webhook → signature verified over the raw body → event stored with a unique dedupe key →
   **the transaction is re-verified with the provider API** → amount and currency compared with our
   record → row-locked state transition → ledger postings → campaign totals updated in the same
   transaction → receipt email queued.
4. The return page shows only what the database says; if still pending it asks the provider.
5. Duplicate, delayed and out-of-order events are no-ops (dedupe key, state machine, row lock,
   journal idempotency). Mismatches are rejected and raise an alert.
6. Reconciliation (`/staff/finance/payments` and the cron sweep) repairs missed webhooks and flags
   mismatches.

## Overfunding, cancellation and unspent funds

- Checkout refuses amounts above the remaining need; concurrent checkouts can still overfund.
- When confirmed funding exceeds the target an `OVERFUNDED_CAMPAIGN` alert is raised. Finance applies
  the published policy (refund the excess to the most recent contributors unless they consent to
  another use). Nothing is moved automatically.
- Cancelling a campaign, an unsuccessful intervention, or a completed intervention with money left
  raises an alert for an authorised review. Pro-rata refunds use `allocateProportionally` and are
  executed as individual refunds (each with maker–checker approval).

## Refunds

Requested by one finance officer, approved by another (step-up MFA), submitted to the provider by a
background job, completed by the provider's result/webhook. Repeated refunds for one email raise an
alert. Offline (bank transfer) receipts are refunded manually by finance.

## Paystack configuration

- Keys: `PAYSTACK_SECRET_KEY` (server only). Start with `sk_test_…`.
- Webhook URL: `https://<domain>/api/webhooks/paystack`. Paystack signs with the secret key
  (`x-paystack-signature` = HMAC-SHA512 of the raw body). Paystack also publishes source IPs that can
  be allow-listed at the edge as defence in depth.
- Callback URL is set per transaction (`/give/return?reference=…`).
- **Must verify before live use:** the exact payload shapes for `refund.*` and `charge.dispute.*`
  events against Paystack's current documentation (the parser in `src/lib/payments/paystack.ts` is
  defensive and stores unknown shapes without acting on them), settlement timing, and whether a
  subaccount/split model is required by the approved operating model.
- Recurring contributions are **not** implemented and must not be advertised until verified.

## Sandbox

`PAYMENT_PROVIDER=sandbox`: `/sandbox/checkout/<ref>` simulates checkout; webhooks are signed with
`SANDBOX_WEBHOOK_SECRET` and delivered to `/api/webhooks/sandbox`. Fee: illustrative 1.5%.
