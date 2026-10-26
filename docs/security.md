# Security

This document lists implemented controls, how they are tested, and what remains. It is not a
certification; an independent security review / penetration test is required before launch.

## Implemented controls

| Area                 | Control                                                                                                                                                                                                                                                                                                  | Tested by                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Authorisation        | Service-layer permission matrix + ownership/assignment scoping; pages use `requirePagePermission`; no UI-only checks                                                                                                                                                                                     | `permissions.test.ts`, integration tests, e2e B/H |
| IDOR                 | Records looked up by owner/assignment; missing and forbidden look identical (404); public URLs use random ids; internal ids never published                                                                                                                                                              | applications/operations integration tests, e2e H  |
| Separation of duties | Service checks + DB CHECK constraints (see permissions.md)                                                                                                                                                                                                                                               | integration + e2e I                               |
| Authentication       | Argon2id; ≥10-char passwords + common-password block; generic login errors; timing equalisation; per-IP and per-email rate limits; account lock after 8 failures; reset tokens single-use (1 h), hashed; sessions revoked on reset/role change/suspension                                                | `auth.test.ts`                                    |
| Sessions             | 256-bit tokens, SHA-256 stored, `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` prefix; 12 h for staff                                                                                                                                                                                                   | —                                                 |
| MFA                  | TOTP (RFC 6238), secret AES-256-GCM encrypted; required for high-risk permissions (step-up within 12 h)                                                                                                                                                                                                  | RFC vectors, permissions tests                    |
| CSRF                 | Server actions: Next.js Origin/Host check; `/api/upload`: explicit same-origin check; SameSite cookies; webhooks: signatures                                                                                                                                                                             | —                                                 |
| Input validation     | Zod schemas on every action; whitelisted fields (no mass assignment); length limits                                                                                                                                                                                                                      | integration (mass assignment)                     |
| Output encoding      | React escaping; no `dangerouslySetInnerHTML`; email HTML escapes text                                                                                                                                                                                                                                    | —                                                 |
| CSP & headers        | Nonce CSP with `strict-dynamic`, `frame-ancestors 'none'`, HSTS, nosniff, referrer and permissions policies                                                                                                                                                                                              | manual header check                               |
| Files                | 4 MB limit; magic-byte type detection (extension/MIME ignored); random storage keys (traversal-proof); private bucket; 2-minute signed URLs after authorisation; every access/denial audited; scan-status gate; public copies only for published media; downloads served as attachments with sandbox CSP | operations integration tests, e2e H               |
| Payments             | Server-created records; signature over raw body; provider re-verification; amount/currency checks; dedupe + row locks + idempotent journals; no card data stored; payloads sanitised                                                                                                                     | `payments.test.ts`, e2e D/E                       |
| Webhook replay       | Unique dedupe key per event; processed events return 200 without effect                                                                                                                                                                                                                                  | integration + e2e E                               |
| Audit                | Append-only `audit_logs` (DB trigger); sensitive views (safeguarding, case views, file access) logged; logs exclude passwords/tokens/narratives                                                                                                                                                          | operations integration test                       |
| Errors               | Generic messages to users; error digests only; no stack traces; structured logs with redaction                                                                                                                                                                                                           | —                                                 |
| SQL injection        | Prisma parameterised queries; raw SQL only via tagged templates                                                                                                                                                                                                                                          | —                                                 |
| Secrets              | Env only; no `NEXT_PUBLIC_` secrets; `.env` git-ignored; validated at start-up                                                                                                                                                                                                                           | —                                                 |
| Dependencies         | `npm audit` in CI (production, high+); lockfile committed                                                                                                                                                                                                                                                | CI                                                |
| Rate limiting        | Login, registration, reset, MFA, uploads, donations, proposals, complaints, contact                                                                                                                                                                                                                      | `auth.test.ts`                                    |

## Malware scanning (production requirement)

Uploads are stored privately with `scanStatus=PENDING` when `MALWARE_SCAN_MODE=external`, and cannot
be downloaded or published until a scanner reports `CLEAN` via `/api/webhooks/scan`. Infected files
are deleted from storage. Development uses `none-dev` (marked "not scanned"); deployed HTTPS
environments refuse to start without `external`. **A scanner must be provisioned** (see deployment.md).

## Outstanding / recommended before launch

- Independent penetration test and code review.
- Integrate error monitoring with PII scrubbing; alerting on webhook failures and dead jobs.
- Email delivery webhooks (bounce/complaint handling).
- WAF / bot protection at the edge (Vercel Firewall or Cloudflare) in addition to app rate limits.
- Paystack source-IP allow-listing at the edge (defence in depth).
- Large uploads (video) via direct-to-storage presigned uploads with server-side scanning.
- Periodic staff access reviews (Staff → Audit log → access review) – a procedural control.
- Key rotation procedure for `AUTH_SECRET` (invalidates signed file URLs only) and
  `DATA_ENCRYPTION_KEY` (requires re-encrypting MFA secrets; not yet scripted).
