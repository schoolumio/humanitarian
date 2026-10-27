import Link from "@/components/ui/link";
import { formatMoney, progressPercent } from "@/lib/money";
import { CAMPAIGN_STATUS_LABEL } from "@/lib/workflow/campaign";
import { Badge, Progress, cx, formatDate } from "@/components/ui";
import { ArrowRight, ShieldIcon, categoryStyle } from "@/components/brand/icons";
import type { PublicCampaignCard } from "@/server/services/campaigns";
import { fundingFigures } from "@/server/services/campaigns";

export function FundingSummary({
  c,
}: {
  c: Pick<
    PublicCampaignCard,
    "targetAmountMinor" | "confirmedAmountMinor" | "refundedAmountMinor" | "currency"
  >;
}) {
  const { net, remaining } = fundingFigures(c);
  const pct = progressPercent(net, c.targetAmountMinor);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span>
          <strong className="font-[family-name:var(--font-display)] text-lg text-ink">
            {formatMoney(net, c.currency)}
          </strong>{" "}
          <span className="text-sm text-muted">
            confirmed of {formatMoney(c.targetAmountMinor, c.currency)}
          </span>
        </span>
        <span className="text-sm font-extrabold text-brand">{pct}%</span>
      </div>
      <Progress percent={pct} label={`${pct}% of funding target confirmed`} />
      <p className="mt-2 text-sm text-muted">
        {remaining > 0n ? (
          <>{formatMoney(remaining, c.currency)} still needed</>
        ) : (
          <>Funding target reached</>
        )}
      </p>
    </div>
  );
}

const PANEL = [
  "from-brand-50 to-sun-50",
  "from-grape-50 to-brand-50",
  "from-sea-50 to-[#e8f5ff]",
  "from-sun-50 to-leaf-50",
];

export function CampaignCard({ c }: { c: PublicCampaignCard }) {
  const { Icon, ink } = categoryStyle(c.category.slug);
  const panel = PANEL[c.publicId.charCodeAt(0) % PANEL.length];
  return (
    <article className="card lift group relative flex flex-col overflow-hidden">
      <div className={cx("relative flex h-32 items-center justify-center bg-gradient-to-br", panel)}>
        <span aria-hidden="true" className="absolute -left-6 -top-6 h-24 w-24 rounded-full bg-white/50" />
        <span aria-hidden="true" className="absolute -bottom-8 right-6 h-20 w-20 rounded-full bg-white/40" />
        <span
          className={cx(
            "relative flex h-16 w-16 items-center justify-center rounded-3xl bg-white shadow-md",
            ink,
          )}
        >
          <Icon className="h-9 w-9" />
        </span>
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-xs font-extrabold text-leaf shadow-sm">
          <ShieldIcon className="h-4 w-4" /> Verified {formatDate(c.verifiedAt)}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge tone="info">{c.category.name}</Badge>
          <Badge tone={c.status === "COMPLETED" ? "success" : "neutral"}>
            {CAMPAIGN_STATUS_LABEL[c.status]}
          </Badge>
        </div>
        <h3 className="text-lg leading-snug">
          <Link
            href={`/cases/${c.publicId}`}
            className="text-ink no-underline after:absolute after:inset-0 hover:text-brand"
          >
            {c.title}
          </Link>
        </h3>
        <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-muted">
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 text-brand"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
          {c.locationLabel}
        </p>
        <p className="mt-3 line-clamp-3 flex-1 text-[0.98rem]">{c.summary}</p>
        <div className="mt-5">
          <FundingSummary c={c} />
        </div>
        <span aria-hidden="true" className="mt-4 inline-flex items-center gap-1 font-extrabold text-brand">
          View this case <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </article>
  );
}
