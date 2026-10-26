import { z } from "zod";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { conflict, invalid, unauthenticated } from "@/lib/errors";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { enforceRateLimit, clearRateLimit } from "@/lib/auth/rate-limit";
import { createSession, invalidateAllUserSessions } from "@/lib/auth/session";
import { decryptSecret, encryptSecret, randomToken, sha256Hex } from "@/lib/crypto";
import { generateTotpSecret, otpauthUri, verifyTotp } from "@/lib/auth/totp";
import { isStaff } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notify } from "../notifications";
import type { Actor } from "../actor";

const SELF_SERVICE_ROLES = ["APPLICANT", "DONOR", "SPONSOR"] as const;

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(120),
  email: z.email("Enter a valid email address.").trim().toLowerCase().max(200),
  password: z.string().min(1, "Enter a password."),
  role: z.enum(SELF_SERVICE_ROLES),
});

let dummyHash: Promise<string> | undefined;
const timingDummy = () => (dummyHash ??= hashPassword("kindspring-timing-equaliser-not-a-password"));

const GENERIC_LOGIN_ERROR = "Email or password is incorrect.";
const LOCK_THRESHOLD = 8;
const LOCK_MINUTES = 15;

/**
 * Self-service registration only grants APPLICANT, DONOR or SPONSOR. Staff roles are
 * granted by administrators. To avoid account enumeration the caller shows the same
 * message whether or not the email already exists.
 */
export async function register(input: z.input<typeof registerSchema>, ctx: { ipHash: string | null }) {
  const data = registerSchema.parse(input);
  await enforceRateLimit(`register:${ctx.ipHash ?? "unknown"}`, 10, 3600);
  const problem = passwordProblem(data.password, data.email);
  if (problem) throw invalid(problem);

  const existing = await db.user.findUnique({ where: { email: data.email } });
  if (existing) {
    // Do not reveal existence; silently do nothing. (Owner can use password reset.)
    return { created: false as const };
  }
  const passwordHash = await hashPassword(data.password);
  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: { name: data.name, email: data.email, passwordHash, roles: { create: [{ role: data.role as Role }] } },
    });
    await audit({ actorId: u.id, action: "user.register", entityType: "User", entityId: u.id, metadata: { role: data.role }, ipHash: ctx.ipHash }, tx);
    return u;
  });
  await sendVerificationEmail(user.id);
  return { created: true as const, userId: user.id };
}

export async function sendVerificationEmail(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) return;
  await enforceRateLimit(`verify-email:${userId}`, 5, 3600);
  const token = randomToken(32);
  await db.$transaction(async (tx) => {
    await tx.emailToken.create({
      data: { userId, purpose: "VERIFY_EMAIL", tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + 24 * 3600e3) },
    });
    await notify(tx, {
      userId,
      to: user.email,
      template: "verify_email",
      params: { name: user.name, url: `${env().APP_BASE_URL}/verify-email?token=${token}` },
      dedupeKey: `verify:${sha256Hex(token)}`,
    });
  });
  return token; // returned for tests only; never sent to the client
}

export async function verifyEmail(token: string) {
  const record = await db.emailToken.findUnique({ where: { tokenHash: sha256Hex(token) } });
  if (!record || record.purpose !== "VERIFY_EMAIL" || record.usedAt || record.expiresAt < new Date()) {
    throw invalid("This link is invalid or has expired. Request a new one from your account page.");
  }
  await db.$transaction(async (tx) => {
    await tx.emailToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    await tx.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
    await audit({ actorId: record.userId, action: "user.verify_email", entityType: "User", entityId: record.userId }, tx);
  });
}

export async function login(
  input: { email: string; password: string },
  ctx: { ipHash: string | null; userAgent: string | null },
) {
  const email = input.email.trim().toLowerCase();
  await enforceRateLimit(`login-ip:${ctx.ipHash ?? "unknown"}`, 30, 900);
  await enforceRateLimit(`login-email:${sha256Hex(email)}`, 10, 900);

  const user = await db.user.findUnique({ where: { email }, include: { roles: true } });
  if (!user || user.status !== "ACTIVE") {
    // Equalise timing with a dummy verification.
    await verifyPassword(await timingDummy(), input.password);
    throw unauthenticated(GENERIC_LOGIN_ERROR);
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw unauthenticated("This account is temporarily locked after repeated failed sign-ins. Try again later or reset your password.");
  }
  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed,
        lockedUntil: failed >= LOCK_THRESHOLD ? new Date(Date.now() + LOCK_MINUTES * 60e3) : null,
      },
    });
    await audit({ actorId: user.id, action: "user.login_failed", entityType: "User", entityId: user.id, ipHash: ctx.ipHash });
    throw unauthenticated(GENERIC_LOGIN_ERROR);
  }
  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await clearRateLimit(`login-email:${sha256Hex(email)}`);
  const staff = isStaff(user.roles.map((r) => r.role));
  const session = await createSession(user.id, { staff, userAgent: ctx.userAgent, ipHash: ctx.ipHash });
  await audit({ actorId: user.id, action: "user.login", entityType: "User", entityId: user.id, ipHash: ctx.ipHash });
  return { ...session, mfaRequired: !!user.mfaEnabledAt, userId: user.id, staff };
}

