import { headers } from "next/headers";
import { ContentPage } from "@/components/public/content";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, inputClass } from "@/components/ui";
import { runAction, type FormState } from "@/server/action";
import { submitContactMessage } from "@/server/services/complaints";
import { hashIp } from "@/lib/crypto";

export const metadata = { title: "Contact" };

async function send(_: FormState, fd: FormData): Promise<FormState> {
  "use server";
  const h = await headers();
  return runAction(async () => {
    await submitContactMessage(Object.fromEntries(fd), {
      ipHash: hashIp(h.get("x-forwarded-for")?.split(",")[0] ?? null),
    });
    return "Thank you. We will reply by email.";
  });
}

export default function ContactPage() {
  return (
    <ContentPage
      title="Contact us"
      intro="Questions, help completing an application, partnerships or media enquiries."
    >
      <p>
        If someone is in immediate danger, call 112. To report a safeguarding concern or make a complaint, use
        the <a href="/complaints/new">complaints form</a>.
      </p>
      <div className="not-prose mt-4 max-w-xl">
        <ActionForm action={send} resetOnSuccess>
          <Field label="Your name" name="name">
            <input id="name" name="name" className={inputClass} autoComplete="name" />
          </Field>
          <Field label="Email" name="email">
            <input id="email" name="email" type="email" className={inputClass} autoComplete="email" />
          </Field>
          <Field label="Topic" name="topic">
            <select id="topic" name="topic" className={inputClass}>
              <option value="GENERAL">General question</option>
              <option value="APPLY_HELP">Help with an application</option>
              <option value="DONATION">Donations</option>
              <option value="PARTNERSHIP">Partnerships</option>
              <option value="MEDIA">Media</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>
          <Field
            label="Message"
            name="message"
            hint="Please do not include sensitive personal information here."
          >
            <textarea id="message" name="message" rows={5} className={inputClass} />
          </Field>
          <SubmitButton pendingText="Sending…">Send message</SubmitButton>
        </ActionForm>
      </div>
    </ContentPage>
  );
}
