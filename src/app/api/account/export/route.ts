import { getActor } from "@/server/current-user";
import { exportOwnData } from "@/server/services/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getActor();
  if (!actor) return new Response("Unauthorized", { status: 401 });
  const data = await exportOwnData(actor);
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="kindspring-my-data.json"', "Cache-Control": "private, no-store" },
  });
}
