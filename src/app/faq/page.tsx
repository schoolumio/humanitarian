import { ContentPage } from "@/components/public/content";

export const metadata = { title: "Frequently asked questions" };

const FAQ: [string, string][] = [
  [
    "Does submitting a request mean I will receive help?",
    "No. Every request is reviewed and verified. We will explain the outcome. Submitting a request never guarantees approval or funding.",
  ],
  [
    "Do I need ID documents or a smartphone?",
    "No. We offer alternative ways to verify your situation, for example through a community leader or an in-person visit. Lack of formal documents or digital access is never a reason on its own to decline a request.",
  ],
  [
    "Will my story be made public?",
    "Only if you give separate permission for each type of use (public page, social media, advertising, sponsor reports). You can be helped without agreeing to any publicity, and you can withdraw consent later.",
  ],
  [
    "How do I know my contribution reached the case?",
    "Contributions are restricted to the case you choose. Funding totals count only payments confirmed with our payment provider, and we record supplier payments and delivery evidence.",
  ],
  [
    "What happens if a case gets more than it needs?",
    "Contributions are capped at the amount still needed. If a case is still overfunded, the excess is handled under our published funding policy – it is never silently moved elsewhere.",
  ],
  [
    "Can I get a refund?",
    "Yes, in the situations set out in our donation and funding policy. Refunds need approval from two finance officers and are returned through the original payment method.",
  ],
  [
    "Does KindSpring take a fee?",
    "The current platform fee, if any, is shown on the home page and in our funding policy. Payment provider fees are recorded in each case's financial records.",
  ],
];

export default function FaqPage() {
  return (
    <ContentPage title="Frequently asked questions">
      {FAQ.map(([q, a]) => (
        <details key={q} className="mb-3 rounded-[var(--radius-card)] border border-line bg-white p-4">
          <summary className="cursor-pointer font-semibold text-teal">{q}</summary>
          <p>{a}</p>
        </details>
      ))}
    </ContentPage>
  );
}
