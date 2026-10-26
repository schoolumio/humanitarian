import Link from "next/link";
import { getActor } from "@/server/current-user";
import { isStaff } from "@/lib/permissions";
import { logoutAction } from "@/app/(auth)/actions";

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
  return (
    <header className="bg-teal text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-xl font-bold text-white no-underline">
          Kind<span className="text-amber">Spring</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-5 lg:flex">
          {PUBLIC_NAV.map((l) => (
            <Link key={l.href} href={l.href} className="text-white no-underline hover:underline">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-3 lg:flex">
          {actor ? (
            <>
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="text-white no-underline hover:underline">
                  {l.label}
                </Link>
              ))}
              <form action={logoutAction}>
                <button className="rounded border border-white/60 px-3 py-1 text-white hover:bg-white/10">Sign out</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="text-white no-underline hover:underline">Sign in</Link>
              <Link href="/apply/start" className="rounded-md bg-amber px-3 py-2 font-semibold text-charcoal no-underline hover:bg-amber-600">
                Request assistance
              </Link>
            </>
          )}
        </div>
        <details className="relative lg:hidden">
          <summary className="cursor-pointer list-none rounded border border-white/60 px-3 py-2">Menu</summary>
          <nav aria-label="Mobile" className="absolute right-0 z-40 mt-2 flex w-64 flex-col rounded-md bg-white p-2 text-charcoal shadow-lg">
            {[...PUBLIC_NAV, ...(actor ? links : [{ href: "/login", label: "Sign in" }, { href: "/apply/start", label: "Request assistance" }])].map((l) => (
              <Link key={l.href} href={l.href} className="rounded px-3 py-2 no-underline hover:bg-teal-50">
                {l.label}
              </Link>
            ))}
            {actor && (
              <form action={logoutAction}>
                <button className="w-full rounded px-3 py-2 text-left hover:bg-teal-50">Sign out</button>
              </form>
            )}
          </nav>
        </details>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-line bg-white">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm sm:grid-cols-3">
        <div>
          <p className="font-bold text-teal">KindSpring</p>
          <p className="mt-1 text-muted">Real People. Verified Needs. Lasting Change.</p>
          <p className="mt-3 text-muted">If someone is in immediate danger, call the emergency number 112.</p>
        </div>
        <nav aria-label="About KindSpring" className="flex flex-col gap-1">
          <Link href="/about">About</Link>
          <Link href="/categories">Support categories</Link>
          <Link href="/completed">Completed interventions</Link>
          <Link href="/faq">Frequently asked questions</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <nav aria-label="Policies" className="flex flex-col gap-1">
          <Link href="/policies/privacy">Privacy policy</Link>
          <Link href="/policies/terms">Terms of service</Link>
          <Link href="/policies/funding">Donation and funding policy</Link>
          <Link href="/policies/safeguarding">Complaints and safeguarding</Link>
          <Link href="/complaints/new">Make a complaint</Link>
        </nav>
      </div>
    </footer>
  );
}
