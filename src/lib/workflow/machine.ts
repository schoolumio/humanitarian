import type { Permission } from "../permissions";

/**
 * Who may trigger a transition:
 *  - a Permission held by the acting staff member,
 *  - "OWNER" (the applicant who owns the record), or
 *  - "SYSTEM" (trusted server processes such as verified payment webhooks).
 */
export type TransitionActor = Permission | "OWNER" | "SYSTEM";

export type TransitionTable<S extends string> = Record<S, Partial<Record<S, readonly TransitionActor[]>>>;

export class InvalidTransitionError extends Error {
  constructor(entity: string, from: string, to: string) {
    super(`${entity} cannot move from ${from} to ${to}.`);
    this.name = "InvalidTransitionError";
  }
}

export function allowedActors<S extends string>(table: TransitionTable<S>, from: S, to: S) {
  return table[from]?.[to] ?? null;
}

export function canTransition<S extends string>(
  table: TransitionTable<S>,
  from: S,
  to: S,
  actor: { permissions: ReadonlySet<Permission>; isOwner?: boolean; isSystem?: boolean },
): boolean {
  const actors = allowedActors(table, from, to);
  if (!actors) return false;
  return actors.some((a) =>
    a === "SYSTEM" ? !!actor.isSystem : a === "OWNER" ? !!actor.isOwner : actor.permissions.has(a),
  );
}

export function assertTransition<S extends string>(
  entity: string,
  table: TransitionTable<S>,
  from: S,
  to: S,
) {
  if (!allowedActors(table, from, to)) throw new InvalidTransitionError(entity, from, to);
}

export function nextStates<S extends string>(table: TransitionTable<S>, from: S): S[] {
  return Object.keys(table[from] ?? {}) as S[];
}
