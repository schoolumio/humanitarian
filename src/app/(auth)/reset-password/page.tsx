import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Alert, Card, Field, inputClass } from "@/components/ui";
import { resetPasswordAction } from "../actions";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) return <Alert tone="danger" title="This reset link is incomplete. Please request a new one." />;
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-3xl">Choose a new password</h1>
      <Card>
        <ActionForm action={resetPasswordAction}>
          <input type="hidden" name="token" value={token} />
          <Field label="New password" name="password" hint="At least 10 characters.">
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              className={inputClass}
            />
          </Field>
          <Field label="Confirm new password" name="confirmPassword">
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              className={inputClass}
            />
          </Field>
          <SubmitButton>Change password</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
