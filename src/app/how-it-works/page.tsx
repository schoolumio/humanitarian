import Link from "next/link";
import { ContentPage } from "@/components/public/content";

export const metadata = { title: "How it works" };

export default function HowItWorks() {
  return (
    <ContentPage title="How KindSpring works" intro="From a private request to verified, evidenced support.">
      <h2>1. A private request</h2>
      <p>People request assistance through a short, guided form. Nothing is published. You do not need a smartphone, formal paperwork or a bank account to apply – we offer alternative ways to verify your situation, and a community contact can help you fill in the form.</p>
      <h2>2. Staged verification</h2>
      <p>Our team checks the request is complete, looks for duplicates and assesses urgency. We then verify remotely (a call, a video call, supporting evidence, references you allow us to contact). A field visit is arranged only when the risk or gaps in evidence justify it.</p>
      <h2>3. Independent review and decision</h2>
      <p>A reviewer who did not investigate the case recommends a decision. An authorised case manager records the final decision and the reasons. Risk indicators help us prioritise human review – they never decide on their own, and AI never makes eligibility decisions.</p>
      <h2>4. Funding</h2>
      <p>Approved cases can be funded by individuals, by a sponsor, by in-kind goods and services, or a combination. A case only appears publicly if the person consented to a public page; otherwise it may be shared privately with approved sponsors or funded directly.</p>
      <h2>5. Delivery and evidence</h2>
      <p>We pay suppliers directly where possible, with independent approval of every payment. Delivery is evidenced and the outcome is reviewed by someone other than the case manager before a case is marked complete.</p>
      <h2>6. Reporting</h2>
      <p>Contributors and sponsors receive updates. Stories and photos are published only with the person&apos;s separate, specific consent and editorial approval.</p>
      <p><Link href="/apply/start">Request assistance</Link> · <Link href="/cases">Explore verified cases</Link></p>
    </ContentPage>
  );
}
