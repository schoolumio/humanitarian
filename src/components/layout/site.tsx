import Link from "@/components/ui/link";
import { getActor } from "@/server/current-user";
import { isStaff } from "@/lib/permissions";
import { BRAND } from "@/lib/brand";
import { logoutAction } from "@/app/(auth)/actions";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { buttonClass } from "@/components/ui";
import { Logo } from "@/components/brand/logo";
import { HeartIcon } from "@/components/brand/icons";

const PUBLIC_NAV = [
  { href: "/cases", label: "Verified cases" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/verification", label: "Verification" },
  { href: "/partners", label: "Partnerships" },
  { href: "/stories", label: "Impact" },
];

export async function SiteHeader() {
  const actor = await getActor();
  const links: { href: string; label: string }[] = [];
  if (actor) {
    if (actor.roles.includes("APPLICANT")) links.push({ href: "/apply", label: "My requests" });
    if (actor.roles.includes("DONOR")) links.push({ href: "/donor", label: "My giving" });
    if (actor.roles.includes("SPONSOR")) links.push({ href: "/sponsor", label: "Sponsor portal" });
    if (isStaff(actor.roles)) links.push({ href: "/staff", label: "Staff workspace" });
    links.push({ href: "/account", label: "Account" });
  }
  const navLink =
    "whitespace-nowrap rounded-full px-3 py-2 font-semibold text-ink no-underline transition-colors hover:bg-brand-50 hover:text-brand";
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-white/90 backdrop-blur">
      <div aria-hidden="true" className="h-1.5 bg-sunrise" />
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="no-underline" aria-label={`${BRAND.name} home`}>
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-0.5 xl:flex">
          {PUBLIC_NAV.map((l) => (
            <Link key={l.href} href={l.href} className={navLink}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 xl:flex">
          {actor ? (
            <>
              {links.map((l) => (
                <Link key={l.href} href={l.href} className={navLink}>
                  {l.label}
                </Link>
              ))}
              <ActionForm action={logoutAction}>
                <SubmitButton variant="secondary" className="min-h-10 px-4 py-1.5" pendingText="Signing out…">
                  Sign out
                </SubmitButton>
              </ActionForm>
            </>
          ) : (
            <>
              <Link href="/login" className={navLink}>
                Sign in
              </Link>
              <Link href="/cases" className={buttonClass("cta", "min-h-10 whitespace-nowrap")}>
                <HeartIcon className="h-5 w-5" /> Give
              </Link>
              <Link href="/apply/start" className={buttonClass("primary", "min-h-10 whitespace-nowrap")}>
                Request assistance
              </Link>
            </>
          )}
        </div>
        <details className="relative xl:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full border-2 border-brand/20 px-4 font-bold text-ink">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            Menu
          </summary>
          <nav aria-label="Mobile" className="card absolute right-0 z-50 mt-3 flex w-72 flex-col p-2">
            {[...PUBLIC_NAV, ...(actor ? links : [{ href: "/login", label: "Sign in" }])].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-xl px-4 py-3 font-semibold text-ink no-underline hover:bg-brand-50"
              >
                {l.label}
              </Link>
            ))}
            {actor ? (
              <ActionForm action={logoutAction}>
                <SubmitButton variant="ghost" className="w-full justify-start" pendingText="Signing out…">
                  Sign out
                </SubmitButton>
              </ActionForm>
            ) : (
              <div className="mt-2 grid gap-2 border-t border-line p-2 pt-3">
                <Link href="/cases" className={buttonClass("cta")}>
                  Give to a verified case
                </Link>
                <Link href="/apply/start" className={buttonClass("primary")}>
                  Request assistance
                </Link>
              </div>
            )}
          </nav>
        </details>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const col = "flex flex-col gap-2";
  const link = "text-white/90 decoration-white/40 hover:text-white hover:decoration-sun";
  return (
    <footer className="bg-dusk mt-16 text-white">
      <svg
        viewBox="0 0 1440 60"
        preserveAspectRatio="none"
        className="block h-10 w-full text-cream"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M0 0h1440v20c-240 40-480 40-720 0S240-20 0 20Z" fill="currentColor" />
      </svg>
      <div>
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Logo inverse />
            <p className="mt-3 font-semibold text-white">{BRAND.tagline}</p>
            <p className="mt-2 text-sm text-white/85">{BRAND.shortDescription}</p>
            <p className="mt-4 rounded-2xl bg-white/10 p-3 text-sm text-white">
              If someone is in immediate danger, call the emergency number <strong>112</strong>.
            </p>
          </div>
          <nav aria-label="Get involved" className={col}>
            <p className="font-[family-name:var(--font-display)] font-bold text-sun">Get involved</p>
            <Link className={link} href="/cases">
              Give to a verified case
            </Link>
            <Link className={link} href="/partners">
              Become a brand partner
            </Link>
            <Link className={link} href="/apply/start">
              Request assistance
            </Link>
            <Link className={link} href="/completed">
              Completed interventions
            </Link>
          </nav>
          <nav aria-label="About KindSpring" className={col}>
            <p className="font-[family-name:var(--font-display)] font-bold text-sun">About</p>
            <Link className={link} href="/about">
              About us
            </Link>
            <Link className={link} href="/categories">
              Support categories
            </Link>
            <Link className={link} href="/faq">
              Frequently asked questions
            </Link>
            <Link className={link} href="/contact">
              Contact
            </Link>
          </nav>
          <nav aria-label="Policies" className={col}>
            <p className="font-[family-name:var(--font-display)] font-bold text-sun">Trust &amp; policies</p>
            <Link className={link} href="/policies/privacy">
              Privacy policy
            </Link>
            <Link className={link} href="/policies/terms">
              Terms of service
            </Link>
            <Link className={link} href="/policies/funding">
              Donation and funding policy
            </Link>
            <Link className={link} href="/policies/safeguarding">
              Complaints and safeguarding
            </Link>
            <Link className={link} href="/complaints/new">
              Make a complaint
            </Link>
          </nav>
        </div>
        <div className="border-t border-white/15">
          <p className="mx-auto max-w-6xl px-4 py-5 text-sm text-white/85">
            © {new Date().getFullYear()} {BRAND.name}. Made with care in Nigeria.
          </p>
        </div>
      </div>
    </footer>
  );
}
