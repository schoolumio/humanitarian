import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, validateSessionToken } from "@/lib/auth/session";
import type { Permission } from "@/lib/permissions";
import { buildActor, type Actor } from "./actor";

const getSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSessionToken(token);
});

/**
 * Current request's actor (memoised per request). A session for a user with MFA enabled
 * is not usable until the second factor has been verified on it.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await getSession();
  if (!session) return null;
  if (session.user.mfaEnabledAt && !session.mfaVerifiedAt) return null;
  return buildActor(session.user, session);
});

/** A signed-in session that is waiting for its TOTP code (used by /mfa only). */
export async function getPendingMfaSession() {
  const session = await getSession();
  if (!session || !session.user.mfaEnabledAt || session.mfaVerifiedAt) return null;
  return { userId: session.userId, sessionId: session.id, email: session.user.email };
}

/** For pages: redirect to sign-in when anonymous. */
export async function requirePageActor(next?: string): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return actor;
}

/** For pages: render 403 page when lacking permission. */
export async function requirePagePermission(
  permission: Permission | Permission[],
  next?: string,
): Promise<Actor> {
  const actor = await requirePageActor(next);
  const list = Array.isArray(permission) ? permission : [permission];
  if (!list.some((p) => actor.permissions.has(p))) redirect("/forbidden");
  return actor;
}

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}
