import type { ReactNode } from "react";
import Link from "@/components/ui/link";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { env } from "@/lib/env";
import { ButtonLink, EmptyState, buttonClass, cx } from "@/components/ui";
import { CampaignCard } from "@/components/public/campaign-card";
import { HeroIllustration } from "@/components/brand/illustration";
import {
  ArrowRight,
  BuildingIcon,
  GiftIcon,
  HeartIcon,
  ReceiptIcon,
  SearchIcon,
  ShieldIcon,
  SparkIcon,
  categoryStyle,
} from "@/components/brand/icons";
import { listPublicCampaigns } from "@/server/services/campaigns";
import { publicImpact } from "@/server/services/reports";
import { listPublicStories } from "@/server/services/media";

export const dynamic = "force-dynamic";

/** Full-width band that breaks out of the page container. */
function Band({ className, children, id }: { className?: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className={cx("relative mx-[calc(50%-50vw)] px-4", className)}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

function Eyebrow({ children, tone = "brand" }: { children: ReactNode; tone?: "brand" | "sun" | "light" }) {
  const cls =
    tone === "light"
      ? "bg-white/15 text-white"
      : tone === "sun"
        ? "bg-sun-50 text-[#7a4a00]"
        : "bg-brand-50 text-brand";
  return (
    <p
      className={cx(
        "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-extrabold uppercase tracking-wider",
        cls,
      )}
    >
      {children}
    </p>
  );
}

const STEPS = [
  {
    title: "A private request",
    body: "People ask for help privately. Nothing is published, and no one has to share their story publicly to qualify.",
    Icon: HeartIcon,
    color: "bg-brand",
  },
  {
    title: "Careful verification",
    body: "Our team screens, verifies remotely and visits in person when needed – respecting people without documents or smartphones.",
    Icon: SearchIcon,
    color: "bg-grape",
  },
  {
    title: "Independent decision",
    body: "Someone who did not investigate reviews the findings; an authorised case manager decides. People decide – never AI.",
    Icon: ShieldIcon,
    color: "bg-sea",
  },
  {
    title: "Help delivered",
    body: "We pay suppliers directly where possible, record delivery evidence and share honest, consented updates.",
    Icon: GiftIcon,
    color: "bg-sun-600",
  },
];

const WAYS = [
  {
    title: "Give to a verified case",
    body: "Choose a person or family and give any amount. Your gift is restricted to that case.",
    href: "/cases",
    cta: "Find a case",
    Icon: HeartIcon,
    ring: "from-brand to-brand-600",
    tint: "bg-brand-50",
    ink: "text-brand",
  },
  {
    title: "Sponsor an intervention",
    body: "Businesses and foundations can fund a complete intervention and receive evidence-based reports.",
    href: "/partners",
    cta: "Partner with us",
    Icon: BuildingIcon,
    ring: "from-grape to-[#8b5cf6]",
    tint: "bg-grape-50",
    ink: "text-grape",
  },
  {
    title: "Offer goods or skills",
    body: "Furniture, food, materials, training, transport or professional services – delivered where they are needed.",
    href: "/partners",
    cta: "Offer support",
    Icon: GiftIcon,
    ring: "from-sea to-sea-600",
    tint: "bg-sea-50",
    ink: "text-sea",
  },
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
    <div className="-mt-8 sm:-mt-10">
      {/* Hero */}
      <Band className="bg-blush overflow-hidden pb-16 pt-10 sm:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <Eyebrow>
              <HeartIcon className="h-4 w-4" /> Verified humanitarian support in Nigeria
            </Eyebrow>
            <h1 className="mt-5 text-4xl leading-[1.1] sm:text-6xl">
              Real needs. <span className="text-gradient">Verified support.</span>{" "}
              <span className="squiggle">Lasting change.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted sm:text-xl">
              Discover verified opportunities to help people rebuild, recover and move forward. Give directly
              to a defined need, sponsor a complete intervention or provide goods and services that make a
              measurable difference.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/cases" className="min-h-13 px-7 text-lg">
                Explore Verified Cases <ArrowRight />
              </ButtonLink>
              <ButtonLink href="/apply/start" variant="secondary" className="min-h-13 px-7 text-lg">
                Request Assistance
              </ButtonLink>
              <Link href="/partners" className="px-2 font-bold">
                Become a Brand Partner
              </Link>
            </div>
            <ul className="mt-10 grid gap-3 sm:grid-cols-3">
              {[
                { t: "Every case investigated", I: ShieldIcon, c: "text-sea" },
                { t: "Gifts restricted to each case", I: HeartIcon, c: "text-brand" },
                { t: "Delivery evidenced", I: ReceiptIcon, c: "text-grape" },
              ].map(({ t, I, c }) => (
                <li
                  key={t}
                  className="flex items-center gap-2 rounded-2xl bg-white/80 px-3 py-2.5 text-sm font-bold shadow-sm"
                >
                  <I className={cx("h-5 w-5 shrink-0", c)} /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="bg-sunrise rounded-[3rem] p-6 shadow-[0_30px_60px_-20px_rgb(200_23_79/0.45)] sm:rotate-2">
              <HeroIllustration className="h-auto w-full sm:-rotate-2" />
            </div>
            <div className="card absolute -bottom-6 -left-2 flex items-center gap-3 px-4 py-3 sm:-left-8">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-leaf-50 text-leaf">
                <ShieldIcon className="h-6 w-6" />
              </span>
              <span className="text-sm font-bold leading-tight">
                Independent review
                <br />
                <span className="font-semibold text-muted">before any approval</span>
              </span>
            </div>
            <div className="card absolute -right-2 -top-4 flex items-center gap-3 px-4 py-3 sm:-right-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sun-50 text-[#9a5b00]">
                <SparkIcon className="h-6 w-6" />
              </span>
              <span className="text-sm font-bold leading-tight">
                Honest updates
                <br />
                <span className="font-semibold text-muted">shared only with consent</span>
              </span>
            </div>
          </div>
        </div>
      </Band>

      {/* Ways to help */}
      <Band className="py-16">
        <div className="text-center">
          <Eyebrow tone="sun">Ways to help</Eyebrow>
          <h2 className="mt-4 text-3xl sm:text-4xl">Kindness, in the shape that fits you</h2>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {WAYS.map((w) => (
            <Link
              key={w.title}
              href={w.href}
              className="card lift group flex flex-col p-7 text-ink no-underline"
            >
              <span
                className={cx(
                  "flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md",
                  w.ring,
                )}
              >
                <w.Icon className="h-7 w-7" />
              </span>
              <h3 className="mt-5 text-xl">{w.title}</h3>
              <p className="mt-2 flex-1 text-muted">{w.body}</p>
              <span className={cx("mt-5 inline-flex items-center gap-1 font-extrabold", w.ink)}>
                {w.cta} <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </Band>

      {/* Cases */}
      <Band className="bg-white py-16" id="featured">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Eyebrow>Open for support</Eyebrow>
            <h2 className="mt-4 text-3xl sm:text-4xl">Verified cases you can help today</h2>
          </div>
          {featured.length > 0 && (
            <Link href="/cases" className="inline-flex items-center gap-1 font-extrabold">
              See all verified cases <ArrowRight />
            </Link>
          )}
        </div>
        <div className="mt-8">
          {featured.length ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featured.slice(0, 6).map((c) => (
                <CampaignCard key={c.publicId} c={c} />
              ))}
            </div>
          ) : (
            <EmptyState title="New verified cases are on their way">
              Cases appear here only after careful verification and approval. Please check back soon, or{" "}
              <Link href="/partners">talk to us about sponsorship</Link>.
            </EmptyState>
          )}
        </div>
      </Band>

      {/* How it works */}
      <Band className="py-16" id="verification">
        <div className="text-center">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-4 text-3xl sm:text-4xl">From a private request to lasting change</h2>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-muted">
            Every case follows the same careful path, with different people checking each step.
          </p>
        </div>
        <ol className="relative mt-12 grid gap-6 md:grid-cols-4">
          <span
            aria-hidden="true"
            className="absolute left-0 right-0 top-8 hidden border-t-2 border-dashed border-brand/25 md:block"
          />
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative text-center">
              <span
                className={cx(
                  "relative mx-auto flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg ring-8 ring-cream",
                  s.color,
                )}
              >
                <s.Icon className="h-8 w-8" />
                <span className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-extrabold text-ink shadow">
                  {i + 1}
                </span>
              </span>
              <h3 className="mt-5 text-lg">{s.title}</h3>
              <p className="mt-2 text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-10 text-center">
          <Link href="/verification" className="font-extrabold">
            Read our verification and transparency standards
          </Link>
        </p>
      </Band>

      {/* Categories */}
      <Band className="bg-white py-16" id="categories">
        <div className="text-center">
          <Eyebrow tone="sun">What we support</Eyebrow>
          <h2 className="mt-4 text-3xl sm:text-4xl">Help for the moments that matter most</h2>
        </div>
        {categories.length ? (
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => {
              const { Icon, tint, ink } = categoryStyle(c.slug);
              return (
                <li key={c.id}>
                  <Link
                    href={`/cases?category=${c.slug}&status=all`}
                    className={cx(
                      "lift flex h-full gap-4 rounded-[var(--radius-card)] p-5 text-ink no-underline",
                      tint,
                    )}
                  >
                    <span
                      className={cx(
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm",
                        ink,
                      )}
                    >
                      <Icon />
                    </span>
                    <span>
                      <span className="block font-[family-name:var(--font-display)] font-bold">{c.name}</span>
                      <span className="mt-1 block text-sm text-muted">{c.description}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-8">
            <EmptyState title="Support categories are being set up" />
          </div>
        )}
      </Band>

      {/* Impact */}
      <Band className="bg-dusk py-16 text-white" id="outcomes">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <Eyebrow tone="light">Verified outcomes</Eyebrow>
            <h2 className="mt-4 text-3xl text-white sm:text-4xl">Change you can see – and trust</h2>
            <p className="mt-3 text-lg text-white/90">
              We report outcomes only after delivery has been evidenced and independently reviewed. Every
              figure is calculated from our records – never estimated.
            </p>
            <Link href="/stories" className={buttonClass("cta", "mt-6")}>
              See our impact
            </Link>
          </div>
          {impact.interventionsCompleted > 0 ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  label: "Interventions completed and reviewed",
                  value: String(impact.interventionsCompleted),
                },
                {
                  label: "Spent on approved interventions",
                  value: formatMoney(impact.fundingDeliveredMinor),
                },
                { label: "Cases approved after verification", value: String(impact.casesApproved) },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-[var(--radius-card)] bg-white/10 p-5 ring-1 ring-white/20"
                >
                  <p className="font-[family-name:var(--font-display)] text-3xl font-extrabold text-sun">
                    {s.value}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white/90">{s.label}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[var(--radius-card)] bg-white/10 p-8 ring-1 ring-white/20">
              <p className="font-[family-name:var(--font-display)] text-xl font-bold text-white">
                Our first outcomes will appear here
              </p>
              <p className="mt-2 text-white/90">
                As interventions are completed and independently reviewed, you will see what was delivered,
                how funds were spent and – with consent – the difference it made.
              </p>
            </div>
          )}
        </div>
        {stories.length > 0 && (
          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {stories.slice(0, 4).map((s) => (
              <li key={s.id} className="rounded-[var(--radius-card)] bg-white p-5 text-ink">
                <Link
                  href={`/cases/${s.campaign.publicId}`}
                  className="font-[family-name:var(--font-display)] font-bold"
                >
                  {s.title}
                </Link>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{s.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Band>

      {/* Transparency */}
      <Band className="py-16" id="fees">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div>
            <Eyebrow>Transparency</Eyebrow>
            <h2 className="mt-4 text-3xl sm:text-4xl">Where your money goes</h2>
            <p className="mt-3 text-lg text-muted">
              We would rather show you the details than ask you to take our word for it.
            </p>
          </div>
          <ul className="grid gap-4">
            {[
              {
                I: HeartIcon,
                c: "bg-brand-50 text-brand",
                t: "Restricted to the case you choose",
                b: "Donations are never treated as KindSpring operating income.",
              },
              {
                I: ReceiptIcon,
                c: "bg-sun-50 text-[#9a5b00]",
                t:
                  feeBps > 0
                    ? `A disclosed ${feeBps / 100}% platform fee`
                    : "No platform fee taken from your gift",
                b: "Payment provider fees are recorded openly in each case’s financial records.",
              },
              {
                I: ShieldIcon,
                c: "bg-sea-50 text-sea",
                t: "Paid directly to suppliers where possible",
                b: "Every payment needs approval from a second finance officer.",
              },
              {
                I: SparkIcon,
                c: "bg-grape-50 text-grape",
                t: "Never silently redirected",
                b: (
                  <>
                    Overfunding and unspent funds follow our published{" "}
                    <Link href="/policies/funding">funding policy</Link>.
                  </>
                ),
              },
            ].map(({ I, c, t, b }) => (
              <li key={String(t)} className="card flex gap-4 p-5">
                <span className={cx("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", c)}>
                  <I className="h-6 w-6" />
                </span>
                <span>
                  <span className="block font-[family-name:var(--font-display)] font-bold">{t}</span>
                  <span className="mt-1 block text-muted">{b}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Band>

      {/* Closing CTA */}
      <Band className="pb-4" id="partners">
        <div className="bg-sunrise-deep relative overflow-hidden rounded-[2rem] px-6 py-12 text-center text-white sm:px-12">
          <span aria-hidden="true" className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/15" />
          <span
            aria-hidden="true"
            className="absolute -bottom-16 -right-8 h-56 w-56 rounded-full bg-white/10"
          />
          <h2 className="relative text-3xl text-white sm:text-4xl">Every act of kindness, verified.</h2>
          <p className="relative mx-auto mt-3 max-w-2xl text-lg font-semibold text-white">
            Join individuals, businesses and foundations helping people across Nigeria rebuild with dignity.
          </p>
          <div className="relative mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/cases" className={buttonClass("cta", "min-h-13 px-7 text-lg")}>
              Give to a verified case
            </Link>
            <Link
              href="/partners"
              className="inline-flex min-h-13 items-center justify-center rounded-full bg-white px-7 text-lg font-bold text-brand no-underline shadow-md hover:bg-brand-50"
            >
              Become a brand partner
            </Link>
          </div>
        </div>
      </Band>
    </div>
  );
}
