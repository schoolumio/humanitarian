import { ContentPage } from "@/components/public/content";

export const metadata = { title: "Verification and transparency" };

export default function VerificationPage() {
  return (
    <ContentPage title="Verification and transparency" intro="What “verified” means on KindSpring – and what it does not.">
      <h2>What we check</h2>
      <ul>
        <li><strong>Screening:</strong> completeness, scope, urgency and possible duplicate requests.</li>
        <li><strong>Remote verification:</strong> contact through a method the applicant chose as safe, review of evidence, lawful checks of public information and, with permission, references such as community leaders.</li>
        <li><strong>Field investigation:</strong> an in-person visit when the risk level or evidence gaps justify it.</li>
        <li><strong>Independent review:</strong> a reviewer who did not investigate assesses the findings.</li>
        <li><strong>Decision:</strong> an authorised case manager records the decision and reasons.</li>
      </ul>
      <h2>Separation of duties</h2>
      <ul>
        <li>No one may work on or approve a request they submitted.</li>
        <li>The investigator of a case cannot make its final decision.</li>
        <li>A campaign prepared by one staff member must be published by another.</li>
        <li>Every payment to a supplier and every refund needs approval from a second finance officer.</li>
        <li>Interventions are marked complete only after an outcome review by someone other than the case manager.</li>
      </ul>
      <h2>Funding figures</h2>
      <p>Funding totals count only payments confirmed directly with our payment provider. A browser redirect or “payment successful” screen is never treated as proof of payment. Pledges by sponsors are not counted as money received, and a fully funded case is not counted as a completed intervention.</p>
      <h2>Limits</h2>
      <p>Verification reduces risk; it cannot remove it completely. If you have concerns about a case, please <a href="/complaints/new">tell us</a>.</p>
    </ContentPage>
  );
}
