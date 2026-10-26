import type { Role } from "@prisma/client";
import { env } from "@/lib/env";
import { forbidden, unauthenticated } from "@/lib/errors";
import { hasPermission, permissionsFor, STEP_UP_PERMISSIONS, type Permission } from "@/lib/permissions";
import { STEP_UP_VALIDITY_MS } from "@/lib/auth/session";

/** The authenticated principal on whose behalf a service call runs. */
export type Actor = {
  userId: string;
  email: string;
  name: string;
  roles: Role[];
  permissions: Set<Permission>;
  emailVerified: boolean;
  mfaEnabled: boolean;
  mfaVerifiedAt: Date | null;
  sessionId: string | null;
  ipHash?: string | null;
};

export function buildActor(
  user: {
    id: string;
    email: string;
    name: string;
    emailVerifiedAt: Date | null;
    mfaEnabledAt: Date | null;
    roles: { role: Role }[];
  },
  session?: { id: string; mfaVerifiedAt: Date | null; ipHash?: string | null },
): Actor {
  const roles = user.roles.map((r) => r.role);
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    roles,
    permissions: permissionsFor(roles),
    emailVerified: !!user.emailVerifiedAt,
    mfaEnabled: !!user.mfaEnabledAt,
    mfaVerifiedAt: session?.mfaVerifiedAt ?? null,
    sessionId: session?.id ?? null,
    ipHash: session?.ipHash ?? null,
  };
}

export function requireActor(actor: Actor | null): Actor {
  if (!actor) throw unauthenticated();
  return actor;
}

export function staffMfaRequired(): boolean {
  const v = process.env.STAFF_MFA_REQUIRED;
  if (v === "true") return true;
  if (v === "false") return false;
  return env().NODE_ENV === "production";
}

export function can(actor: Actor | null, permission: Permission): boolean {
  return !!actor && hasPermission(actor.roles, permission);
}

/**
 * Throws unless the actor holds `permission`. High-risk permissions also require a
 * recent MFA verification on the session when MFA is enabled for the user or
 * mandatory for staff (production default).
 */
export function requirePermission(actor: Actor | null, permission: Permission): Actor {
  const a = requireActor(actor);
  if (!a.permissions.has(permission)) throw forbidden();
  if (STEP_UP_PERMISSIONS.includes(permission)) requireStepUp(a);
  return a;
}

export function requireAnyPermission(actor: Actor | null, permissions: Permission[]): Actor {
  const a = requireActor(actor);
  if (!permissions.some((p) => a.permissions.has(p))) throw forbidden();
  return a;
}

export function requireStepUp(a: Actor) {
  const needed = a.mfaEnabled || staffMfaRequired();
  if (!needed) return;
  if (!a.mfaEnabled)
    throw forbidden("This action requires two-step verification. Set it up from your account page.");
  if (!a.mfaVerifiedAt || Date.now() - a.mfaVerifiedAt.getTime() > STEP_UP_VALIDITY_MS) {
    throw forbidden("Please confirm your identity with your authenticator code to continue.");
  }
}
