# Data protection notes

Prepared to support a review under the **Nigeria Data Protection Act 2023 (NDPA)** and related
NDPC guidance. These are engineering notes, **not legal advice**; a qualified data-protection adviser
must review the lawful bases, notices, DPIA, cross-border transfer position (hosting/email/storage
providers), and registration obligations before launch.

## Data inventory

| Data                                                                                      | Subjects         | Purpose                                | Where                                           | Access                                                         |
| ----------------------------------------------------------------------------------------- | ---------------- | -------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| Name, email, phone, password hash, MFA secret (encrypted)                                 | All users        | Accounts, security                     | `users`                                         | Self; admins (not secrets)                                     |
| Application details, location (LGA/community), household size, narrative, safety concerns | Applicants       | Assessment                             | `applications`                                  | Applicant; case managers; assigned investigators; safeguarding |
| Evidence files                                                                            | Applicants       | Verification                           | private bucket, `stored_files`                  | Applicant (own); case managers; assigned investigators         |
| Investigation notes, reports, reviews, decisions                                          | Applicants       | Assessment, accountability             | case tables                                     | Staff by role; restricted notes limited further                |
| Consents                                                                                  | Applicants       | Lawful publication                     | `applicant_consents` (append-only)              | Applicant; staff                                               |
| Media of beneficiaries                                                                    | Beneficiaries    | Documentation/publication with consent | private bucket; public copy only when published | Media editors; public only when consented                      |
| Payment records (name, email, amounts)                                                    | Donors, sponsors | Receipts, accounting, refunds          | `payments`, ledger                              | Donor (own); finance                                           |
| Complaints, safeguarding records                                                          | Any              | Safety, accountability                 | `complaints`, `safeguarding_records`            | Safeguarding officers; admins (non-safeguarding complaints)    |
| Audit logs (ids, actions, hashed IP)                                                      | Users            | Security, accountability               | `audit_logs`                                    | Admins                                                         |

Card data never reaches KindSpring. IP addresses are stored only as keyed hashes.

## Minimisation and privacy by default

- Applications ask only for assessment-relevant data; evidence is optional; exact community is never
  published (public text guard checks names, phone numbers and community).
- Publication requires separate, specific consents per channel; refusing them never affects
  eligibility. Children's media need guardian consent and safeguarding clearance.
- Sponsors see anonymised case data only.
- Emails contain no confidential application details.

## Rights handling

- **Access/portability:** Account → "Download my data" (JSON export).
- **Rectification:** applicant edits before submission; afterwards via information requests/staff.
- **Erasure:** Account → "Delete my account" anonymises the user and personal content of closed
  requests. **Exceptions** (retained, minimised): payment and ledger records (financial/tax law),
  audit logs, safeguarding records, records of active cases. The privacy policy explains this.
- **Withdraw consent:** applicant status page (always available, even after closure); staff can
  record offline withdrawals. Withdrawal removes content from KindSpring channels immediately and
  triggers review of external copies; copies made by third parties may not be fully removable.

## Retention schedule (proposed – to be confirmed by advisers)

| Record                               | Proposed retention                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| Draft applications never submitted   | 6 months after last update, then delete                                             |
| Declined/withdrawn applications      | 2 years after decision, then anonymise                                              |
| Approved cases and interventions     | 6 years after completion (financial accountability), then anonymise personal fields |
| Evidence files                       | 1 year after case closure unless needed for an open complaint/audit                 |
| Payment, ledger, refund records      | At least 6 years (confirm against Nigerian tax law)                                 |
| Audit logs                           | 6 years                                                                             |
| Safeguarding records                 | As advised (often longer); restricted access throughout                             |
| Sessions, tokens, rate-limit buckets | Expired entries purged daily by `cleanup_expired` job                               |

_Automated retention jobs for applications and evidence are **not yet implemented**; the schedule
must be confirmed and then automated._

## Processors (to list in the privacy notice)

Hosting (Vercel), database host, object storage, email provider (Resend), payment provider
(Paystack), error monitoring (if enabled). Confirm data-processing agreements and transfer bases.
