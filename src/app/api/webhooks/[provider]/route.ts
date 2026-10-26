import { processWebhook } from "@/server/services/payments";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Payment provider webhooks. The raw body is read as text so the signature is verified over
 * the exact bytes received. Only the configured provider is accepted.
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== env().PAYMENT_PROVIDER) return new Response("Not found", { status: 404 });
  const raw = await request.text();
  if (raw.length > 512 * 1024) return new Response("Payload too large", { status: 413 });
  const result = await processWebhook(provider, raw, request.headers);
  return Response.json({ received: result.status === 200 }, { status: result.status });
}