export async function requestPasswordReset(emailInput: string, ctx: { ipHash: string | null }) {
  const email = emailInput.trim().toLowerCase();
  await enforceRateLimit(`reset-ip:${ctx.ipHash ?? "unknown"}`, 10, 3600);
  await enforceRateLimit(`reset-email:${sha256Hex(email)}`, 3, 3600);
  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE") return null; // same response either way
  const token = randomToken(32);
  await db.$transaction(async (tx) => {
    await tx.emailToken.updateMany({ where: { userId: user.id, purpose: "RESET_PASSWORD", usedAt: null }, data: { usedAt: new Date() } });
    await tx.emailToken.create({
      data: { userId: user.id, purpose: "RESET_PASSWORD", tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + 3600e3) },
    });
    await notify(tx, {
      userId: user.id,
      to: user.email,
      template: "password_reset",
      params: { name: user.name, url: `${env().APP_BASE_URL}/reset-password?token=${token}` },
      dedupeKey: `reset:${sha256Hex(token)}`,
    });
  });
  return token; // for tests only
}

export async function resetPassword(token: string, newPassword: string) {
  const record = await db.emailToken.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { user: true } });
  if (!record || record.purpose !== "RESET_PASSWORD" || record.usedAt || record.expiresAt < new Date()) {
    throw invalid("This reset link is invalid or has expired. Please request a new one.");
  }
  const problem = passwordProblem(newPassword, record.user.email);
  if (problem) throw invalid(problem);
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction(async (tx) => {
    await tx.emailToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    await tx.user.update({
      where: { id: record.userId },
      // Completing a reset proves control of the mailbox.
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null, emailVerifiedAt: record.user.emailVerifiedAt ?? new Date() },
    });
    await audit({ actorId: record.userId, action: "user.password_reset", entityType: "User", entityId: record.userId }, tx);
  });
  await invalidateAllUserSessions(record.userId);
}

export async function changePassword(actor: Actor, current: string, next: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!(await verifyPassword(user.passwordHash, current))) throw invalid("Your current password is incorrect.");
  const problem = passwordProblem(next, user.email);
  if (problem) throw invalid(problem);
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  await db.session.deleteMany({ where: { userId: user.id, NOT: { id: actor.sessionId ?? "" } } });
  await audit({ actorId: user.id, action: "user.password_change", entityType: "User", entityId: user.id });
}

// ── MFA (TOTP) ──

export async function beginMfaSetup(actor: Actor) {
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (user.mfaEnabledAt) throw conflict("Two-step verification is already enabled.");
  const secret = generateTotpSecret();
  await db.user.update({ where: { id: user.id }, data: { mfaSecretEnc: encryptSecret(secret) } });
  return { secret, uri: otpauthUri(secret, user.email) };
}

export async function confirmMfaSetup(actor: Actor, code: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!user.mfaSecretEnc || user.mfaEnabledAt) throw invalid("Start two-step verification setup first.");
  if (!verifyTotp(decryptSecret(user.mfaSecretEnc), code.trim())) throw invalid("That code is not correct. Check your authenticator app's time and try again.");
  await db.user.update({ where: { id: user.id }, data: { mfaEnabledAt: new Date() } });
  if (actor.sessionId) await db.session.update({ where: { id: actor.sessionId }, data: { mfaVerifiedAt: new Date() } });
  await audit({ actorId: user.id, action: "user.mfa_enabled", entityType: "User", entityId: user.id });
}

/** Verify a TOTP code for the current session (sign-in second factor or step-up). */
export async function verifyMfaForSession(actor: { userId: string; sessionId: string | null }, code: string) {
  if (!actor.sessionId) throw unauthenticated();
  await enforceRateLimit(`mfa:${actor.userId}`, 6, 900);
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!user.mfaSecretEnc || !user.mfaEnabledAt) throw invalid("Two-step verification is not enabled.");
  if (!verifyTotp(decryptSecret(user.mfaSecretEnc), code.trim())) {
    await audit({ actorId: user.id, action: "user.mfa_failed", entityType: "User", entityId: user.id });
    throw invalid("That code is not correct.");
  }
  await db.session.update({ where: { id: actor.sessionId }, data: { mfaVerifiedAt: new Date() } });
  await audit({ actorId: user.id, action: "user.mfa_verified", entityType: "User", entityId: user.id });
}

/** Let a signed-in user add another self-service role (e.g. a donor who also needs help). */
export async function addSelfServiceRole(actor: Actor, role: (typeof SELF_SERVICE_ROLES)[number]) {
  if (!SELF_SERVICE_ROLES.includes(role)) throw invalid("That role cannot be added here.");
  await db.userRole.upsert({ where: { userId_role: { userId: actor.userId, role } }, create: { userId: actor.userId, role }, update: {} });
  await audit({ actorId: actor.userId, action: "role.self_add", entityType: "User", entityId: actor.userId, metadata: { role } });
}
