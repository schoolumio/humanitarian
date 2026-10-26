import { claimJobs, completeJob, failJob } from "@/lib/jobs/queue";
import { logger } from "@/lib/logger";
import { sendNotification } from "./notifications";

type Handler = (payload: Record<string, unknown>) => Promise<void>;

const handlers: Record<string, Handler> = {
  send_notification: async (p) => sendNotification(String(p.notificationId)),
  reconcile_payment: async (p) => {
    const { reconcilePaymentByReference } = await import("./services/payments");
    await reconcilePaymentByReference(String(p.reference));
  },
  sweep_stale_payments: async () => {
    const { sweepStalePayments } = await import("./services/payments");
    await sweepStalePayments();
  },
  refund_submit: async (p) => {
    const { submitRefundToProvider } = await import("./services/refunds");
    await submitRefundToProvider(String(p.refundId));
  },
  cleanup_expired: async () => {
    const { db } = await import("@/lib/db");
    await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await db.emailToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * 864e5) } } });
    await db.rateLimitBucket.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 864e5) } } });
  },
};

export async function runDueJobs(limit = 25) {
  const jobs = await claimJobs(limit);
  let succeeded = 0;
  let failed = 0;
  for (const job of jobs) {
    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`No handler for job type ${job.type}`);
      await handler((job.payload ?? {}) as Record<string, unknown>);
      await completeJob(job.id);
      succeeded++;
    } catch (err) {
      failed++;
      logger.error("job.failed", { jobId: job.id, type: job.type, error: err });
      await failJob(job, err instanceof Error ? err.message : String(err));
    }
  }
  return { claimed: jobs.length, succeeded, failed };
}
