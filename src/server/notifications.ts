import { db, type Tx } from "@/lib/db";
import { env } from "@/lib/env";
import { enqueueJob } from "@/lib/jobs/queue";
import { emailProvider } from "@/lib/email/provider";
import { renderTemplate, type TemplateName } from "@/lib/email/templates";

/**
 * Queue a notification (transactional outbox). Deduplicated by `dedupeKey`, so retried
 * webhooks or double-clicks never send the same message twice.
 */
export async function notify(
  tx: Tx,
  input: { userId?: string | null; to: string; template: TemplateName; params: Record<string, string>; dedupeKey: string },
) {
  const existing = await tx.notification.findUnique({ where: { dedupeKey: input.dedupeKey } });
  if (existing) return existing;
  const n = await tx.notification.create({
    data: {
      userId: input.userId ?? null,
      toEmail: input.to,
      template: input.template,
      params: input.params,
      dedupeKey: input.dedupeKey,
    },
  });
  await enqueueJob(tx, "send_notification", { notificationId: n.id }, { dedupeKey: `notify:${n.id}` });
  return n;
}

/** Notify every active holder of a staff role (internal alerts). */
export async function notifyRole(
  tx: Tx,
  role: "CASE_MANAGER" | "FINANCE_OFFICER" | "SAFEGUARDING_OFFICER" | "MEDIA_EDITOR" | "ADMIN",
  input: { title: string; body: string; path?: string; dedupeKey: string },
) {
  const holders = await tx.userRole.findMany({ where: { role, user: { status: "ACTIVE" } }, include: { user: true } });
  for (const h of holders) {
    await notify(tx, {
      userId: h.userId,
      to: h.user.email,
      template: "staff_alert",
      params: { title: input.title, body: input.body, path: input.path ?? "/staff" },
      dedupeKey: `${input.dedupeKey}:${h.userId}`,
    });
  }
}

/** Job handler: send one notification. Throws on failure so the job is retried with backoff. */
export async function sendNotification(notificationId: string) {
  const n = await db.notification.findUnique({ where: { id: notificationId } });
  if (!n || n.status === "SENT_TO_PROVIDER" || n.status === "DELIVERED") return;
  const rendered = renderTemplate(n.template as TemplateName, n.params as Record<string, string>, env().APP_BASE_URL);
  try {
    const result = await emailProvider().send({ to: n.toEmail, ...rendered, idempotencyKey: `notification-${n.id}` });
    await db.notification.update({
      where: { id: n.id },
      data: { status: "SENT_TO_PROVIDER", providerMessageId: result.providerMessageId, sentAt: new Date(), attempts: { increment: 1 }, lastError: null },
    });
  } catch (err) {
    await db.notification.update({
      where: { id: n.id },
      data: { status: "FAILED", attempts: { increment: 1 }, lastError: err instanceof Error ? err.message.slice(0, 500) : "error" },
    });
    throw err;
  }
}
