import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { env } from "@/lib/env";

/** Development storage only: serves approved PUBLIC media (production uses the public bucket/CDN). */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  if (env().STORAGE_DRIVER !== "local") return new Response("Not found", { status: 404 });
  const { key } = await params;
  const file = await db.storedFile.findUnique({ where: { storageKey: key } });
  if (!file || file.visibility !== "PUBLIC" || file.deletedAt) return new Response("Not found", { status: 404 });
  try {
    const body = await storage().get(key, "PUBLIC");
    return new Response(new Uint8Array(body), {
      headers: { "Content-Type": file.mimeType, "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
