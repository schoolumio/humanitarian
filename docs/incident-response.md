# Incident response checklist

## Severity

- **SEV1:** data breach of applicant/beneficiary data; unauthorised financial movement; someone at
  immediate risk of harm; platform compromise.
- **SEV2:** payment processing failure; webhook outage; publication of content without consent.
- **SEV3:** degraded service, isolated errors.

## Immediate safety concerns (any severity)

1. If someone is in immediate danger: advise them to call **112**; staff contact appropriate
   emergency services where lawful and safe.
2. Safeguarding officer opens a safeguarding record (restrict publication), documents actions.
3. Notify the safeguarding lead the same working day; serious incidents need documented resolution.

## First hour (security / data incidents)

- [ ] Assign an incident lead and a scribe; open an incident log (time-stamped).
- [ ] Contain: suspend affected accounts (Staff → Users), revoke sessions (role change/suspension
      signs users out), rotate exposed secrets (`AUTH_SECRET`, provider keys, storage keys).
- [ ] Preserve evidence: export relevant audit logs (Staff → Audit log), provider logs, hosting logs.
      Do not delete records.
- [ ] If payments may be affected: disable donations by setting campaigns' funding closed or remove
      the Paystack webhook temporarily; reconcile afterwards.
- [ ] If content was published without consent: withdraw the story/media (Staff → Media), request
      removal from external platforms, record actions.

## Within 72 hours

- [ ] Assess whether a personal-data breach must be notified to the Nigeria Data Protection
      Commission (NDPA requires notification within 72 hours where it is likely to result in a risk to
      rights and freedoms) and to affected people. Confirm obligations with the DPO/legal adviser.
- [ ] Notify payment provider / partners as contracts require.

## Payment-specific

- Webhook failures: check `payment_events` with outcome ERROR, fix, then let the provider retry or use
  "Check with provider". Processing is idempotent.
- Suspected fraud/chargebacks: review risk alerts; respond to disputes in the Paystack dashboard.
- Mis-postings: never edit ledger rows; post a reversal (finance + second approver).

## Afterwards

- [ ] Root-cause analysis, actions with owners, update this checklist and tests.
