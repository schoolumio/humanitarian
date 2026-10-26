import { env } from "../env";
import { logger } from "../logger";

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
};
export type SendResult = { providerMessageId: string | null };

export interface EmailProvider {
  name: string;
  send(msg: OutgoingEmail): Promise<SendResult>;
}

/** Development provider: logs metadata only. Message bodies are kept in the outbox table for local testing. */
const logProvider: EmailProvider = {
  name: "log",
  async send(msg) {
    logger.info("email.log_provider", { to: msg.to, subject: msg.subject });
    return { providerMessageId: null };
  },
};

const resendProvider: EmailProvider = {
  name: "resend",
  async send(msg) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env().RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": msg.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({
        from: env().EMAIL_FROM_ADDRESS,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}`);
    const body = (await res.json()) as { id?: string };
    return { providerMessageId: body.id ?? null };
  },
};

export function emailProvider(): EmailProvider {
  return env().EMAIL_PROVIDER === "resend" ? resendProvider : logProvider;
}
