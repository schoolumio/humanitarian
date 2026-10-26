# KindSpring

**Real People. Verified Needs. Lasting Change.**

KindSpring is a humanitarian support platform for Nigeria. People request help privately; the
operations team verifies each request through staged investigation; approved cases are funded by
individual contributions, corporate sponsorship or in-kind support; delivery is evidenced and
independently reviewed; and approved, consented impact stories are published.

> **Status: development / pre-production.** The software implements the workflows, controls and
> tests described below, but KindSpring is **not ready to accept real applicants or real money**.
> Live payments are disabled by default and require the legal, compliance and operational sign-off
> in [`docs/launch-checklist.md`](docs/launch-checklist.md). Passing tests does not establish legal
> compliance or operational readiness.

## Contents

- [What is included](#what-is-included)
- [Architecture at a glance](#architecture-at-a-glance)
- [Local setup (macOS / Linux)](#local-setup-macos--linux)
- [Local setup (Windows CMD)](#local-setup-windows-cmd)
- [Testing](#testing)
- [Documentation](#documentation)
- [Project status: completed, remaining, risks](#project-status)

## What is included

| Area                   | Highlights                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public website         | Home, verified cases (filters, pagination), case pages with itemised budget and confirmed-funding progress, categories, how it works, verification & transparency, partnerships, completed interventions, impact, about, contact, FAQ, privacy, terms, funding policy, safeguarding/complaints                   |
| Applicant portal       | 8-step guided application (saved per step, draft resume, browser-side draft protection), optional evidence upload, safe-contact preferences, verification alternatives, granular consents, idempotent submission, reference number, status page, replies to information requests, consent management, withdrawal |
| Donor portal           | Contribution history and receipts; anonymous public display while keeping internal records                                                                                                                                                                                                                       |
| Sponsor portal         | Organisation registration and review, eligible-case browsing (incl. sponsors-only cases), enquiries/proposals, in-kind offers, agreement signing by authorised representatives, online pledge payment, sponsor report                                                                                            |
| Investigator workspace | Assigned cases only, conflict-of-interest declaration, staged checklist (category-configurable), evidence, notes (restricted option), field visits with estimated/actual costs, reports, follow-up dates                                                                                                         |
| Case management        | Queue (risk-ordered), status transitions with reasons, information requests, independent review, final decisions with applicant-facing explanation, reopening, consent recorded on behalf of offline applicants                                                                                                  |
| Campaigns              | Created from approved cases, privacy/dignity text guard, consent-gated publication, four-eyes publishing, public or sponsors-only visibility, funding close/cancel                                                                                                                                               |
| Finance                | Provider abstraction (Paystack + signed-webhook sandbox), verified webhooks, reconciliation, refunds & chargebacks, offline sponsor receipts, maker–checker disbursements, double-entry fund ledger, fund statements, financial summary                                                                          |
| Interventions          | Plans, suppliers (independent verification), purchase requests, disbursements, budget changes (independent approval when material), delivery evidence, checklist, beneficiary feedback, independent outcome review                                                                                               |
| Media & stories        | Private originals, editorial approval by a second editor, channel-specific consent checks, child safeguarding clearance, public copies only at publication, takedowns, consent-withdrawal review, external post links and staff-entered metrics, revision history                                                |
| Oversight              | Operations dashboard, risk alerts (human review only), complaints, restricted safeguarding records, audit-log search, staff access review, role management, categories, contact inbox, internal and public reports                                                                                               |

## Architecture at a glance

- **Next.js 15 (App Router) + React 19 + TypeScript (strict) + Tailwind CSS 4.** Server Components by
  default; small client components for forms and uploads.
- **PostgreSQL + Prisma 6** with version-controlled migrations. Database triggers make journal,
  audit, status-history and consent tables append-only and verify that every journal balances at
  commit; CHECK constraints enforce non-negative money and maker–checker separation.
- **Service layer (`src/server/services`)** is the only place that changes data. Every function
  takes an `Actor`, checks the [permission matrix](docs/permissions.md), ownership/assignment and
  separation-of-duty rules. Pages and server actions are thin.
- **Auth:** database-backed sessions (hashed tokens), Argon2id, email verification, password reset,
  TOTP two-step verification with step-up for high-risk actions, Postgres-backed rate limiting.
- **Money:** BigInt kobo everywhere (`₦1 = 100 kobo`); see [`docs/payments.md`](docs/payments.md).
- **Files:** private bucket + signed URLs, separate public bucket for published media only.
- **Background jobs:** transactional outbox in Postgres drained by Vercel Cron.

Details and trade-offs: [`docs/architecture.md`](docs/architecture.md).

## Local setup (macOS / Linux)

Prerequisites: Node.js 20.18+ (22 recommended), npm 10, PostgreSQL 15+ (local or Docker).

```bash
# 1. Install dependencies
npm ci

# 2. Configure environment
cp .env.example .env
# edit .env: set DATABASE_URL, AUTH_SECRET, DATA_ENCRYPTION_KEY, SANDBOX_WEBHOOK_SECRET
openssl rand -base64 48   # → AUTH_SECRET
openssl rand -base64 32   # → DATA_ENCRYPTION_KEY
openssl rand -hex 24      # → SANDBOX_WEBHOOK_SECRET

# 3. Start PostgreSQL (example using Docker) and create the database
docker run -d --name kindspring-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
docker exec kindspring-db createdb -U postgres kindspring_dev

# 4. Apply migrations
npx prisma migrate deploy

# 5. Seed reference data (support categories). Optionally add fictional demo accounts:
SEED_DEMO_PASSWORD='choose-a-local-demo-password' npm run db:seed
#    Demo logins are *@demo.kindspring.test (e.g. casemanager1@demo.kindspring.test) with that password.
#    Without SEED_DEMO_PASSWORD, create your first administrator instead:
ADMIN_EMAIL=you@example.org ADMIN_NAME="Your Name" ADMIN_PASSWORD='a long passphrase' npm run admin:create

# 6. Start the development server
npm run dev            # http://localhost:3000

# 7. Run background jobs (emails, reconciliation sweeps) while developing
npm run jobs:run       # run again whenever you want queued jobs processed
```

In development, emails are not sent: the `log` provider records metadata and the full message is
stored in the `notifications` table. To verify an account locally, read the link from that table
(`npx prisma studio`) or use the seeded demo accounts, which are pre-verified.

Payments use the **sandbox provider**: “Continue to secure payment” opens a simulated checkout that
sends a signed webhook back to the app. No real money moves.

## Local setup (Windows CMD)

```bat
REM 1. Install dependencies
npm ci

REM 2. Configure environment
copy .env.example .env
REM Edit .env in Notepad. Generate secrets with Node:
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"

REM 3. Install PostgreSQL for Windows (https://www.postgresql.org/download/windows/), then:
"C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres kindspring_dev

REM 4. Apply migrations
npx prisma migrate deploy

REM 5. Seed reference data and optional fictional demo accounts
set SEED_DEMO_PASSWORD=choose-a-local-demo-password
npm run db:seed
set SEED_DEMO_PASSWORD=

REM 6. Start the development server (http://localhost:3000)
npm run dev

REM 7. Process background jobs
npm run jobs:run
```

## Testing

```bash
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run format:check  # Prettier
npm test              # unit + integration (integration needs PostgreSQL; see below)
npm run build         # production build
npm run test:e2e      # Playwright journeys A–J + accessibility scans (needs a prior `npm run build`)
```

- **Unit tests** (`tests/unit`): money, permissions, state machines, ledger validation, consent,
  TOTP vectors, file sniffing, eligibility and separation-of-duty rules, refunds, budget changes.
- **Integration tests** (`tests/integration`) run the real services against PostgreSQL database
  `kindspring_test` (override with `TEST_DATABASE_URL`). They apply migrations with
  `prisma migrate deploy` and truncate tables between tests – a guard refuses to run against any
  database that is not local and named `*_test`.
- **End-to-end tests** (`tests/e2e`) run a production build on port 3100 against
  `kindspring_e2e_test`, on a Pixel 7 (mobile) viewport, with the sandbox provider. They cover
  journeys A–J from the specification plus axe-core WCAG 2.2 A/AA scans.

Create the test databases once: `createdb kindspring_test && createdb kindspring_e2e_test`.

## Documentation

| Document                                          | Purpose                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| [architecture.md](docs/architecture.md)           | Stack, structure, key decisions and trade-offs                                  |
| [permissions.md](docs/permissions.md)             | Role/permission matrix and separation of duties                                 |
| [workflows.md](docs/workflows.md)                 | Application, campaign, payment, intervention state machines                     |
| [payments.md](docs/payments.md)                   | Money units, ledger, Paystack integration, webhooks, refunds, overfunding, fees |
| [deployment.md](docs/deployment.md)               | Environments, Vercel, database, storage, email, webhooks, cron, domain          |
| [security.md](docs/security.md)                   | Controls, threat model notes, malware scanning, outstanding items               |
| [data-protection.md](docs/data-protection.md)     | Data inventory, lawful basis notes, retention, rights handling (NDPA)           |
| [reporting.md](docs/reporting.md)                 | Precise metric definitions                                                      |
| [backup-recovery.md](docs/backup-recovery.md)     | Backups, restore procedure and test record                                      |
| [incident-response.md](docs/incident-response.md) | Security, payment and safeguarding incident checklist                           |
| [launch-checklist.md](docs/launch-checklist.md)   | Production launch checklist and sign-offs                                       |

## Project status

See [`docs/launch-checklist.md`](docs/launch-checklist.md) for the authoritative list. In summary:

**Completed and tested:** the workflows listed above, with server-side authorisation, database
integrity controls, sandbox payments end to end, and automated unit, integration, end-to-end and
accessibility tests.

**Requires configuration or external decisions before launch:** legal/fundraising operating model
and custody of funds; Paystack account and webhook configuration (refund/dispute event shapes must be
confirmed against current Paystack docs); S3-compatible storage with an external malware scanner;
Resend (or other) email domain verification and delivery webhooks; error monitoring; production
backups; data-protection review; staff MFA enrolment.

**Known limitations:** uploads are limited to 4 MB (larger video needs direct-to-storage uploads);
social-media publishing is manual by design (links and metrics are recorded by staff); SMS/WhatsApp
notifications are not implemented; the interface is English-only (strings are not yet extracted for
translation); pro-rata refunds of unspent balances are executed as individual refunds by finance.
