# Backup and recovery

## Objectives (proposed)

RPO ≤ 15 minutes (managed PITR), RTO ≤ 4 hours. Confirm with operations leadership.

## What to back up

1. **PostgreSQL** – all data. Use the provider's automated backups with point-in-time recovery
   (e.g. Neon/Supabase/RDS PITR, ≥ 14 days) **plus** a daily logical dump stored in a separate
   account/region:
   ```bash
   pg_dump -Fc --no-owner "$DIRECT_DATABASE_URL" -f kindspring-$(date +%F).dump
   ```
   Encrypt dumps at rest (they contain personal data); restrict access; apply the retention schedule.
2. **Private bucket** (evidence, invoices, original media) – enable versioning and replication or a
   scheduled sync to a separate, access-restricted bucket.
3. **Public bucket** – reproducible from the private originals; versioning recommended.
4. **Configuration** – environment variables kept in a secrets manager (not in backups of the repo).

## Restore procedure

1. Declare an incident (incident-response.md); freeze writes if data integrity is in doubt
   (disable cron; put the app in maintenance by removing the deployment's domain alias).
2. Restore into a **new** database (PITR to timestamp, or `pg_restore` of a dump). Never restore over
   the live database.
3. Verify with `scripts/verify-restore.sh` (counts, every journal balanced, append-only triggers
   present), then run the app against the restored database on a preview deployment and spot-check
   recent payments against the Paystack dashboard.
4. Run `npx prisma migrate deploy` (no-op if already current) and switch `DATABASE_URL`.
5. Run reconciliation for payments since the restore point (Finance → Payments → "Check with
   provider", or let the sweep run) so provider-confirmed payments made after the restore point are
   re-applied idempotently.
6. Record the incident, timeline and verification evidence.

## Test record

| Date       | Environment                                       | Procedure                                                             | Result                                                                                                                                     |
| ---------- | ------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-10-26 | Local PostgreSQL 16 (development, fictional data) | `pg_dump -Fc` → `pg_restore` into a fresh database → integrity checks | Row counts identical (users, payments, journal lines, audit logs); ledger net 0; all 5 append-only triggers present and rejecting updates. |

**A restore test against the production-equivalent managed database must be performed and recorded
before launch, and repeated at least quarterly.**
