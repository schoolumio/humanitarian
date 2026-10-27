import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, inputClass } from "@/components/ui";
import { forgotPasswordAction } from "../actions";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password">
      <>
        <ActionForm action={forgotPasswordAction} resetOnSuccess>
          <Field label="Email address" name="email">
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className={inputClass}
            />
          </Field>
          <SubmitButton pendingText="Sending…">Send reset link</SubmitButton>
        </ActionForm>
      </>
    </AuthShell>
  );
}
