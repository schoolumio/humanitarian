import Link from "next/link";
import type { Permission } from "@/lib/permissions";
import { Alert } from "@/components/ui";
import { requirePagePermission } from "@/server/current-user";
import { staffMfaRequired } from "@/server/actor";

const NAV: { href: string; label: string; any: Permission[] }[] = [
  { href: "/staff", label: "Dashboard", any: ["staff.dashboard"] },
  { href: "/staff/applications", label: "Cases", any: ["application.view_all"] },
  { href: "/staff/investigations", label: "My investigations", any: ["investigation.record"] },
  { href: "/staff/campaigns", label: "Campaigns", any: ["campaign.manage", "intervention.manage"] },
  { href: "/staff/sponsors", label: "Sponsors", any: ["sponsor.review", "sponsor.agreement.approve"] },
  { href: "/staff/in-kind", label: "In-kind", any: ["inkind.manage"] },
  { href: "/staff/finance", label: "Finance", any: ["finance.view"] },
  { href: "/staff/media", label: "Media & stories", any: ["media.manage"] },
  { href: "/staff/complaints", label: "Complaints", any: ["complaint.manage"] },
  { href: "/staff/safeguarding", label: "Safeguarding", any: ["safeguarding.manage"] },
  { href: "/staff/risk", label: "Risk alerts", any: ["risk.review"] },
  { href: "/staff/reports", label: "Reports", any: ["reports.internal"] },
  { href: "/staff/admin/users", label: "Users & roles", any: ["admin.users"] },
  { href: "/staff/admin/audit", label: "Audit log", any: ["admin.audit"] },
  { href: "/staff/admin/categories", label: "Categories", any: ["admin.categories"] },
  { href: "/staff/admin/contact", label: "Contact messages", any: ["admin.contact"] },
];

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePagePermission("staff.dashboard", "/staff");
  const items = NAV.filter((n) => n.any.some((p) => actor.permissions.has(p)));
  return (
    <div className="grid gap-6 lg:grid-cols-[13rem_1fr]">
      <nav aria-label="Staff" className="lg:sticky lg:top-4 lg:self-start">
        <details className="rounded-[var(--radius-card)] border border-line bg-white" open>
          <summary className="cursor-pointer p-3 font-semibold text-teal lg:hidden">Staff menu</summary>
          <ul className="flex flex-col p-2">
            {items.map((i) => (
              <li key={i.href}><Link href={i.href} className="block rounded px-3 py-2 no-underline hover:bg-teal-50">{i.label}</Link></li>
            ))}
          </ul>
        </details>
      </nav>
      <div className="min-w-0">
        {!actor.mfaEnabled && (
          <div className="mb-4">
            <Alert tone="warning" title="Two-step verification is not set up">
              {staffMfaRequired() ? "Sensitive actions are blocked until you set it up." : "Staff should use two-step verification."} <Link href="/account">Set it up now</Link>.
            </Alert>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
