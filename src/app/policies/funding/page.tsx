import { ContentPage } from "@/components/public/content";
import { env } from "@/lib/env";

export const metadata = { title: "Donation and funding policy" };

export default function FundingPolicy() {
  const bps = env().PLATFORM_FEE_BPS;
  const feePolicy = env().PROCESSING_FEE_POLICY;
  return (
    <ContentPage title="Donation and funding policy" draftPolicy>
      <h2>Restricted funds</h2>
      <p>Each contribution is restricted to the case it was given to. Restricted funds are never treated as KindSpring operating income.</p>
      <h2>Fees</h2>
      <p>Platform fee: {bps > 0 ? `${bps / 100}% of each contribution, disclosed before payment.` : "none is currently charged."}</p>
      <p>Payment processing fees charged by our payment provider are {feePolicy === "CHARGED_TO_FUND" ? "deducted from the case's restricted fund and shown in its financial records" : "paid by KindSpring and not deducted from the case"}.</p>
      <h2>When a case is fully funded</h2>
      <p>Online contributions are limited to the amount still needed. If simultaneous payments still take a case above its target, the excess is identified by our finance team. We will refund the excess to the most recent contributors unless they have explicitly agreed to another use. We never silently redirect funds.</p>
      <h2>Partial funding</h2>
      <p>If a funding period ends below target, we may deliver a reduced or phased intervention that has been reviewed and approved, or follow the refund rules below.</p>
      <h2>If an intervention cannot go ahead</h2>
      <p>An authorised review decides between: offering refunds to contributors; providing alternative assistance to the same beneficiary with documented approval; or, only with contributors&apos; consent, directing funds to a similar verified case.</p>
      <h2>Unspent balances</h2>
      <p>If an intervention costs less than budgeted, the remaining restricted balance is handled under the same review process and reported in the case&apos;s financial summary.</p>
      <h2>Refunds</h2>
      <p>Refunds are made to the original payment method and require approval by two finance officers. Banks can take several working days to show refunds.</p>
      <h2>In-kind contributions</h2>
      <p>Donated goods and services are recorded separately from cash. Estimated values are shown as estimates and only after delivery is confirmed.</p>
    </ContentPage>
  );
}
