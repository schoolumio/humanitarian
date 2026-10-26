import Link from "next/link";
import { formatMoney, progressPercent } from "@/lib/money";
import { CAMPAIGN_STATUS_LABEL } from "@/lib/workflow/campaign";
import { Badge, Progress, formatDate } from "@/components/ui";
import type { PublicCampaignCard } from "@/server/services/campaigns";
import { fundingFigures } from "@/server/services/campaigns";

export function FundingSummary({ c }: { c: Pick<PublicCampaignCard, "targetAmountMinor" | "confirmedAmountMinor" | "refundedAmountMinor" | "currency"> }) {
  const { net, remaining } = fundingFigures(c);
  const pct = progressPercent(net, c.targetAmountMinor);
  return (
    <div>
      <Progress percent={pct} label={`${pct}% of funding target confirmed`} />
      <p className="mt-2 text-sm">
        <strong>{formatMoney(net, c.currency)}</strong> confirmed of {formatMoney(c.targetAmountMinor, c.currency)} ({pct}%)
        {remaining > 0n && <span className="text-muted"> · {formatMoney(remaining, c.currency)} still needed</span>}
      </p>
    </div>
  );
}

export function CampaignCard({ c }: { c: PublicCampaignCard }) {
  return (
    <article className="flex flex-col rounded-[var(--radius-card)] border border-line bg-white p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone="info">{c.category.name}</Badge>
        <Badge tone={c.status === "COMPLETED" ? "success" : "neutral"}>{CAMPAIGN_STATUS_LABEL[c.status]}</Badge>
      </div>
      <h3 className="text-lg">
        <Link href={`/cases/${c.publicId}`} className="no-underline hover:underline">{c.title}</Link>
      </h3>
      <p className="mt-1 text-sm text-muted">{c.locationLabel} · Verified {formatDate(c.verifiedAt)}</p>
      <p className="mt-3 line-clamp-3 flex-1">{c.summary}</p>
      <div className="mt-4"><FundingSummary c={c} /></div>
    </article>
  );
}
