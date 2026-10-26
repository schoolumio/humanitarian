import Link from "next/link";
import { ContentPage } from "@/components/public/content";
import { ButtonLink } from "@/components/ui";

export const metadata = { title: "Corporate partnerships" };

export default function PartnersPage() {
  return (
    <ContentPage title="Corporate partnerships" intro="Fund verified interventions with clear budgets, evidence of delivery and honest reporting.">
      <h2>Ways to partner</h2>
      <ul>
        <li>Sponsor a complete verified intervention.</li>
        <li>Fund an approved portion of a case.</li>
        <li>Provide goods (furniture, food, building materials, business equipment) or professional services, training or transport.</li>
      </ul>
      <h2>The process</h2>
      <ol>
        <li>Register your organisation and authorised representatives. KindSpring reviews new organisations before granting access to case details.</li>
        <li>Browse eligible cases, filter by category, budget and location, and send an enquiry or proposal.</li>
        <li>We prepare an agreement, which is approved internally and then signed by your authorised representative.</li>
        <li>Pledged funds are recorded as pledges until payment is confirmed.</li>
        <li>You receive progress updates, a financial summary and an impact report.</li>
      </ol>
      <h2>Our standards</h2>
      <p>Sponsors never receive unrestricted access to beneficiaries&apos; personal information. Branding and story reuse are possible only where the beneficiary has consented and the agreement allows it. We do not produce humiliating content, stage events or make impact claims we cannot evidence.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href="/register?role=SPONSOR" variant="cta">Register your organisation</ButtonLink>
        <Link href="/contact" className="inline-flex min-h-11 items-center">Talk to our partnerships team</Link>
      </div>
    </ContentPage>
  );
}
