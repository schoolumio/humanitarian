"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/server/action";
import { buttonClass, cx, type ButtonVariant } from "./index";

export function SubmitButton({
  children,
  variant = "primary",
  className,
  pendingText = "Saving…",
  confirm,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
  pendingText?: string;
  confirm?: string;
}) {
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
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  successMessage,
  id,
  autosaveKey,
}: Props) {
  // After a successful action we always do a full page load (to `redirectTo`, or a reload of
  // the current page). With Next.js 15 we observed client-router navigations after actions
  // being dropped during hydration, overwritten by the action's own refresh, and
  // revalidated data not being applied. A document load is deterministic, always shows
  // current data, and the confirmation is carried by a short-lived cookie (see <Notice />).
  const [state, formAction] = useActionState(async (prev: FormState, fd: FormData) => {
    const result = await action(prev, fd);
    if (result?.redirectTo) window.location.assign(result.redirectTo);
    else if (result?.ok) window.location.reload();
    return result;
  }, null);
  const ref = useRef<HTMLFormElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state?.error) summaryRef.current?.focus();
    if (state?.ok && resetOnSuccess) ref.current?.reset();
    if (state?.ok && autosaveKey) safeStorage(() => sessionStorage.removeItem(autosaveKey));
  }, [state, resetOnSuccess, autosaveKey]);
  useEffect(() => {
    const form = ref.current;
    if (!form || !autosaveKey) return;
    const saved =
      safeStorage(() => JSON.parse(sessionStorage.getItem(autosaveKey) ?? "{}") as Record<string, string>) ??
      {};
    for (const [name, value] of Object.entries(saved)) {
      const el = form.elements.namedItem(name);
      if (
        (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) &&
        el.type !== "checkbox" &&
        el.type !== "radio" &&
        !el.value
      )
        el.value = value;
    }
    const onInput = () => {
      const data: Record<string, string> = {};
      for (const el of Array.from(form.elements)) {
        if (
          (el instanceof HTMLTextAreaElement ||
            (el instanceof HTMLInputElement && ["text", "tel", "number"].includes(el.type))) &&
          el.name
        )
          data[el.name] = el.value;
      }
      safeStorage(() => sessionStorage.setItem(autosaveKey, JSON.stringify(data)));
    };
    form.addEventListener("input", onInput);
    return () => form.removeEventListener("input", onInput);
  }, [autosaveKey]);
  return (
    <form id={id} ref={ref} action={formAction} className={cx("flex flex-col gap-4", className)} noValidate>
      {state?.error && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="rounded-md border border-coral/50 bg-coral/10 p-3 text-coral-700"
        >
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

/** Page-level confirmation of the last successful action (carried across the page load). */
export function Notice({ initial }: { initial: string | null }) {
  const [message, setMessage] = useState(initial);
  useEffect(() => {
    if (initial) document.cookie = "ks_notice=; Max-Age=0; path=/; SameSite=Lax";
  }, [initial]);
  return (
    <div role="status" aria-live="polite">
      {message && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-teal/30 bg-sage p-3 text-teal">
          <span>{message}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-sm underline"
            aria-label="Dismiss message"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
