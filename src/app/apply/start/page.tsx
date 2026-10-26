import Link from "next/link";
import { redirect } from "next/navigation";
import { ContentPage } from "@/components/public/content";
import { Button, ButtonLink } from "@/components/ui";
import { getActor } from "@/server/current-user";
import { requireActor } from "@/server/actor";
import { addSelfServiceRole } from "@/server/services/auth";
import { createDraft } from "@/server/services/applications";

export const metadata = { title: "Request assistance" };
export const dynamic = "force-dynamic";

async function start() {
  "use server";
  const actor = requireActor(await getActor());
  if (!actor.roles.includes("APPLICANT")) {
    await addSelfServiceRole(actor, "APPLICANT");
    redirect("/apply/start?added=1");
  }
  const app = await createDraft(actor);
  redirect(`/apply/${app.reference}/step/1`);
}

export default async function StartPage() {
  const actor = await getActor();
  return (
    <ContentPage title="Request assistance" intro="Tell us privately about your situation. It takes about 15 minutes and you can save and come back later.">
      <h2>Before you start</h2>
      <ul>
        <li>Your request is private. Nothing is published unless you later give separate permission.</li>
        <li>You do not need formal documents or a smartphone. Tell us what you have, and we will discuss other ways to verify your situation.</li>
        <li>Someone you trust, such as a community leader, may help you complete the form.</li>
        <li>Submitting a request does not guarantee approval. We will explain what happens at each stage.</li>
        <li>If you are in immediate danger, call 112.</li>
      </ul>
      <div className="mt-6 flex flex-wrap gap-3">
        {actor ? (
          <form action={start}>
            <Button variant="cta">{actor.roles.includes("APPLICANT") ? "Start my request" : "Continue as an applicant"}</Button>
          </form>
        ) : (
          <>
            <ButtonLink href="/register?role=APPLICANT" variant="cta">Create an account to start</ButtonLink>
            <ButtonLink href="/login?next=/apply/start" variant="secondary">I already have an account</ButtonLink>
          </>
        )}
      </div>
      <p className="mt-4">Need help? <Link href="/contact">Contact us</Link>.</p>
    </ContentPage>
  );
}
