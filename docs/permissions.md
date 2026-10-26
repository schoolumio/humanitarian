# Roles, permissions and separation of duties

Source of truth: `src/lib/permissions.ts` (tested in `tests/unit/permissions.test.ts`).
Users may hold several roles. Self-registration grants only `APPLICANT`, `DONOR` or `SPONSOR`.

| Permission                                                   | APP | DON | SPO | INV |  CM  | FIN  | MED | SAFE |         ADM          | SUP |
| ------------------------------------------------------------ | :-: | :-: | :-: | :-: | :--: | :--: | :-: | :--: | :------------------: | :-: |
| Own applications                                             |  ✓  |     |     |     |      |      |     |      |                      |     |
| Own contributions                                            |     |  ✓  |  ✓  |     |      |      |     |      |                      |     |
| Sponsor portal (approved orgs)                               |     |     |  ✓  |     |      |      |     |      |                      |     |
| View all cases                                               |     |     |     |     |  ✓   |      |     |  ✓   |                      |     |
| View assigned cases only                                     |     |     |     |  ✓  |      |      |     |      |                      |     |
| Triage / move cases                                          |     |     |     |     |  ✓   |      |     |      |                      |     |
| Record verification (assigned)                               |     |     |     |  ✓  |  ✓   |      |     |      |                      |     |
| Restricted investigation notes                               |     |     |     |     |  ✓   |      |     |  ✓   |                      |     |
| Independent review / final decision                          |     |     |     |     |  ✓   |      |     |      |                      |     |
| Campaign manage / publish                                    |     |     |     |     |  ✓   |      |     |      |                      |     |
| Sponsor review                                               |     |     |     |     |  ✓   |      |     |      |          ✓           |     |
| Prepare / approve agreements                                 |     |     |     |     | prep | appr |     |      |         appr         |     |
| Interventions, outcome review                                |     |     |     |     |  ✓   |      |     |      |                      |     |
| Approve budget changes                                       |     |     |     |     |      |  ✓   |     |      |                      |     |
| Finance view, reconcile, reports                             |     |     |     |     |      |  ✓   |     |      |                      |     |
| Request disbursement                                         |     |     |     |     |  ✓   |  ✓   |     |      |                      |     |
| Approve refunds / disbursements / offline receipts           |     |     |     |     |      |  ✓   |     |      |                      |     |
| Media manage / approve                                       |     |     |     |     |      |      |  ✓  |      |                      |     |
| Complaints                                                   |     |     |     |     |      |      |     |  ✓   | ✓ (non-safeguarding) |     |
| Safeguarding                                                 |     |     |     |     |      |      |     |  ✓   |                      |     |
| Risk alerts                                                  |     |     |     |     |  ✓   |  ✓   |     |  ✓   |          ✓           |     |
| Users & roles                                                |     |     |     |     |      |      |     |      |          ✓           |  ✓  |
| Privileged roles (ADMIN, SUPER_ADMIN, FINANCE, SAFEGUARDING) |     |     |     |     |      |      |     |      |                      |  ✓  |
| Audit log, access review                                     |     |     |     |     |      |      |     |      |          ✓           |  ✓  |

**Administrators cannot approve financial actions or read safeguarding records.**

## Step-up (two-step verification)

These permissions require a TOTP verification on the current session within the last 12 hours:
user/role administration, refund and disbursement approval, offline receipt confirmation, agreement
approval, safeguarding management. In production, staff MFA is mandatory for them
(`STAFF_MFA_REQUIRED` defaults to `true` when `NODE_ENV=production`).

## Separation of duties (enforced in services; † also by database CHECK constraint)

- Nobody can work on or decide an application they submitted.
- The investigator who wrote a report cannot be the independent reviewer or the decision maker.
- Approval requires an approving review by someone other than the decider.
- Investigators must declare no conflict of interest before working on a case.
- A campaign's publisher must differ from the person who prepared it.
- Disbursement approver ≠ requester †; refund approver ≠ requester †; budget-change approver ≠
  requester †; purchase approver ≠ requester †; agreement approver ≠ preparer †; offline-receipt
  confirmer ≠ recorder †; supplier verifier ≠ creator.
- Story approver ≠ author and ≠ the last editor; media reviewer ≠ uploader.
- Outcome reviewer ≠ the intervention's case manager.
- Nobody can change their own roles; the last super administrator cannot be removed.
