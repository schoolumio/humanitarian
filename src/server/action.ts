import { ZodError } from "zod";
import { unstable_rethrow } from "next/navigation";
import { AppError, toSafeMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { InvalidTransitionError } from "@/lib/workflow/machine";

export type FormState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
} | null;

/**
 * Wrap a server action body: converts validation and domain errors into a safe form state,
 * never leaks internal errors or stack traces, and lets Next.js redirects pass through.
 */
export async function runAction(fn: () => Promise<string | void>): Promise<FormState> {
  try {
    const message = await fn();
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
