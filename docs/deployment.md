# Deployment

Target: **Vercel** (Next.js), **managed PostgreSQL** (e.g. Neon, Supabase, AWS RDS), **S3-compatible
private + public buckets** (e.g. Cloudflare R2, AWS S3), **Resend** for email. Other hosts work if they
run Node 20+.

## Environments

|           | Development | Staging                | Production                          |
| --------- | ----------- | ---------------------- | ----------------------------------- |
| Payments  | sandbox     | Paystack **test** keys | Paystack live – only after sign-off |
| Storage   | local       | s3 + scanner           | s3 + scanner                        |
| Email     | log         | resend (test domain)   | resend (verified domain)            |
| Staff MFA | optional    | required               | required                            |

Start-up validation (`src/lib/env.ts`) refuses to run on an HTTPS production deployment with local
storage, unscanned uploads, a missing `CRON_SECRET`, or a live key without approval.

## 1. Database

1. Create a PostgreSQL 15+ database; enable automated backups/PITR (see backup-recovery.md).
2. Use a **pooled** connection string for the app (`DATABASE_URL`, e.g. `?pgbouncer=true&connection_limit=5`)
   and, if your provider requires it, a direct URL for migrations.
3. Apply migrations from CI or your machine – never `migrate reset`/`db push` against production:
   ```bash
   DATABASE_URL="<direct url>" npx prisma migrate deploy
   ```
   Windows CMD: `set DATABASE_URL=<direct url>` then `npx prisma migrate deploy`.
4. Seed support categories (idempotent; demo accounts are refused in production):
   `NODE_ENV=production DATABASE_URL=… npm run db:seed` – **without** `SEED_DEMO_PASSWORD`.
   Categories can also be managed in **Staff → Categories**.
5. Bootstrap the first administrator:
   `ADMIN_EMAIL=… ADMIN_NAME=… ADMIN_PASSWORD=… npm run admin:create` – then sign in, enable MFA,
   and grant other staff roles from **Staff → Users & roles**.

## 2. Object storage

- Create two buckets: **private** (block all public access, SSE enabled) and **public** (read-only
  public or behind a CDN). Set `OBJECT_STORAGE_*` variables. Grant the app key only
  `GetObject/PutObject/DeleteObject` on these buckets.
- Set `OBJECT_STORAGE_PUBLIC_BASE_URL` to the public bucket/CDN origin (added to the CSP).
- Malware scanning: set `MALWARE_SCAN_MODE=external` and `SCAN_WEBHOOK_SECRET`. Configure a scanner
  (e.g. bucket-event-triggered ClamAV function or the provider's malware protection) to POST
  `{ "fileId": "<StoredFile.id>", "clean": true|false }` with `Authorization: Bearer <secret>` to
  `/api/webhooks/scan`. Files are not downloadable until marked clean. _(The scanner itself is not
  part of this repository.)_

## 3. Email

Create a Resend account, verify the sending domain (SPF/DKIM/DMARC), set `EMAIL_PROVIDER=resend`,
`RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`. Status `SENT_TO_PROVIDER` means accepted, not delivered;
delivery confirmation requires adding Resend delivery webhooks (not yet implemented).

## 4. Vercel

1. Import the repository. Framework: Next.js. Build command `npm run build` (runs `prisma generate`).
2. Add every variable from `.env.example` for Production and Preview (Preview must use test keys and a
   separate database).
3. Cron: `vercel.json` schedules `/api/cron/jobs` every 5 minutes (requires a Vercel plan that allows
   that frequency; on Hobby use an external scheduler calling the endpoint with
   `Authorization: Bearer $CRON_SECRET`). Vercel sends `CRON_SECRET` automatically.
4. Run migrations before promoting a deployment that needs them.

## 5. Domain

Add the domain in Vercel, configure DNS, wait for TLS, then set `APP_BASE_URL=https://<domain>`
(used in emails, payment callbacks and HTTPS-only security behaviour). Consider HSTS preload only
after confirming all subdomains serve HTTPS.

## 6. Payments

Follow docs/payments.md. Configure the Paystack webhook URL and test keys on staging; run a test
payment, a duplicate webhook replay and a refund before any go-live review.

## 7. Monitoring

- `/api/health` returns DB status (use for uptime checks).
- Logs are JSON lines with secrets/narratives redacted; ship them to a log drain.
- `ERROR_MONITORING_DSN` is reserved; integrate Sentry (`@sentry/nextjs`) or similar and confirm
  PII scrubbing before enabling. _(Not yet integrated.)_

## Never in production

- `prisma migrate reset`, `prisma db push --accept-data-loss`, the seed with `SEED_DEMO_PASSWORD`.
- Destructive SQL without a verified backup and a second person's confirmation.
