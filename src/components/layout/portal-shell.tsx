import type { ReactNode } from "react";
import Link from "@/components/ui/link";
import { ROLE_LABELS, isStaff } from "@/lib/permissions";
import type { Actor } from "@/server/actor";
import { SideNav, type SideNavItem } from "./side-nav";
import { BuildingIcon, ChatIcon, FileIcon, HeartIcon, ShieldIcon, UserIcon } from "@/components/brand/icons";

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "?"
  );
}

/** Profile card shown at the top of every signed-in sidebar. */
export function ProfileCard({ name, roles, title }: { name: string; roles: string[]; title: string }) {
  return (
    <div className="bg-dusk relative overflow-hidden px-4 pb-4 pt-5 text-white">
      <span aria-hidden="true" className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/10" />
      <p className="relative text-xs font-extrabold uppercase tracking-wider text-sun">{title}</p>
      <div className="relative mt-3 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="bg-sunrise flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-[family-name:var(--font-display)] font-bold text-white ring-2 ring-white/40"
        >
          {initials(name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-bold">{name}</span>
          <span className="block truncate text-sm text-white/80">{roles.join(" · ")}</span>
        </span>
      </div>
    </div>
  );
}

/** Two-column frame for applicant, donor, sponsor and account pages. */
export function PortalShell({ actor, children }: { actor: Actor; children: ReactNode }) {
  const items: SideNavItem[] = [];
  const ic = "h-5 w-5";
  if (actor.roles.includes("APPLICANT"))
    items.push({ href: "/apply", label: "My requests", icon: <FileIcon className={ic} /> });
  if (actor.roles.includes("DONOR"))
    items.push({ href: "/donor", label: "My giving", icon: <HeartIcon className={ic} /> });
  if (actor.roles.includes("SPONSOR"))
    items.push({ href: "/sponsor", label: "Sponsor portal", icon: <BuildingIcon className={ic} /> });
  if (isStaff(actor.roles))
    items.push({ href: "/staff", label: "Staff workspace", icon: <ShieldIcon className={ic} /> });
  items.push({ href: "/account", label: "Account & security", icon: <UserIcon className={ic} /> });
  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
      <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <nav aria-label="Your account" className="card overflow-hidden">
          <div className="hidden lg:block">
            <ProfileCard
              title="My KindSpring"
              name={actor.name}
              roles={actor.roles.map((r) => ROLE_LABELS[r])}
            />
          </div>
          <SideNav items={items} label="Account sections" />
        </nav>
        <div className="card mt-4 hidden p-4 text-sm lg:block">
          <p className="flex items-center gap-2 font-bold text-ink">
            <ChatIcon className="h-5 w-5 text-sea" /> Need a hand?
          </p>
          <p className="mt-1 text-muted">
            Our team is happy to help. <Link href="/contact">Contact us</Link>
          </p>
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
