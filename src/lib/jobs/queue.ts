import type { Prisma } from "@prisma/client";
import { db, type Tx } from "../db";

/**
 * Durable background jobs stored in Postgres. Jobs are enqueued inside the same
 * transaction as the business change (transactional outbox), then drained by
 * /api/cron/jobs (Vercel Cron) or `npm run jobs:run`.
 */
export async function enqueueJob(
  tx: Tx,
  type: string,
  payload: Prisma.InputJsonValue,
  opts: { dedupeKey?: string; runAt?: Date; maxAttempts?: number } = {},
) {
  if (opts.dedupeKey) {
    const existing = await tx.backgroundJob.findUnique({ where: { dedupeKey: opts.dedupeKey } });
    if (existing) return existing;
  }
  return tx.backgroundJob.create({
    data: {
      type,
      payload,
      dedupeKey: opts.dedupeKey,
      runAt: opts.runAt ?? new Date(),
      maxAttempts: opts.maxAttempts ?? 5,
    },
  });
}

export type ClaimedJob = {
  id: string;
  type: string;
  payload: Prisma.JsonValue;
  attempts: number;
  maxAttempts: number;
};

/** Atomically claim due jobs; concurrent runners never receive the same job. Stale locks (>10 min) are reclaimed. */
export async function claimJobs(limit: number): Promise<ClaimedJob[]> {
  return db.$queryRaw<ClaimedJob[]>`
    UPDATE "background_jobs" SET "status" = 'RUNNING', "lockedAt" = now(), "attempts" = "attempts" + 1
    WHERE "id" IN (
      SELECT "id" FROM "background_jobs"
      WHERE ("status" IN ('PENDING','FAILED') AND "runAt" <= now())
         OR ("status" = 'RUNNING' AND "lockedAt" < now() - interval '10 minutes')
      ORDER BY "runAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "type", "payload", "attempts", "maxAttempts"`;
}

export async function completeJob(id: string) {
  await db.backgroundJob.update({
    where: { id },
    data: { status: "SUCCEEDED", finishedAt: new Date(), lockedAt: null, lastError: null },
  });
}

export async function failJob(job: ClaimedJob, error: string) {
  const dead = job.attempts >= job.maxAttempts;
  const backoffMs = Math.min(2 ** job.attempts * 60_000, 6 * 60 * 60_000);
  await db.backgroundJob.update({
    where: { id: job.id },
    data: {
      status: dead ? "DEAD" : "FAILED",
      lastError: error.slice(0, 1000),
      lockedAt: null,
      runAt: new Date(Date.now() + backoffMs),
      finishedAt: dead ? new Date() : null,
    },
  });
}
