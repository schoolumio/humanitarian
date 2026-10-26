import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { formatMoney } from "@/lib/money";
import { hashIp } from "@/lib/crypto";
import { paymentModeLabel } from "@/lib/payments";
import { CAMPAIGN_STATUS_LABEL, DONATABLE_STATUSES } from "@/lib/workflow/campaign";
import { Alert, Badge, Card, Section, formatDate, humanize } from "@/components/ui";
import { FundingSummary } from "@/components/public/campaign-card";
import { getActor } from "@/server/current-user";
import { runAction, type FormState } from "@/server/action";
import { fundingFigures, getPublicCampaign } from "@/server/services/campaigns";
import { initiateDonation } from "@/server/services/payments";
import { GiveForm } from "./give-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ publicId: string }> }): Promise<Metadata> {
  const c = await getPublicCampaign((await params).publicId);
  return { title: c ? c.title : "Case not found" };
}

export default async function CasePage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const c = await getPublicCampaign(publicId);
  if (!c) notFound();
  const actor = await getActor();
  const { remaining, excess } = fundingFigures(c);
  const open = DONATABLE_STATUSES.includes(c.status) && c.acceptsDonations && remaining > 0n && (!c.endsAt || c.endsAt > new Date());

  async function give(_: FormState, fd: FormData): Promise<FormState> {
    "use server";
    let url = "";
    const h = await headers();
    const r = await runAction(async () => {
      const res = await initiateDonation(await getActor(), publicId, Object.fromEntries(fd), { ipHash: hashIp(h.get("x-forwarded-for")?.split(",")[0] ?? null) });
      url = res.checkoutUrl;
    });
    if (r?.ok && url) redirect(url);
    return r;
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <article>
        <div className="mb-3 flex flex-wrap gap-2">
          <Badge tone="info">{c.category.name}</Badge>
          <Badge tone={c.status === "COMPLETED" ? "success" : "neutral"}>{CAMPAIGN_STATUS_LABEL[c.status]}</Badge>
          <Badge tone="success">Verified {formatDate(c.verifiedAt)}</Badge>
        </div>
        <h1 className="text-3xl">{c.title}</h1>
        <p className="mt-1 text-muted">{c.locationLabel}</p>
        <div className="prose-ks mt-4 whitespace-pre-line">{c.summary}</div>

        <Section title="What the support will provide">
          <p className="whitespace-pre-line">{c.interventionSummary}</p>
        </Section>

        <Section title="Itemised budget">
          <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-white">
            {c.budgetLines.map((l, i) => (
              <li key={i} className="flex justify-between gap-4 px-4 py-2"><span>{l.description}</span><span className="font-semibold">{formatMoney(l.amountMinor, c.currency)}</span></li>
            ))}
            <li className="flex justify-between gap-4 bg-teal-50 px-4 py-2 font-bold"><span>Funding target</span><span>{formatMoney(c.targetAmountMinor, c.currency)}</span></li>
          </ul>
        </Section>

        <Section title="How this case was verified">
          <p className="whitespace-pre-line">{c.verificationSummary}</p>
          <p className="mt-2 text-sm text-muted">Verification is carried out by KindSpring staff. Private documents and investigation notes are never published. <Link href="/verification">About our verification process</Link>.</p>
        </Section>

        {c.sponsors.length > 0 && (
          <Section title="Sponsors">
            <p>This case is supported under signed agreements by: {c.sponsors.join(", ")}.</p>
          </Section>
        )}

        {c.inKind.length > 0 && (
          <Section title="Goods and services delivered">
            <ul className="list-disc pl-5">{c.inKind.map((i, n) => <li key={n}>{i.quantityDelivered} {i.unit}: {i.description}</li>)}</ul>
            <p className="mt-1 text-sm text-muted">In-kind support is recorded separately and is not counted as cash funding.</p>
          </Section>
        )}

        <Section title="Updates">
          {c.stories.length ? (
            <ol className="flex flex-col gap-4">
              {c.stories.map((s) => (
                <li key={s.id}>
                  <Card>
                    <p className="text-sm text-muted">{humanize(s.type)} · {formatDate(s.publishedAt)}</p>
                    <h3 className="mt-1 text-lg">{s.title}</h3>
                    <p className="mt-2 whitespace-pre-line">{s.body}</p>
                    {s.media.length > 0 && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {s.media.map((m, i) => (
                          <figure key={i}>
                            {m.kind === "VIDEO" ? (
                              <video src={m.url} controls preload="none" className="w-full rounded" aria-label={m.alt} />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={m.url} alt={m.alt} loading="lazy" className="w-full rounded" />
                            )}
                            {m.caption && <figcaption className="mt-1 text-sm text-muted">{humanize(m.phase)}: {m.caption}</figcaption>}
                          </figure>
                        ))}
                      </div>
                    )}
                  </Card>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted">No updates have been published yet.</p>
          )}
        </Section>

        {c.intervention?.status === "COMPLETED" && c.intervention.outcomeSummary && (
          <Section title="Outcome report">
            <Card><p className="whitespace-pre-line">{c.intervention.outcomeSummary}</p><p className="mt-2 text-sm text-muted">Reviewed and completed {formatDate(c.intervention.completedAt)}.</p></Card>
          </Section>
        )}
      </article>

      <aside className="flex flex-col gap-4">
        <Card>
          <FundingSummary c={c} />
          <p className="mt-2 text-sm text-muted">{c.supporters} confirmed contribution{c.supporters === 1 ? "" : "s"}. Only payments confirmed by our payment provider are counted.</p>
          {excess > 0n && <p className="mt-2 text-sm">Funding exceeded the target by {formatMoney(excess)}; the excess is handled under our <Link href="/policies/funding">funding policy</Link>.</p>}
        </Card>
        <Card>
          <h2 className="mb-3 text-xl">Give to this case</h2>
          {open ? (
            <>
              <GiveForm action={give} defaultEmail={actor?.email} defaultName={actor?.name} remainingMajor={Number(remaining / 100n)} />
              <p className="mt-3 text-sm text-muted">Payments are processed securely by our payment provider. KindSpring never sees or stores your card details. Mode: {paymentModeLabel()}.</p>
            </>
          ) : (
            <Alert tone="info" title="This case is not accepting contributions">
              {c.status === "FULLY_FUNDED" ? "It is fully funded. Thank you to everyone who contributed." : "Please explore other verified cases."}{" "}
              <Link href="/cases">Browse cases</Link>
            </Alert>
          )}
          <p className="mt-3 text-sm"><Link href="/policies/funding">Refunds, overfunding and unspent funds</Link></p>
        </Card>
        {c.acceptsSponsorship && (
          <Card>
            <p className="font-semibold text-teal">Sponsor this intervention</p>
            <p className="mt-1 text-sm">Businesses and foundations can fund the whole intervention or provide goods and services.</p>
            <p className="mt-2"><Link href={`/partners`}>Partnership options →</Link></p>
          </Card>
        )}
      </aside>
    </div>
  );
}
