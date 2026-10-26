# Metric definitions

All metrics are computed from current records at request time (`src/server/services/reports.ts`).
No figure is estimated or stored independently. Where data is insufficient, the UI says
"Not yet measurable".

| Metric                     | Definition                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Confirmed contributions    | Sum of `payments.amountMinor` (kind DONATION) with provider-verified status SUCCEEDED, REFUND_PENDING, PARTIALLY_REFUNDED, REFUNDED or DISPUTED. Gross of refunds. Pledges excluded. |
| Confirmed sponsor funding  | Same, kind SPONSOR_PAYMENT (online or offline receipts confirmed by a second finance officer).                                                                                       |
| Refunds                    | Sum of `payments.refundedMinor` (processed refunds + lost chargebacks).                                                                                                              |
| Fees                       | Sum of provider fees on confirmed payments.                                                                                                                                          |
| Campaign funding progress  | `(confirmed − refunded) / target`, capped at 100% for display; excess shown separately.                                                                                              |
| Recorded expenditure       | Ledger account 5100 (approved disbursements).                                                                                                                                        |
| Cash disbursed             | Disbursements with status PAID.                                                                                                                                                      |
| Restricted funds remaining | Σ restricted revenue − Σ refunds, fund-charged fees, platform fee, expenditure (ledger).                                                                                             |
| Unreconciled               | Confirmed payments whose reconciliation is not MATCHED.                                                                                                                              |
| Cases approved (public)    | Distinct applications with at least one APPROVED decision.                                                                                                                           |
| Interventions completed    | Interventions with status COMPLETED (after independent outcome review). A fully funded case is **not** counted.                                                                      |
| Completion rate            | Completed ÷ (completed + unsuccessful) interventions; "not yet measurable" if none closed.                                                                                           |
| Funds delivered (public)   | Net ledger 5100 (approved intervention expenditure).                                                                                                                                 |
| In-kind delivered          | In-kind contributions DELIVERED/PARTIALLY_DELIVERED (count); estimated value shown separately, never added to cash.                                                                  |
| Geographic distribution    | Public campaigns (completed or in delivery) grouped by the state in their general location label.                                                                                    |
| Median days to decision    | Median of (decidedAt − submittedAt) over decided applications.                                                                                                                       |
| Campaign conversion        | Campaigns ever published ÷ approved applications.                                                                                                                                    |
| Field visit cost           | Sum of actual costs of completed field visits.                                                                                                                                       |
