import { getActor } from "@/server/current-user";
import { uploadFile } from "@/server/services/files";
import { AppError, toSafeMessage } from "@/lib/errors";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Multipart upload into PRIVATE storage. Authorisation depends on the declared purpose. */
export async function POST(request: Request) {
  // CSRF: cookies are SameSite=Lax, and we additionally require a same-origin request.
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).host !== new URL(env().APP_BASE_URL).host) {
    return Response.json({ error: "Cross-site request rejected." }, { status: 403 });
  }
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Choose a file to upload." }, { status: 400 });
    const record = await uploadFile(await getActor(), {
      purpose: String(form.get("purpose") ?? ""),
      applicationId: (form.get("applicationId") as string) || null,
      file,
    });
    return Response.json({ file: record });
  } catch (err) {
    const status =
      err instanceof AppError
        ? (
            {
              FORBIDDEN: 403,
              NOT_FOUND: 404,
              UNAUTHENTICATED: 401,
              RATE_LIMITED: 429,
              CONFLICT: 409,
              VALIDATION: 400,
            } as const
          )[err.code]
        : 500;
    return Response.json({ error: toSafeMessage(err) }, { status });
  }
}
