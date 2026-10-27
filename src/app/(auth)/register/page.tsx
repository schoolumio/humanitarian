import Link from "@/components/ui/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, inputClass } from "@/components/ui";
import { registerAction } from "../actions";

export const metadata: Metadata = { title: "Create an account" };

const ROLES = [
  { value: "APPLICANT", label: "I want to request assistance" },
  { value: "DONOR", label: "I want to give to verified cases" },
  { value: "SPONSOR", label: "I represent a business or organisation" },
];

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role = "APPLICANT" } = await searchParams;
  return (
    <AuthShell title="Create an account">
      <p className="mb-4 text-muted">
        You need an account so you can save your progress and check the status of your request or
        contributions.
      </p>
      <>
        <ActionForm action={registerAction} resetOnSuccess>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-semibold">How will you use KindSpring?</legend>
            {ROLES.map((r) => (
              <label
                key={r.value}
                className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 border-line px-4 font-semibold transition-colors hover:border-brand/40 has-[:checked]:border-brand has-[:checked]:bg-brand-50"
              >
                <input
                  type="radio"
                  name="role"
                  value={r.value}
                  defaultChecked={r.value === role}
                  className="h-5 w-5 accent-[#c8174f]"
                />
                {r.label}
              </label>
            ))}
          </fieldset>
          <Field label="Your name" name="name">
            <input id="name" name="name" autoComplete="name" required className={inputClass} />
          </Field>
          <Field
            label="Email address"
            name="email"
            hint="If you do not have an email address, ask us for help through the contact page or a community partner."
          >
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className={inputClass}
            />
          </Field>
          <Field
            label="Password"
            name="password"
            hint="At least 10 characters. A short phrase is easiest to remember."
          >
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              className={inputClass}
            />
          </Field>
          <Field label="Confirm password" name="confirmPassword">
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              className={inputClass}
            />
          </Field>
          <p className="text-sm text-muted">
            By creating an account you agree to our <Link href="/policies/terms">terms</Link> and acknowledge
            our <Link href="/policies/privacy">privacy policy</Link>.
          </p>
          <SubmitButton pendingText="Creating account…">Create account</SubmitButton>
        </ActionForm>
      </>
      <p className="mt-4">
        Already registered? <Link href="/login">Sign in</Link>
      </p>
    </AuthShell>
  );
}
