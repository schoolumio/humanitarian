"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, invalidateSessionToken, sessionCookieOptions } from "@/lib/auth/session";
import { hashIp } from "@/lib/crypto";
import { runAction, str, type FormState } from "@/server/action";
import { getActor, getPendingMfaSession } from "@/server/current-user";
import * as auth from "@/server/services/auth";
import { invalid } from "@/lib/errors";

async function requestContext() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  return { ipHash: hashIp(ip), userAgent: h.get("user-agent") };
}

/** Only allow same-site relative redirects (prevents open redirects). */
function safeNext(next: string, fallback: string) {
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  let destination = "/";
  const result = await runAction(async () => {
    const ctx = await requestContext();
    const r = await auth.login({ email: str(fd, "email"), password: str(fd, "password") }, ctx);
    (await cookies()).set(SESSION_COOKIE, r.token, sessionCookieOptions(r.expiresAt));
    const next = safeNext(str(fd, "next"), r.staff ? "/staff" : "/account");
    destination = r.mfaRequired ? `/mfa?next=${encodeURIComponent(next)}` : next;
  });
  if (result?.ok) redirect(destination);
  return result;
}

export async function registerAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const ctx = await requestContext();
    if (str(fd, "password") !== str(fd, "confirmPassword")) throw invalid("The passwords do not match.");
    await auth.register({ name: str(fd, "name"), email: str(fd, "email"), password: str(fd, "password"), role: str(fd, "role") as "APPLICANT" }, ctx);
    return "Thank you. If this email address can be registered, we have sent a confirmation link. You can sign in now; some actions need a confirmed email.";
  });
}

export async function logoutAction() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await invalidateSessionToken(token);
  jar.delete(SESSION_COOKIE);
  redirect("/");
}

export async function forgotPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const ctx = await requestContext();
    await auth.requestPasswordReset(str(fd, "email"), ctx);
    return "If an account exists for that email, we have sent a password reset link. It expires in 1 hour.";
  });
}

export async function resetPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const result = await runAction(async () => {
    if (str(fd, "password") !== str(fd, "confirmPassword")) throw invalid("The passwords do not match.");
    await auth.resetPassword(str(fd, "token"), str(fd, "password"));
  });
  if (result?.ok) redirect("/login?reset=1");
  return result;
}

export async function mfaChallengeAction(_: FormState, fd: FormData): Promise<FormState> {
  let next = "/";
  const result = await runAction(async () => {
    const pending = await getPendingMfaSession();
    const actor = await getActor();
    const subject = pending ?? (actor ? { userId: actor.userId, sessionId: actor.sessionId } : null);
    if (!subject) throw invalid("Please sign in again.");
    await auth.verifyMfaForSession(subject, str(fd, "code"));
    next = safeNext(str(fd, "next"), "/staff");
  });
  if (result?.ok) redirect(next);
  return result;
}
