import { ContentPage } from "@/components/public/content";

export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <ContentPage title="About KindSpring" intro="Real People. Verified Needs. Lasting Change.">
      <p>KindSpring connects people in Nigeria who need assistance with genuine needs – emergency accommodation, food and essentials, livelihood recovery, education and training, work equipment and community projects – with individuals, businesses and foundations willing to help.</p>
      <p>We investigate every request before it is approved, coordinate the support, record how funds are used, verify delivery and publish only approved, consented impact updates.</p>
      <p>Nobody has to expose their private life publicly to qualify for help. We can support eligible people whose stories are not suitable for public sharing through private sponsorship.</p>
      <p className="text-sm text-muted">“KindSpring” is a working name and may change.</p>
    </ContentPage>
  );
}
