import { getActor } from "@/server/current-user";
import { getDownloadUrl } from "@/server/services/files";
import { AppError, toSafeMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** Authorised access to a private file: checks permissions, audits, then redirects to a short-lived signed URL. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const url = await getDownloadUrl(await getActor(), id);
    return new Response(null, {
      status: 302,
      headers: { Location: url, "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    const status =
      err instanceof AppError
        ? err.code === "UNAUTHENTICATED"
          ? 401
          : err.code === "CONFLICT"
            ? 409
            : 404
        : 500;
    return Response.json({ error: toSafeMessage(err) }, { status });
  }
}
