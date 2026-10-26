import { enqueueJob } from "@/lib/jobs/queue";
import { db } from "@/lib/db";
import { safeEqual } from "@/lib/crypto";
import { runDueJobs } from "@/server/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Called by Vercel Cron (Authorization: Bearer CRON_SECRET). Drains due background jobs. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const hour = new Date().toISOString().slice(0, 13);
  await enqueueJob(db, "sweep_stale_payments", {}, { dedupeKey: `sweep:${hour}` });
  await enqueueJob(db, "cleanup_expired", {}, { dedupeKey: `cleanup:${new Date().toISOString().slice(0, 10)}` });
  const result = await runDueJobs(50);
  return Response.json(result);
}
