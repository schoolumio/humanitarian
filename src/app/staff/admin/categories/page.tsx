import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { Badge, Card, Field, PageHeader, Section, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { getActor, requirePagePermission } from "@/server/current-user";
import { requireActor } from "@/server/actor";
import { runAction, type FormState } from "@/server/action";
import { upsertCategory } from "@/server/services/admin";

export const metadata = { title: "Support categories" };

function CategoryForm({ action, c }: { action: (s: FormState, fd: FormData) => Promise<FormState>; c?: { name: string; slug: string; description: string; active: boolean; verificationChecklist: unknown } }) {
  const checklist = ((c?.verificationChecklist as { stage: string; label: string }[]) ?? []).map((i) => `${i.stage}: ${i.label}`).join("\n");
  return (
    <ActionForm action={action}>
      <Field label="Name" name="name"><input id="name" name="name" defaultValue={c?.name} className={inputClass} /></Field>
      <Field label="Slug" name="slug"><input id="slug" name="slug" defaultValue={c?.slug} className={inputClass} /></Field>
      <Field label="Description" name="description"><textarea id="description" name="description" rows={2} defaultValue={c?.description} className={inputClass} /></Field>
      <Field label="Category-specific verification checklist" name="checklist" hint="One per line: STAGE: label (STAGE = SCREENING, REMOTE, FIELD or REVIEW)."><textarea id="checklist" name="checklist" rows={4} defaultValue={checklist} className={inputClass} /></Field>
      <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={c?.active ?? true} className="h-5 w-5" /> Active</label>
      <SubmitButton variant="secondary">Save</SubmitButton>
    </ActionForm>
  );
}

export default async function CategoriesAdmin() {
  await requirePagePermission("admin.categories");
  const cats = await db.caseCategory.findMany({ orderBy: { sortOrder: "asc" } });
  async function save(id: string | null, _: FormState, fd: FormData): Promise<FormState> { "use server"; return runAction(async () => { await upsertCategory(requireActor(await getActor()), id, Object.fromEntries(fd)); revalidatePath("/staff/admin/categories"); return "Saved."; }); }
  return (
    <div>
      <PageHeader title="Support categories" description="Checklists here are added to the standard screening and remote-verification checks for new applications." />
      <div className="grid gap-4 lg:grid-cols-2">
        {cats.map((c) => <Card key={c.id}><p className="mb-2 font-semibold">{c.name} {!c.active && <Badge>inactive</Badge>}</p><CategoryForm action={save.bind(null, c.id)} c={c} /></Card>)}
      </div>
      <Section title="Add category"><Card><CategoryForm action={save.bind(null, null)} /></Card></Section>
    </div>
  );
}
