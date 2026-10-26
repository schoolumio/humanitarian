import Link from "@/components/ui/link";
import { formatMoney } from "@/lib/money";
import { Card, EmptyState, PageHeader, Section, formatDate, humanize } from "@/components/ui";
import { listPublicStories } from "@/server/services/media";
import { publicImpact } from "@/server/services/reports";

export const metadata = { title: "Impact stories and reporting" };
export const dynamic = "force-dynamic";

export default async function StoriesPage() {
  const [stories, impact] = await Promise.all([listPublicStories(1), publicImpact()]);
  return (
    <div>
      <PageHeader
        title="Impact"
        description="Figures are calculated from our records. Outcomes are reported only after independent review."
      />
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <p className="text-sm text-muted">Cases approved after verification</p>
          <p className="text-2xl font-bold text-teal">{impact.casesApproved}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Interventions completed</p>
          <p className="text-2xl font-bold text-teal">{impact.interventionsCompleted}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Spent on approved interventions</p>
          <p className="text-2xl font-bold text-teal">{formatMoney(impact.fundingDeliveredMinor)}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Completion rate (closed interventions)</p>
          <p className="text-2xl font-bold text-teal">
            {impact.completionRate === null ? "Not yet measurable" : `${impact.completionRate}%`}
          </p>
        </Card>
      </div>
      {impact.byState.length > 0 && (
        <p className="mt-3 text-sm text-muted">
          Where support has been delivered: {impact.byState.map((s) => `${s.state} (${s.count})`).join(", ")}.
        </p>
      )}
      <Section title="Stories">
        {stories.length ? (
          <ul className="grid gap-4 sm:grid-cols-2">
            {stories.map((s) => (
              <li key={s.id}>
                <Card>
                  <p className="text-sm text-muted">
                    {humanize(s.type)} · {formatDate(s.publishedAt)}
                  </p>
                  <h2 className="mt-1 text-lg">
                    <Link href={`/cases/${s.campaign.publicId}`}>{s.title}</Link>
                  </h2>
                  <p className="mt-2 line-clamp-4">{s.body}</p>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No stories published yet">
            Stories are published only with the beneficiary&apos;s specific consent and editorial approval.
          </EmptyState>
        )}
      </Section>
    </div>
  );
}
