import Link from "@/components/ui/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { otpauthUri } from "@/lib/auth/totp";
import { ROLE_LABELS, isStaff } from "@/lib/permissions";
import { Alert, Badge, DefinitionList, Field, PageHeader, cx, formatDate, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { AlertIcon, FileIcon, LockIcon, ShieldIcon, UserIcon } from "@/components/brand/icons";
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
    <div>
      <PageHeader
        eyebrow="Account & security"
        title="Your account"
        description="Manage your details, how you sign in and the information we hold about you."
      />
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
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Your details" icon={<UserIcon />}>
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
        </Panel>

        <Panel title="Two-step verification" icon={<ShieldIcon className="h-5 w-5" />}>
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
              <p className="my-3 break-all rounded bg-cream p-3 font-mono text-lg" aria-label="Setup key">
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
        </Panel>

        <Panel title="Change password" icon={<LockIcon />}>
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
        </Panel>

        <Panel title="Your data" icon={<FileIcon />}>
          <p>You can download a copy of the personal information KindSpring holds about you.</p>
          <p className="mt-3">
            <a href="/api/account/export" className="font-semibold">
              Download my data (JSON)
            </a>
          </p>
        </Panel>
      </div>

      <Panel title="Delete my account" icon={<AlertIcon />} className="mt-6 border-danger/30">
        <p className="text-sm text-muted">
          We will remove your name, contact details and the personal content of closed requests. Some records
          must be kept by law or for financial accountability (for example payment receipts and audit records)
          – these are kept in a form that no longer identifies you where possible. See our{" "}
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
      </Panel>
    </div>
  );
}

function Panel({
  title,
  icon,
  children,
  className,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("card p-6 sm:p-7", className)}>
      <h2 className="mb-4 flex items-center gap-3 text-xl">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand"
        >
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}
