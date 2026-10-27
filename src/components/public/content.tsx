import type { ReactNode } from "react";
import Link from "@/components/ui/link";
import { Alert, buttonClass } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { ChatIcon, HeartIcon, ShieldIcon } from "@/components/brand/icons";

/** Side panel on information pages: the main ways to act, plus safety information. */
function HelpAside() {
  return (
    <aside
      aria-label="Ways to get involved"
      className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start"
    >
      <div className="bg-sunrise-deep relative overflow-hidden rounded-[var(--radius-card)] p-6 text-white shadow-[var(--shadow-lift)]">
        <span aria-hidden="true" className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10" />
        <HeartIcon className="relative h-8 w-8 text-sun" />
        <p className="relative mt-3 font-[family-name:var(--font-display)] text-xl font-bold">
          Ready to make a difference?
        </p>
        <p className="relative mt-1 text-white/90">
          Every case is independently verified before it is published.
        </p>
        <Link href="/cases" className={buttonClass("cta", "relative mt-4 w-full")}>
          Give to a verified case
        </Link>
      </div>
      <div className="card p-5">
        <p className="flex items-center gap-2 font-bold text-ink">
          <ShieldIcon className="h-5 w-5 text-sea" /> Need support?
        </p>
        <p className="mt-1 text-sm text-muted">Tell us privately about your situation.</p>
        <Link href="/apply/start" className={buttonClass("secondary", "mt-3 w-full")}>
          Request assistance
        </Link>
      </div>
      <div className="card p-5 text-sm">
        <p className="flex items-center gap-2 font-bold text-ink">
          <ChatIcon className="h-5 w-5 text-grape" /> Questions?
        </p>
        <p className="mt-1 text-muted">
          Read the <Link href="/faq">FAQ</Link> or <Link href="/contact">contact our team</Link>. If someone
          is in immediate danger, call <strong className="text-ink">112</strong>.
        </p>
      </div>
    </aside>
  );
}

/** Information and policy pages: a warm header band, readable prose and a help panel. */
export function ContentPage({
  title,
  intro,
  children,
  draftPolicy,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
  draftPolicy?: boolean;
}) {
  return (
    <article>
      <header className="bg-blush relative -mt-8 mb-10 overflow-hidden py-12 sm:-mt-10 sm:py-16 mx-[calc(50%-50vw)]">
        <span aria-hidden="true" className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-sun/25" />
        <span aria-hidden="true" className="absolute -bottom-20 left-10 h-48 w-48 rounded-full bg-brand/10" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <span aria-hidden="true" className="mb-4 block h-1.5 w-16 rounded-full bg-sunrise" />
          <h1 className="max-w-3xl text-4xl sm:text-5xl">{title}</h1>
          {intro && <p className="mt-4 max-w-2xl text-lg text-muted sm:text-xl">{intro}</p>}
        </div>
      </header>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {draftPolicy && (
            <div className="mb-6">
              <Alert tone="warning" title="Draft policy pending professional review">
                This policy describes how the platform is designed to operate. It must be reviewed by
                qualified legal, data-protection and fundraising advisers before {BRAND.name} accepts real
                applicants or funds. It does not by itself establish legal compliance.
              </Alert>
            </div>
          )}
          <div className="prose-ks card p-6 sm:p-10">{children}</div>
        </div>
        <HelpAside />
      </div>
    </article>
  );
}
