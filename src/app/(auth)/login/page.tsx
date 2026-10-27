import Link from "@/components/ui/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Alert, Field, inputClass } from "@/components/ui";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const { next = "", reset } = await searchParams;
  return (
    <AuthShell title="Sign in">
      {reset && (
        <div className="mb-4">
          <Alert tone="success" title="Your password was changed. Please sign in." />
        </div>
      )}
      <>
        <ActionForm action={loginAction}>
          <input type="hidden" name="next" value={next} />
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
          <Field label="Password" name="password">
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={inputClass}
            />
          </Field>
          <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
        </ActionForm>
        <p className="mt-4 text-sm">
          <Link href="/forgot-password">Forgot your password?</Link>
        </p>
      </>
      <p className="mt-4">
        New to KindSpring? <Link href="/register">Create an account</Link>
      </p>
    </AuthShell>
  );
}
