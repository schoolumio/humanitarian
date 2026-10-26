import { db } from "../db";
import { randomToken, sha256Hex } from "../crypto";

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-ks_session" : "ks_session";
const DAY = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 7 * DAY;
export const STAFF_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const STEP_UP_VALIDITY_MS = 12 * 60 * 60 * 1000;

export async function createSession(userId: string, opts: { staff: boolean; userAgent?: string | null; ipHash?: string | null }) {
  const token = randomToken(32);
  const ttl = opts.staff ? STAFF_SESSION_TTL_MS : SESSION_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl);
  await db.session.create({
    data: { id: sha256Hex(token), userId, expiresAt, userAgent: opts.userAgent?.slice(0, 300), ipHash: opts.ipHash },
  });
  return { token, expiresAt };
}

export async function validateSessionToken(token: string) {
  const id = sha256Hex(token);
  const session = await db.session.findUnique({
    where: { id },
    include: { user: { include: { roles: true } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now() || session.user.status !== "ACTIVE") {
    await db.session.delete({ where: { id } }).catch(() => undefined);
    return null;
  }
  // Touch at most once every 5 minutes to limit write load.
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await db.session.update({ where: { id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  return session;
}

export const invalidateSessionToken = (token: string) => db.session.deleteMany({ where: { id: sha256Hex(token) } });
export const invalidateAllUserSessions = (userId: string) => db.session.deleteMany({ where: { userId } });

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}
