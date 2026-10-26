import { ContentPage } from "@/components/public/content";

export const metadata = { title: "Privacy policy" };

export default function PrivacyPolicy() {
  return (
    <ContentPage title="Privacy policy" draftPolicy>
      <h2>What we collect</h2>
      <p>Only what we need to assess and deliver support: your name, contact details, general location, a description of your situation, a budget and any evidence you choose to upload. Donors provide a name and email for receipts. Card details are handled by our payment provider and never reach KindSpring.</p>
      <h2>Why we use it</h2>
      <ul>
        <li><strong>Assessment</strong> – with your consent, to verify and decide on your request.</li>
        <li><strong>Delivering support</strong> – to coordinate suppliers and record delivery.</li>
        <li><strong>Legal and financial obligations</strong> – to keep accurate financial and audit records.</li>
        <li><strong>Publication</strong> – only where you give separate, specific consent for each use. You can withdraw it at any time from your account.</li>
      </ul>
      <h2>Who can see it</h2>
      <p>Only staff who need it for their role. Investigators see only cases assigned to them. Sponsors never receive your personal details. Sensitive investigation and safeguarding records have additional restrictions, and access is logged.</p>
      <h2>How long we keep it</h2>
      <p>See the retention schedule in our data protection notes. Financial records must be kept for statutory periods; other personal data is removed or anonymised when no longer needed.</p>
      <h2>Your rights</h2>
      <p>You can download your data and request deletion from your account page. We cannot erase records we are legally required to keep (for example payment and audit records); we keep them in a form that identifies you as little as possible. Material already shared on social media or copied by others may not be fully removable, although we will remove what we control and ask platforms to remove the rest.</p>
      <p>This policy is intended to be reviewed against the Nigeria Data Protection Act 2023 and related regulations.</p>
    </ContentPage>
  );
}
