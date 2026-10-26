"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/server/action";
import { buttonClass, cx, type ButtonVariant } from "./index";

export function SubmitButton({ children, variant = "primary", className, pendingText = "Saving…", confirm }: { children: ReactNode; variant?: ButtonVariant; className?: string; pendingText?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={buttonClass(variant, className)}
      disabled={pending}
      aria-disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? pendingText : children}
    </button>
  );
}

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode | ((state: FormState) => ReactNode);
  className?: string;
  resetOnSuccess?: boolean;
  successMessage?: string;
  id?: string;
};

/**
 * Progressive-enhancement form bound to a server action. Shows a summary of errors (focused
 * for screen readers) and per-field messages via FieldError.
 */
export function ActionForm({ action, children, className, resetOnSuccess, successMessage, id }: Props) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state?.error) summaryRef.current?.focus();
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form id={id} ref={ref} action={formAction} className={cx("flex flex-col gap-4", className)} noValidate>
      {state?.error && (
        <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-md border border-coral/50 bg-coral/10 p-3 text-coral-700">
          <p className="font-semibold">{state.error}</p>
          {state.fieldErrors && Object.keys(state.fieldErrors).length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-sm">
              {Object.entries(state.fieldErrors).map(([k, v]) => (
                <li key={k}>{v}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {state?.ok && (state.message || successMessage) && (
        <div role="status" className="rounded-md border border-teal/30 bg-sage p-3 text-teal">
          {state.message || successMessage}
        </div>
      )}
      {typeof children === "function" ? children(state) : children}
    </form>
  );
}
