import { ContentPage } from "@/components/public/content";

export const metadata = { title: "Terms of service" };

export default function Terms() {
  return (
    <ContentPage title="Terms of service" draftPolicy>
      <h2>Using KindSpring</h2>
      <p>
        You must provide accurate information. Submitting false information, impersonating others or
        attempting to access other people&apos;s records may lead to account suspension and referral to the
        authorities.
      </p>
      <h2>No guarantee of support</h2>
      <p>
        Submitting a request does not guarantee approval or funding. Decisions are made by authorised staff
        following our published verification process.
      </p>
      <h2>Contributions</h2>
      <p>
        Contributions are restricted to the case you choose and are governed by our donation and funding
        policy, including refunds and the handling of excess or unspent funds.
      </p>
      <h2>Sponsors</h2>
      <p>
        Sponsorship is governed by a written agreement. A pledge is not treated as a payment until funds are
        confirmed.
      </p>
    </ContentPage>
  );
}
