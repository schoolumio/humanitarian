import { revalidatePath } from "next/cache";
import { Badge, Card, EmptyState, PageHeader, formatDate, humanize } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { getActor, requirePagePermission } from "@/server/current-user";
import { requireActor } from "@/server/actor";
import { runAction, type FormState } from "@/server/action";
import { listContactMessages, markContactHandled } from "@/server/services/complaints";

export const metadata = { title: "Contact messages" };

export default async function ContactAdmin() {
  const actor = await requirePagePermission("admin.contact");
  const rows = await listContactMessages(actor);
  async function handled(id: string): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await markContactHandled(requireActor(await getActor()), id);
      revalidatePath("/staff/admin/contact");
      return "Marked handled.";
    });
  }
  return (
    <div>
      <PageHeader title="Contact messages" />
      {rows.length ? (
        <div className="flex flex-col gap-3">
          {rows.map((m) => (
            <Card key={m.id}>
              <p className="text-sm text-muted">
                {formatDate(m.createdAt, true)} · {humanize(m.topic)}{" "}
                {m.handled && <Badge tone="success">handled</Badge>}
              </p>
              <p className="font-semibold">
                {m.name} &lt;{m.email}&gt;
              </p>
              <p className="mt-1 whitespace-pre-line">{m.message}</p>
              {!m.handled && (
                <ActionForm action={handled.bind(null, m.id)} className="mt-2">
                  <SubmitButton variant="ghost">Mark handled</SubmitButton>
                </ActionForm>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No messages" />
      )}
    </div>
  );
}
