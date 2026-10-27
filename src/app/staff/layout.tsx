import Link from "@/components/ui/link";
import type { Permission } from "@/lib/permissions";
import { Alert } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/permissions";
import { ProfileCard } from "@/components/layout/portal-shell";
import { SideNav } from "@/components/layout/side-nav";
import {
  AlertIcon,
  BuildingIcon,
  CameraIcon,
  ChartIcon,
  ChatIcon,
  CommunityIcon,
  FileIcon,
  GiftIcon,
  GridIcon,
  ListIcon,
  MailIcon,
  ReceiptIcon,
  SearchIcon,
  ShieldIcon,
  SparkIcon,
} from "@/components/brand/icons";
import { requirePagePermission } from "@/server/current-user";
import { staffMfaRequired } from "@/server/actor";

const NAV: {
  href: string;
  Icon: (p: { className?: string }) => React.ReactNode;
  label: string;
  any: Permission[];
}[] = [
  { href: "/staff", Icon: GridIcon, label: "Dashboard", any: ["staff.dashboard"] },
  { href: "/staff/applications", Icon: FileIcon, label: "Cases", any: ["application.view_all"] },
  {
    href: "/staff/investigations",
    Icon: SearchIcon,
    label: "My investigations",
    any: ["investigation.record"],
  },
  {
    href: "/staff/campaigns",
    Icon: SparkIcon,
    label: "Campaigns",
    any: ["campaign.manage", "intervention.manage"],
  },
  {
    href: "/staff/sponsors",
    Icon: BuildingIcon,
    label: "Sponsors",
    any: ["sponsor.review", "sponsor.agreement.approve"],
  },
  { href: "/staff/in-kind", Icon: GiftIcon, label: "In-kind", any: ["inkind.manage"] },
  { href: "/staff/finance", Icon: ReceiptIcon, label: "Finance", any: ["finance.view"] },
  { href: "/staff/media", Icon: CameraIcon, label: "Media & stories", any: ["media.manage"] },
  { href: "/staff/complaints", Icon: ChatIcon, label: "Complaints", any: ["complaint.manage"] },
  { href: "/staff/safeguarding", Icon: ShieldIcon, label: "Safeguarding", any: ["safeguarding.manage"] },
  { href: "/staff/risk", Icon: AlertIcon, label: "Risk alerts", any: ["risk.review"] },
  { href: "/staff/reports", Icon: ChartIcon, label: "Reports", any: ["reports.internal"] },
  { href: "/staff/admin/users", Icon: CommunityIcon, label: "Users & roles", any: ["admin.users"] },
  { href: "/staff/admin/audit", Icon: ListIcon, label: "Audit log", any: ["admin.audit"] },
  { href: "/staff/admin/categories", Icon: GridIcon, label: "Categories", any: ["admin.categories"] },
  { href: "/staff/admin/contact", Icon: MailIcon, label: "Contact messages", any: ["admin.contact"] },
];

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePagePermission("staff.dashboard", "/staff");
  const items = NAV.filter((n) => n.any.some((p) => actor.permissions.has(p)));
  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
      <nav aria-label="Staff" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <div className="card overflow-hidden">
          <div className="hidden lg:block">
            <ProfileCard
              title="Staff workspace"
              name={actor.name}
              roles={actor.roles.map((r) => ROLE_LABELS[r])}
            />
          </div>
          <div className="lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto">
            <SideNav
              label="Staff sections"
              items={items.map((i) => ({
                href: i.href,
                label: i.label,
                icon: <i.Icon className="h-5 w-5" />,
              }))}
            />
          </div>
        </div>
      </nav>
      <div className="min-w-0">
        {!actor.mfaEnabled && (
          <div className="mb-4">
            <Alert tone="warning" title="Two-step verification is not set up">
              {staffMfaRequired()
                ? "Sensitive actions are blocked until you set it up."
                : "Staff should use two-step verification."}{" "}
              <Link href="/account">Set it up now</Link>.
            </Alert>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
