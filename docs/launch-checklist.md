# Production launch checklist

KindSpring may accept real applicants and real money **only** when every item is complete and signed.
Status as of the last engineering update is shown; ☐ = outstanding.

## A. Governance, legal and finance (external – not software)

- ☐ Legal structure and fundraising model confirmed by Nigerian counsel (incl. any CAC/NGO, SCUML or
  fundraising permissions).
- ☐ Custody of funds and payment flow approved (who holds restricted funds; provider model).
- ☐ Tax treatment of donations, sponsorship and receipts confirmed.
- ☐ Accounting policy approved: processing-fee policy, platform fee (if any), restricted funds,
  overfunding, unspent balances, refunds. Published policy text matches configuration.
- ☐ Beneficiary disbursement procedures and supplier verification procedure approved.
- ☐ Data-protection review (NDPA), DPIA, privacy notice, processor agreements, retention schedule.
- ☐ Safeguarding policy, staff training and referral pathways in place.
- ☐ Policy pages reviewed and the "draft policy" banners removed.

## B. Integrations and configuration

- ☐ Paystack business account approved; test-mode end-to-end run on staging (payment, duplicate
  webhook, refund, dispute) recorded.
- ☐ Paystack refund/dispute event payloads verified against current docs; parser adjusted if needed.
- ☐ `PAYMENTS_LIVE_MODE_APPROVED=true` set only after A and B are complete.
- ☐ S3-compatible private/public buckets with least-privilege keys; versioning; external malware
  scanner wired to `/api/webhooks/scan`.
- ☐ Email domain verified (SPF/DKIM/DMARC); delivery/bounce webhooks.
- ☐ Error monitoring with PII scrubbing; alerts for 5xx, webhook errors, dead jobs.
- ☐ Cron running every 5 minutes (or external scheduler) and monitored.
- ☐ Custom domain with HTTPS; `APP_BASE_URL` set.
- ☐ All staff enrolled in MFA; first super admin created via `npm run admin:create`; demo data absent.

## C. Engineering verification

- ✅ Migrations apply cleanly (`prisma migrate deploy`).
- ✅ Unit and integration tests pass (100 tests).
- ✅ End-to-end journeys A–J pass on a production build (mobile viewport).
- ✅ Automated accessibility scans (axe, WCAG 2.2 A/AA) show no serious/critical issues on key pages.
- ✅ Production build, lint, type-check pass; `npm audit` reports no known vulnerabilities.
- ✅ Local backup/restore procedure exercised (see backup-recovery.md).
- ☐ Restore test on the production-equivalent database recorded.
- ☐ Independent security review / penetration test; high-severity findings resolved.
- ☐ Manual accessibility testing with screen readers (TalkBack on Android) and keyboard.
- ☐ Load test of public pages and webhook endpoint.
- ☐ Usability testing with applicants who have limited digital experience.

## D. Operational readiness

- ☐ Staff roles assigned on least privilege; access review completed.
- ☐ Support channel for applicants without email/smartphones (assisted applications) staffed.
- ☐ Incident response contacts and on-call rota.
- ☐ Finance reconciliation routine (daily) and month-end fund statements defined.

## Sign-off

| Area                   | Name | Role | Date | Signature |
| ---------------------- | ---- | ---- | ---- | --------- |
| Legal / compliance     |      |      |      |           |
| Finance                |      |      |      |           |
| Data protection        |      |      |      |           |
| Safeguarding           |      |      |      |           |
| Engineering / security |      |      |      |           |
| Executive approval     |      |      |      |           |
