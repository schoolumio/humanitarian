import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Card, Field, inputClass } from "@/components/ui";
import { forgotPasswordAction } from "../actions";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-3xl">Reset your password</h1>
      <Card>
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
      </Card>
    </div>
  );
}
