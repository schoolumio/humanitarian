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
  /**
   * Keep an unsent copy of text fields in this browser's sessionStorage so a dropped
   * connection or reload does not lose typing. Values are only restored into empty fields
   * and cleared after a successful save; the server remains the source of truth.
   */
  autosaveKey?: string;
};

/**
 * Progressive-enhancement form bound to a server action. Shows a summary of errors (focused
 * for screen readers) and per-field messages via FieldError.
 */
export function ActionForm({ action, children, className, resetOnSuccess, successMessage, id, autosaveKey }: Props) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // A full navigation is used deliberately: a client-router transition started here can be
    // overwritten by the server action's own refresh of the current page (observed in
    // Next.js 15), leaving the user on the form. A document load is deterministic.
    if (state?.redirectTo) window.location.assign(state.redirectTo);
  }, [state]);
  useEffect(() => {
    if (state?.error) summaryRef.current?.focus();
    if (state?.ok && resetOnSuccess) ref.current?.reset();
    if (state?.ok && autosaveKey) safeStorage(() => sessionStorage.removeItem(autosaveKey));
  }, [state, resetOnSuccess, autosaveKey]);
  useEffect(() => {
    const form = ref.current;
    if (!form || !autosaveKey) return;
    const saved = safeStorage(() => JSON.parse(sessionStorage.getItem(autosaveKey) ?? "{}") as Record<string, string>) ?? {};
    for (const [name, value] of Object.entries(saved)) {
      const el = form.elements.namedItem(name);
      if ((el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) && el.type !== "checkbox" && el.type !== "radio" && !el.value) el.value = value;
    }
    const onInput = () => {
      const data: Record<string, string> = {};
      for (const el of Array.from(form.elements)) {
        if ((el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && ["text", "tel", "number"].includes(el.type))) && el.name) data[el.name] = el.value;
      }
      safeStorage(() => sessionStorage.setItem(autosaveKey, JSON.stringify(data)));
    };
    form.addEventListener("input", onInput);
    return () => form.removeEventListener("input", onInput);
  }, [autosaveKey]);
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
      {state?.ok && !state.message && successMessage && (
        <div role="status" className="rounded-md border border-teal/30 bg-sage p-3 text-teal">
          {successMessage}
        </div>
      )}
      {typeof children === "function" ? children(state) : children}
    </form>
  );
}

function safeStorage<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined; // storage unavailable (private mode, quota)
  }
}

/** Shows the last action's confirmation at the top of the page, then clears it. */
export function Notice({ message }: { message: string | null }) {
  useEffect(() => {
    if (message) document.cookie = "ks_notice=; Max-Age=0; path=/; SameSite=Lax";
  }, [message]);
  if (!message) return null;
  return (
    <div role="status" aria-live="polite" className="mb-4 rounded-md border border-teal/30 bg-sage p-3 text-teal">
      {message}
    </div>
  );
}
