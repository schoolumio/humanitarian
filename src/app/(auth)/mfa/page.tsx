import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Card, Field, inputClass } from "@/components/ui";
import { getActor, getPendingMfaSession } from "@/server/current-user";
import { mfaChallengeAction } from "../actions";

export const metadata: Metadata = { title: "Two-step verification" };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/staff" } = await searchParams;
  const pending = await getPendingMfaSession();
  const actor = await getActor();
  if (!pending && !actor) redirect("/login");
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-2 text-3xl">Two-step verification</h1>
      <p className="mb-4 text-muted">
        {pending
          ? "Enter the 6-digit code from your authenticator app to finish signing in."
          : "This action needs you to confirm your identity again. Enter the 6-digit code from your authenticator app."}
      </p>
      <Card>
        <ActionForm action={mfaChallengeAction}>
          <input type="hidden" name="next" value={next} />
          <Field label="6-digit code" name="code">
            <input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              className={inputClass}
            />
          </Field>
          <SubmitButton pendingText="Checking…">Verify</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
