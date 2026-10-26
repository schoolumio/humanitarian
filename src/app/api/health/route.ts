import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe. Reports only coarse status – never configuration or errors. */
export async function GET() {
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", database: "ok", latencyMs: Date.now() - started });
  } catch {
    return Response.json({ status: "degraded", database: "unavailable" }, { status: 503 });
  }
}
