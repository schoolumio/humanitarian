import Link from "next/link";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { ButtonLink, EmptyState, Section } from "@/components/ui";
import { CampaignCard } from "@/components/public/campaign-card";
import { listPublicCampaigns } from "@/server/services/campaigns";
import { publicImpact } from "@/server/services/reports";
import { listPublicStories } from "@/server/services/media";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const STEPS = [
  { title: "Private request", body: "People apply privately. Nothing is published at this stage." },
  { title: "Staged verification", body: "Our team screens the request, verifies remotely and visits in person when the risk or evidence gaps justify it." },
  { title: "Independent decision", body: "A reviewer who did not investigate the case recommends a decision; an authorised case manager decides. AI never decides." },
  { title: "Funded & delivered", body: "Approved needs are funded by individuals or sponsors. We pay suppliers directly where possible and record delivery evidence." },
];

export default async function HomePage() {
  const [{ rows: featured }, impact, categories, stories] = await Promise.all([
    listPublicCampaigns({ status: "open", page: 1 }),
    publicImpact(),
    db.caseCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    listPublicStories(1),
  ]);
  const feeBps = env().PLATFORM_FEE_BPS;
  return (
    <div>
      <section className="rounded-[var(--radius-card)] bg-teal px-6 py-12 text-white sm:px-10">
        <h1 className="max-w-3xl text-3xl text-white sm:text-5xl">Real Needs. Verified Support. Lasting Change.</h1>
        <p className="mt-4 max-w-2xl text-lg text-white/90">
          Discover verified opportunities to help people rebuild, recover and move forward. Give directly to a defined need, sponsor a complete intervention or provide goods and services that make a measurable difference.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/cases" variant="cta">Explore Verified Cases</ButtonLink>
          <ButtonLink href="/apply/start" variant="secondary">Request Assistance</ButtonLink>
          <Link href="/partners" className="inline-flex min-h-11 items-center px-2 font-semibold text-white underline">Become a Brand Partner</Link>
        </div>
      </section>

      <Section title="Cases open for support" id="featured">
        {featured.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{featured.slice(0, 6).map((c) => <CampaignCard key={c.publicId} c={c} />)}</div>
        ) : (
          <EmptyState title="No cases are open for funding right now">
            Cases appear here only after verification and approval. Please check back soon, or <Link href="/partners">talk to us about sponsorship</Link>.
          </EmptyState>
        )}
        {featured.length > 0 && <p className="mt-4"><Link href="/cases">See all verified cases →</Link></p>}
      </Section>

      <Section title="How verification works" id="verification">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-[var(--radius-card)] border border-line bg-white p-4">
              <p className="text-sm font-semibold text-muted">Step {i + 1}</p>
              <p className="mt-1 font-semibold text-teal">{s.title}</p>
              <p className="mt-1 text-sm">{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3"><Link href="/verification">Read our verification and transparency standards →</Link></p>
      </Section>

      <Section title="Support categories" id="categories">
        {categories.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => (
              <li key={c.id} className="rounded-[var(--radius-card)] border border-line bg-white p-4">
                <Link href={`/cases?category=${c.slug}`} className="font-semibold">{c.name}</Link>
                <p className="mt-1 text-sm text-muted">{c.description}</p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Support categories are being set up" />
        )}
      </Section>

      <Section title="Verified outcomes" id="outcomes">
        {impact.interventionsCompleted > 0 ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[var(--radius-card)] border border-line bg-white p-4"><p className="text-sm text-muted">Interventions completed and reviewed</p><p className="text-2xl font-bold text-teal">{impact.interventionsCompleted}</p></div>
            <div className="rounded-[var(--radius-card)] border border-line bg-white p-4"><p className="text-sm text-muted">Funds spent on approved interventions</p><p className="text-2xl font-bold text-teal">{formatMoney(impact.fundingDeliveredMinor)}</p></div>
            <div className="rounded-[var(--radius-card)] border border-line bg-white p-4"><p className="text-sm text-muted">Cases approved after verification</p><p className="text-2xl font-bold text-teal">{impact.casesApproved}</p></div>
          </div>
        ) : (
          <EmptyState title="No completed interventions yet">
            We only report outcomes after delivery has been evidenced and independently reviewed. Figures will appear here as interventions are completed.
          </EmptyState>
        )}
        {stories.length > 0 && (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {stories.slice(0, 4).map((s) => (
              <li key={s.id} className="rounded-[var(--radius-card)] border border-line bg-white p-4">
                <Link href={`/cases/${s.campaign.publicId}`} className="font-semibold">{s.title}</Link>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{s.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="For businesses and foundations" id="partners">
        <div className="rounded-[var(--radius-card)] border border-line bg-white p-6">
          <p className="max-w-3xl">Sponsor a complete verified intervention, fund an approved portion, or provide goods and professional services. You receive progress updates, a financial summary and an evidence-based impact report – with beneficiaries&apos; privacy protected throughout.</p>
          <div className="mt-4"><ButtonLink href="/partners" variant="primary">Explore partnerships</ButtonLink></div>
        </div>
      </Section>

      <Section title="Fees and how your money is used" id="fees">
        <div className="prose-ks max-w-3xl rounded-[var(--radius-card)] border border-line bg-white p-6">
          <p>Donations to a case are restricted to that case. They are never treated as KindSpring operating income.</p>
          <p>
            {feeBps > 0
              ? `A disclosed platform fee of ${feeBps / 100}% is applied to contributions under our published accounting policy.`
              : "KindSpring does not currently deduct a platform fee from contributions."}{" "}
            Payment processing fees charged by our payment provider are shown in each case&apos;s financial records.
          </p>
          <p>Where possible we pay suppliers and service providers directly. If a case receives more than it needs, or an intervention cannot go ahead, we follow our published <Link href="/policies/funding">donation and funding policy</Link> – we never silently redirect funds.</p>
        </div>
      </Section>
    </div>
  );
}
