import { ContentPage } from "@/components/public/content";

export const metadata = { title: "Complaints and safeguarding policy" };

export default function SafeguardingPolicy() {
  return (
    <ContentPage title="Complaints and safeguarding policy" draftPolicy>
      <h2>Our commitments</h2>
      <ul>
        <li>
          No one is asked to exchange anything – money, favours, filming or personal information beyond what
          is necessary – for support.
        </li>
        <li>
          We do not publish identifiable stories or images of children without guardian consent and an
          additional safeguarding review.
        </li>
        <li>We do not stage distress, fabricate events or sensationalise people&apos;s situations.</li>
        <li>Sponsors may not demand humiliating content or inappropriate access to beneficiaries.</li>
      </ul>
      <h2>Raising a concern</h2>
      <p>
        Anyone can raise a concern through our <a href="/complaints/new">complaints form</a>. Safeguarding
        concerns go only to trained safeguarding officers. If someone is in immediate danger, call 112.
      </p>
      <h2>What happens next</h2>
      <p>
        We acknowledge every complaint with a reference number, assess its seriousness, may restrict
        publication of affected cases while we investigate, and document how each serious incident is
        resolved.
      </p>
    </ContentPage>
  );
}
