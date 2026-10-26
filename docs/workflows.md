# Workflows and state machines

All transitions are explicit tables in `src/lib/workflow/*` and every material change writes a
`status_history` row (entity, from, to, actor, timestamp, reason) plus an `audit_logs` row.
Updates use optimistic concurrency (`UPDATE … WHERE status = <expected>`), so concurrent edits fail
safely.

## Application (case)

`DRAFT → SUBMITTED → INITIAL_REVIEW → (ADDITIONAL_INFORMATION_REQUIRED ↔) VERIFICATION_IN_PROGRESS
→ (FIELD_VISIT_REQUIRED ↔) → PENDING_APPROVAL → APPROVED | DECLINED`, plus `WITHDRAWN` (applicant,
before a decision) and `CLOSED` (duplicate, no response, or support completed). Declined cases can be
reopened with a recorded justification; approved cases can return to verification only before a
campaign goes live.

Verification stages: 1 screening, 2 remote, 3 field (only when justified, with estimated/actual
costs), 4 independent review, 5 final decision. Checklists = standard items + category items.
Risk indicators (duplicates, urgent safety concerns) create alerts for human review – they never
decline anything. No automated or AI eligibility decisions.

## Campaign

`DRAFT → READY_FOR_PUBLICATION → PUBLISHED → FUNDING_IN_PROGRESS → FULLY_FUNDED | PARTIALLY_FUNDED →
INTERVENTION_IN_PROGRESS → OUTCOME_REVIEW → COMPLETED`, and `CANCELLED`. Funding transitions are
driven only by verified payments (SYSTEM). Completion only via an independent outcome review.

## Payment

`CREATED → PENDING → SUCCEEDED | FAILED`; `SUCCEEDED → REFUND_PENDING → PARTIALLY_REFUNDED | REFUNDED`;
`DISPUTED` (won → back, lost → refunded). `FAILED → SUCCEEDED` is allowed for late provider
confirmations. Backwards/out-of-order events are ignored and recorded.

## Intervention

`PLANNING → IN_PROGRESS → (PARTIALLY_DELIVERED ↔) DELIVERED → OUTCOME_REVIEW → COMPLETED`, plus
`UNSUCCESSFUL` and `CANCELLED` (which raise an unspent-funds review for finance).

## Sponsorship

Proposal/enquiry → offer (agreement `DRAFT`) → `APPROVED` (second staff member) → `SIGNED`
(authorised representative) → pledge recorded (not money) → confirmed payments → `FULFILLED`.

## Media and stories

Story: `DRAFT → IN_REVIEW → APPROVED → PUBLISHED`, `UNDER_CONSENT_REVIEW`, `WITHDRAWN`. Media:
`UPLOADED → APPROVED | REJECTED`, `TAKEN_DOWN`. Public copies of media exist only while a published
campaign-page story uses them.
