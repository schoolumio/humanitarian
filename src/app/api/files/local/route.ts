import { storage, verifyLocalSignature } from "@/lib/storage";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Development storage only: serves a private object for a valid, unexpired HMAC-signed URL. */
export async function GET(request: Request) {
  if (env().STORAGE_DRIVER !== "local") return new Response("Not found", { status: 404 });
  const params = new URL(request.url).searchParams;
  const key = verifyLocalSignature(params);
  if (!key) return new Response("Link expired or invalid", { status: 403 });
  try {
    const body = await storage().get(key, "PRIVATE");
    const filename = (params.get("fn") ?? "file").replace(/[^\w.\- ()]/g, "_");
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": params.get("ct") ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
