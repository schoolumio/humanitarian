import { db } from "../db";
import { rateLimited } from "../errors";

/**
 * Fixed-window rate limiter backed by Postgres so it works across serverless instances
 * without additional infrastructure. Atomic via INSERT … ON CONFLICT.
 */
export async function consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; count: number }> {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "rate_limit_buckets" ("key", "windowStart", "count")
    VALUES (${key}, now(), 1)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "rate_limit_buckets"."windowStart" < now() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE "rate_limit_buckets"."count" + 1 END,
      "windowStart" = CASE WHEN "rate_limit_buckets"."windowStart" < now() - make_interval(secs => ${windowSeconds}) THEN now() ELSE "rate_limit_buckets"."windowStart" END
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 0);
  return { allowed: count <= limit, count };
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number, message?: string) {
  const { allowed } = await consumeRateLimit(key, limit, windowSeconds);
  if (!allowed) throw rateLimited(message);
}

export async function clearRateLimit(key: string) {
  await db.rateLimitBucket.deleteMany({ where: { key } });
}
