import Link from "@/components/ui/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { otpauthUri } from "@/lib/auth/totp";
import { ROLE_LABELS, isStaff } from "@/lib/permissions";
import {
  Alert,
  Badge,
  Card,
  DefinitionList,
  Field,
  PageHeader,
  Section,
  formatDate,
  inputClass,
} from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { requirePageActor } from "@/server/current-user";
import {
  beginMfaAction,
  changePasswordAction,
  confirmMfaAction,
  deleteAccountAction,
  resendVerificationAction,
} from "./actions";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const actor = await requirePageActor("/account");
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId } });
  const pendingSecret = user.mfaSecretEnc && !user.mfaEnabledAt ? decryptSecret(user.mfaSecretEnc) : null;
  return (
    <div className="max-w-3xl">
      <PageHeader title="Your account" />
      {!user.emailVerifiedAt && (
        <div className="mb-6">
          <Alert tone="warning" title="Please confirm your email address">
            <ActionForm action={resendVerificationAction}>
              <SubmitButton variant="secondary" pendingText="Sending…">
                Send a new confirmation link
              </SubmitButton>
            </ActionForm>
          </Alert>
        </div>
      )}
      <Card>
        <DefinitionList
          items={[
            ["Name", user.name],
            ["Email", user.email],
            ["Email confirmed", user.emailVerifiedAt ? formatDate(user.emailVerifiedAt) : "Not yet"],
            [
              "Roles",
              <span key="r" className="flex flex-wrap gap-1">
                {actor.roles.map((r) => (
                  <Badge key={r}>{ROLE_LABELS[r]}</Badge>
                ))}
              </span>,
            ],
            ["Two-step verification", user.mfaEnabledAt ? "On" : "Off"],
          ]}
        />
      </Card>

      <Section title="Two-step verification">
        <Card>
          {user.mfaEnabledAt ? (
            <p>
              Two-step verification is on. You will be asked for a code from your authenticator app when you
              sign in and before sensitive actions.
            </p>
          ) : pendingSecret ? (
            <>
              <p>
                Add KindSpring to an authenticator app (for example Google Authenticator or Microsoft
                Authenticator) using this setup key, then enter the 6-digit code.
              </p>
              <p className="my-3 break-all rounded bg-ivory p-3 font-mono text-lg" aria-label="Setup key">
                {pendingSecret.match(/.{1,4}/g)?.join(" ")}
              </p>
              <p className="mb-3 text-sm text-muted break-all">
                Setup link: {otpauthUri(pendingSecret, user.email)}
              </p>
              <ActionForm action={confirmMfaAction}>
                <Field label="6-digit code" name="code">
                  <input
                    id="code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    className={inputClass}
                  />
                </Field>
                <SubmitButton>Turn on</SubmitButton>
              </ActionForm>
            </>
          ) : (
            <>
              <p className="mb-3">
                {isStaff(actor.roles)
                  ? "Staff must use two-step verification for sensitive operations."
                  : "Add an extra layer of protection to your account."}
              </p>
              <ActionForm action={beginMfaAction}>
                <SubmitButton variant="secondary">Set up two-step verification</SubmitButton>
              </ActionForm>
            </>
          )}
        </Card>
      </Section>

      <Section title="Change password">
        <Card>
          <ActionForm action={changePasswordAction} resetOnSuccess>
            <Field label="Current password" name="current">
              <input
                id="current"
                name="current"
                type="password"
                autoComplete="current-password"
                className={inputClass}
              />
            </Field>
            <Field label="New password" name="password" hint="At least 10 characters.">
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                className={inputClass}
              />
            </Field>
            <SubmitButton>Change password</SubmitButton>
          </ActionForm>
        </Card>
      </Section>

      <Section title="Your data">
        <Card>
          <p>You can download a copy of the personal information KindSpring holds about you.</p>
          <p className="mt-3">
            <a href="/api/account/export" className="font-semibold">
              Download my data (JSON)
            </a>
          </p>
          <hr className="my-5 border-line" />
          <h3 className="font-semibold">Delete my account</h3>
          <p className="mt-1 text-sm text-muted">
            We will remove your name, contact details and the personal content of closed requests. Some
            records must be kept by law or for financial accountability (for example payment receipts and
            audit records) – these are kept in a form that no longer identifies you where possible. See our{" "}
            <Link href="/policies/privacy">privacy policy</Link>.
          </p>
          <ActionForm action={deleteAccountAction} className="mt-3">
            <Field label="Type DELETE to confirm" name="confirm">
              <input id="confirm" name="confirm" className={inputClass} autoComplete="off" />
            </Field>
            <SubmitButton variant="danger" confirm="Delete your account? This cannot be undone.">
              Delete my account
            </SubmitButton>
          </ActionForm>
        </Card>
      </Section>
    </div>
  );
}
