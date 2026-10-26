import { z } from "zod";
import { recordScanResult } from "@/server/services/files";
import { safeEqual } from "@/lib/crypto";

export const dynamic = "force-dynamic";

/**
 * Callback for an external malware scanner (MALWARE_SCAN_MODE=external). Authenticated with
 * a shared bearer secret (SCAN_WEBHOOK_SECRET). See docs/security.md.
 */
export async function POST(request: Request) {
  const secret = process.env.SCAN_WEBHOOK_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  const body = z
    .object({ fileId: z.string().min(1), clean: z.boolean() })
    .safeParse(await request.json().catch(() => null));
  if (!body.success) return new Response("Bad request", { status: 400 });
  try {
    await recordScanResult(body.data.fileId, body.data.clean);
    return Response.json({ ok: true });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
