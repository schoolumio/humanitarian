import { ZodError } from "zod";
import { unstable_rethrow } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { AppError, toSafeMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { InvalidTransitionError } from "@/lib/workflow/machine";

export type FormState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Where the client should go after success (handled by ActionForm once hydrated). */
  redirectTo?: string;
} | null;

/**
 * Navigate after a successful action. We return the destination instead of calling
 * redirect() inside actions: a server-action redirect can be dropped by the client router
 * when a form is submitted while the page is still hydrating (common on slow phones).
 */
export function withRedirect(state: FormState, to: string): FormState {
  return state?.ok ? { ...state, redirectTo: to } : state;
}

/**
 * Wrap a server action body: converts validation and domain errors into a safe form state,
 * never leaks internal errors or stack traces, and lets Next.js redirects pass through.
 */
export const NOTICE_COOKIE = "ks_notice";

export async function runAction(fn: () => Promise<string | void>): Promise<FormState> {
  try {
    const message = await fn();
    if (message) {
      // Page-level confirmation that survives the form unmounting after a state change.
      // Contains only non-sensitive UI text; read and cleared by <Notice />.
      (await cookies()).set(NOTICE_COOKIE, encodeURIComponent(message.slice(0, 300)), { path: "/", maxAge: 30, sameSite: "lax", httpOnly: false });
      revalidatePath("/", "layout"); // re-render the layout so the notice is shown in this response
    }
    return { ok: true, message: message || undefined };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return { error: "Please correct the highlighted fields.", fieldErrors };
    }
    if (err instanceof AppError || err instanceof InvalidTransitionError) return { error: err.message };
    logger.error("action.unexpected_error", { error: err });
    return { error: toSafeMessage(err) };
  }
}

export const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};
