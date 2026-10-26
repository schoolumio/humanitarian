/**
 * Domain errors. Their messages are safe to show to users; anything else is
 * reported as a generic failure (see toSafeMessage).
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code:
      "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "UNAUTHENTICATED" | "RATE_LIMITED",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = (message = "You do not have permission to do that.") =>
  new AppError(message, "FORBIDDEN");
export const notFound = (message = "Not found.") => new AppError(message, "NOT_FOUND");
export const invalid = (message: string) => new AppError(message, "VALIDATION");
export const conflict = (message: string) => new AppError(message, "CONFLICT");
export const unauthenticated = (message = "Please sign in to continue.") =>
  new AppError(message, "UNAUTHENTICATED");
export const rateLimited = (message = "Too many attempts. Please wait and try again.") =>
  new AppError(message, "RATE_LIMITED");

export function toSafeMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  return "Something went wrong. Please try again. If the problem continues, contact support.";
}
