import Link from "@/components/ui/link";
import { ContentPage } from "@/components/public/content";
import { ButtonLink } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { runAction, type FormState } from "@/server/action";
import { getActor } from "@/server/current-user";
import { requireActor } from "@/server/actor";
import { addSelfServiceRole } from "@/server/services/auth";
import { createDraft, listOwnApplications } from "@/server/services/applications";

export const metadata = { title: "Request assistance" };
export const dynamic = "force-dynamic";

async function start(): Promise<FormState> {
  "use server";
  let to = "";
  const r = await runAction(async () => {
    const actor = requireActor(await getActor());
    if (!actor.roles.includes("APPLICANT")) {
      await addSelfServiceRole(actor, "APPLICANT");
      to = "/apply/start?added=1";
      return;
    }
    // Resume an unfinished request rather than creating duplicates.
    const draft = (await listOwnApplications(actor)).find((a) => a.status === "DRAFT");
    to = draft
      ? `/apply/${draft.reference}/step/${draft.draftStep}`
      : `/apply/${(await createDraft(actor)).reference}/step/1`;
  });
  return r?.ok ? { ...r, redirectTo: to } : r;
}

export default async function StartPage() {
  const actor = await getActor();
  return (
    <ContentPage
      title="Request assistance"
      intro="Tell us privately about your situation. It takes about 15 minutes and you can save and come back later."
    >
      <h2>Before you start</h2>
      <ul>
        <li>Your request is private. Nothing is published unless you later give separate permission.</li>
        <li>
          You do not need formal documents or a smartphone. Tell us what you have, and we will discuss other
          ways to verify your situation.
        </li>
        <li>Someone you trust, such as a community leader, may help you complete the form.</li>
        <li>Submitting a request does not guarantee approval. We will explain what happens at each stage.</li>
        <li>If you are in immediate danger, call 112.</li>
      </ul>
      <div className="mt-6 flex flex-wrap gap-3">
        {actor ? (
          <ActionForm action={start}>
            <SubmitButton variant="cta" pendingText="Opening…">
              {actor.roles.includes("APPLICANT")
                ? "Start or continue my request"
                : "Continue as an applicant"}
            </SubmitButton>
          </ActionForm>
        ) : (
          <>
            <ButtonLink href="/register?role=APPLICANT" variant="cta">
              Create an account to start
            </ButtonLink>
            <ButtonLink href="/login?next=/apply/start" variant="secondary">
              I already have an account
            </ButtonLink>
          </>
        )}
      </div>
      <p className="mt-4">
        Need help? <Link href="/contact">Contact us</Link>.
      </p>
    </ContentPage>
  );
}
