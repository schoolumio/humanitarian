import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Severity } from "@prisma/client";
import { AppError } from "@/lib/errors";
import {
  Badge,
  Card,
  DefinitionList,
  Field,
  PageHeader,
  Section,
  formatDate,
  humanize,
  inputClass,
} from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { requirePagePermission } from "@/server/current-user";
import { runAction, currentActor, str, type FormState } from "@/server/action";
import { createSafeguardingRecord, getComplaint, updateComplaint } from "@/server/services/complaints";

export const metadata = { title: "Complaint" };

export default async function ComplaintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePagePermission("complaint.manage");
  let data;
  try {
    data = await getComplaint(actor, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const { c, history } = data;
  async function update(_: FormState, fd: FormData): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await updateComplaint(await currentActor(), id, {
        status: str(fd, "status") as "INVESTIGATING",
        resolution: str(fd, "resolution") || undefined,
        severity: (str(fd, "severity") || undefined) as Severity | undefined,
      });
      revalidatePath(`/staff/complaints/${id}`);
      return "Updated.";
    });
  }
  async function safeguard(_: FormState, fd: FormData): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await createSafeguardingRecord(await currentActor(), { ...Object.fromEntries(fd), complaintId: id });
      revalidatePath(`/staff/complaints/${id}`);
      return "Safeguarding record opened.";
    });
  }
  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`Complaint ${c.reference}`}
        description={
          <>
            <Badge>{humanize(c.status)}</Badge>{" "}
            {c.isSafeguarding && <Badge tone="danger">safeguarding – restricted</Badge>}
          </>
        }
      />
      <Card>
        <DefinitionList
          items={[
            ["Received", formatDate(c.createdAt, true)],
            ["From", `${c.contactName} (${humanize(c.complainantRole)}) – ${c.contactEmail}`],
            ["Category", humanize(c.category)],
            ["Severity", c.severity],
            ["Subject", c.subject],
            [
              "Description",
              <span key="d" className="whitespace-pre-line">
                {c.description}
              </span>,
            ],
            ["Related reference", c.relatedReference],
            ["Resolution", c.resolution],
          ]}
        />
      </Card>
      <Section title="Update">
        <Card>
          <ActionForm action={update}>
            <Field label="Status" name="status">
              <select id="status" name="status" className={inputClass}>
                <option value="INVESTIGATING">Investigating</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>
            </Field>
            <Field label="Severity" name="severity">
              <select id="severity" name="severity" defaultValue={c.severity} className={inputClass}>
                <option>LOW</option>
                <option>MEDIUM</option>
                <option>HIGH</option>
                <option>CRITICAL</option>
              </select>
            </Field>
            <Field
              label="Resolution (required to resolve or close)"
              name="resolution"
              hint="Document findings, actions taken and how the complainant was informed."
            >
              <textarea id="resolution" name="resolution" rows={4} className={inputClass} />
            </Field>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </Card>
      </Section>
      {actor.permissions.has("safeguarding.manage") && (
        <Section title="Safeguarding records">
          {c.safeguarding.map((s) => (
            <Card key={s.id} className="mb-2">
              <p>
                <Badge tone="danger">{s.severity}</Badge> {s.status}
              </p>
              <p className="mt-1 whitespace-pre-line">{s.summary}</p>
            </Card>
          ))}
          <details>
            <summary className="cursor-pointer font-semibold text-brand">Open a safeguarding record</summary>
            <Card className="mt-2">
              <ActionForm action={safeguard}>
                <select name="severity" className={inputClass} aria-label="Severity">
                  <option>MEDIUM</option>
                  <option>HIGH</option>
                  <option>CRITICAL</option>
                  <option>LOW</option>
                </select>
                <textarea
                  name="summary"
                  rows={3}
                  className={inputClass}
                  aria-label="Summary"
                  placeholder="Summary of the concern"
                />
                <textarea
                  name="actionsTaken"
                  rows={2}
                  className={inputClass}
                  aria-label="Immediate actions"
                  placeholder="Immediate actions taken"
                />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="restrictPublication" defaultChecked className="h-5 w-5" />{" "}
                  Restrict publication of linked cases
                </label>
                <SubmitButton>Create</SubmitButton>
              </ActionForm>
            </Card>
          </details>
        </Section>
      )}
      <Section title="History">
        <ol className="text-sm">
          {history.map((h) => (
            <li key={h.id}>
              {formatDate(h.createdAt, true)} · {humanize(h.toStatus)}
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
