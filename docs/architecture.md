# Architecture

## Overview

```
Browser ──HTML/forms──▶ Next.js App Router (Server Components, server actions, route handlers)
                              │
                              ├─ src/server/services/*   ← all business rules & authorisation
                              │        │
                              │        ├─ src/lib/workflow/*   explicit state machines
                              │        ├─ src/lib/ledger/*     double-entry fund ledger
                              │        ├─ src/lib/payments/*   provider abstraction (Paystack, sandbox)
                              │        ├─ src/lib/storage/*    private/public object storage
                              │        └─ src/lib/email/*      templates + provider
                              │
                              └─ PostgreSQL (Prisma)  ← constraints, append-only triggers, balance checks
Vercel Cron ─▶ /api/cron/jobs ─▶ background_jobs (transactional outbox)
Payment provider ─▶ /api/webhooks/{provider} (signature-verified)
```

### Directory layout

| Path                                                  | Contents                                                                                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`, `prisma/migrations`           | Data model and migrations (incl. hand-written integrity migration)                                                                                   |
| `src/app`                                             | Routes: public site, `(auth)`, `apply`, `donor`, `sponsor`, `staff`, `api`                                                                           |
| `src/server/services`                                 | Business services (applications, cases, campaigns, payments, refunds, sponsors, interventions, media, complaints, admin, reports, risk, files, auth) |
| `src/server/actor.ts`, `current-user.ts`, `action.ts` | Actor model, permission checks, form-action plumbing                                                                                                 |
| `src/lib`                                             | Pure/infra modules (money, permissions, workflows, ledger, payments, storage, email, jobs, crypto, env)                                              |
| `src/components`                                      | Design system (`ui`), layout, public, applicant and staff components                                                                                 |
| `tests/unit`, `tests/integration`, `tests/e2e`        | Automated tests                                                                                                                                      |

## Key decisions

### 1. Custom DB-backed sessions instead of Auth.js

Auth.js's Credentials provider requires stateless JWT sessions (no server-side revocation) and has
no built-in MFA. KindSpring needs revocable sessions (role changes, suspensions, password resets
sign users out immediately), short staff sessions (12 h), TOTP MFA and per-session step-up for
high-risk actions. We implemented a small, well-understood session module following OWASP/Lucia
guidance: 256-bit random tokens, only SHA-256 hashes stored, `HttpOnly`, `SameSite=Lax`,
`__Host-` prefixed cookies in production, Argon2id password hashing (OWASP parameters).
_Trade-off:_ we own this code and its maintenance; it is covered by unit and integration tests.
Adding OAuth sign-in later would require a library (e.g. Auth.js or Better Auth) layered on top.

### 2. "Case" = submitted Application

The spec lists both `Application` and `Case`. A submitted application _is_ the internal case; a
separate `Campaign` represents the public/sponsor-facing funding workflow. This avoids duplicating
personal data and keeps application and campaign state machines separate, as required.

### 3. Code-level permission matrix

Permissions are defined in `src/lib/permissions.ts` (reviewable, versioned, unit-tested) rather
than a `Permission` table. Users hold one or more roles (`user_roles`). Scoping rules (ownership,
assignment, organisation membership) and separation of duties live in services and, for financial
approvals, in database CHECK constraints.

### 4. Money as BigInt minor units + double-entry ledger

All amounts are `BigInt` kobo with an ISO currency column. Campaign totals are denormalised for
fast public pages but updated in the same transaction as the payment state change, and
reconcilable against the ledger. See `docs/payments.md`.

### 5. Provider abstraction with a realistic sandbox

`PaymentProvider` (`initialize`, `verify`, `verifySignature`, `parseEvent`, `refund`) has Paystack
and sandbox implementations. The sandbox keeps its own "provider-side" records and signs webhooks,
so verification, idempotency, reconciliation and refunds are exercised end to end without network
access or credentials.

### 6. Durable jobs in Postgres

Vercel has no long-running workers. Jobs (emails, refund submission, reconciliation sweeps) are
written in the same transaction as the change that causes them and drained by `/api/cron/jobs`
using `FOR UPDATE SKIP LOCKED`, with exponential backoff and a dead state. No Redis required.

### 7. Document navigation (no client-side routing)

Target users are on low-end Android phones and slow networks. In testing with Next.js 15 we
observed client-router navigations being dropped when a link or form was used while the page was
still hydrating, being overwritten by a server action's own refresh, and revalidated data not
being applied. KindSpring therefore:

- uses plain `<a>` links (`src/components/ui/link.tsx`) instead of `next/link`;
- performs a full page load after every successful form action (`ActionForm`), carrying the
  confirmation in a short-lived cookie rendered by the root layout.
  Pages are server-rendered, JS bundles are cached, and every page works without JavaScript for
  basic navigation. _Trade-off:_ slightly more HTML transferred than client-side navigation.

### 8. Content Security Policy

A per-request nonce CSP is set in `src/middleware.ts` (`script-src 'nonce-…' 'strict-dynamic'`),
plus HSTS, `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and a restrictive
permissions policy (`next.config.ts`). User-specific pages and APIs are sent with
`Cache-Control: private, no-store`.

## Scaling notes

- All lists are paginated; indexes exist for every queue and foreign key used in filters.
- Use a pooled `DATABASE_URL` in serverless (e.g. Neon/Supabase pooler or PgBouncer).
- Public pages are dynamic (they show live funding). If traffic requires, cache campaign lists
  for short periods at the CDN – never cache authenticated pages.
