import { headers } from "next/headers";
import { ContentPage } from "@/components/public/content";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, inputClass } from "@/components/ui";
import { runAction, type FormState } from "@/server/action";
import { submitComplaint } from "@/server/services/complaints";
import { getActor } from "@/server/current-user";
import { hashIp } from "@/lib/crypto";

export const metadata = { title: "Make a complaint or report a concern" };

async function send(_: FormState, fd: FormData): Promise<FormState> {
  "use server";
  const h = await headers();
  return runAction(async () => {
    const c = await submitComplaint(await getActor(), Object.fromEntries(fd), {
      ipHash: hashIp(h.get("x-forwarded-for")?.split(",")[0] ?? null),
    });
    return `Thank you. Your reference is ${c.reference}. We have emailed you a confirmation.`;
  });
}

export default async function NewComplaintPage() {
  const actor = await getActor();
  return (
    <ContentPage
      title="Make a complaint or report a concern"
      intro="Applicants, beneficiaries, donors, sponsors, staff and members of the public can all raise concerns."
    >
      <p>
        <strong>If someone is in immediate danger, call 112 first.</strong> Safeguarding concerns are seen
        only by our safeguarding officers.
      </p>
      <div className="mt-4">
        <ActionForm action={send} resetOnSuccess>
          <Field label="Your name" name="contactName">
            <input id="contactName" name="contactName" defaultValue={actor?.name} className={inputClass} />
          </Field>
          <Field label="Email for our reply" name="contactEmail">
            <input
              id="contactEmail"
              name="contactEmail"
              type="email"
              defaultValue={actor?.email}
              className={inputClass}
            />
          </Field>
          <Field label="You are a…" name="complainantRole">
            <select id="complainantRole" name="complainantRole" className={inputClass}>
              <option value="APPLICANT">Applicant</option>
              <option value="BENEFICIARY">Beneficiary</option>
              <option value="DONOR">Donor</option>
              <option value="SPONSOR">Sponsor</option>
              <option value="PUBLIC">Member of the public</option>
              <option value="STAFF">Staff member or volunteer</option>
            </select>
          </Field>
          <Field label="What is it about?" name="category">
            <select id="category" name="category" className={inputClass}>
              <option value="SAFEGUARDING">
                Safeguarding – someone may be at risk of harm or exploitation
              </option>
              <option value="MISCONDUCT">Staff or volunteer misconduct</option>
              <option value="FRAUD">Suspected fraud</option>
              <option value="PRIVACY">Privacy or use of my information</option>
              <option value="PAYMENT">A payment or refund</option>
              <option value="SERVICE">Our service</option>
              <option value="OTHER">Something else</option>
            </select>
          </Field>
          <Field label="Subject" name="subject">
            <input id="subject" name="subject" className={inputClass} />
          </Field>
          <Field label="What happened?" name="description">
            <textarea id="description" name="description" rows={6} className={inputClass} />
          </Field>
          <Field
            label="Related reference (optional)"
            name="relatedReference"
            hint="For example an application or payment reference."
          >
            <input id="relatedReference" name="relatedReference" className={inputClass} />
          </Field>
          <SubmitButton pendingText="Sending…">Submit</SubmitButton>
        </ActionForm>
      </div>
    </ContentPage>
  );
}
