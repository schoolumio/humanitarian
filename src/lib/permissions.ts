import type { Role } from "@prisma/client";

/**
 * KindSpring permission matrix.
 *
 * Permissions are coarse capabilities. Most of them are additionally scoped in the
 * service layer (ownership, investigator assignment, organisation membership) and
 * combined with separation-of-duty rules (e.g. a disbursement approver must differ
 * from its requester). Hiding UI is never relied upon; every service call checks.
 *
 * Note that ADMIN and SUPER_ADMIN deliberately do NOT hold financial approval or
 * safeguarding permissions: administrators cannot bypass financial controls.
 */
export const PERMISSIONS = [
  // applicant self-service
  "application.own",
  // donor self-service
  "donation.own",
  // sponsor self-service (further scoped to approved organisation membership)
  "sponsor.own",

  // staff – applications & verification
  "staff.dashboard",
  "application.view_all",
  "application.view_assigned",
  "application.triage",
  "investigation.assign",
  "investigation.record",
  "investigation.view_restricted_notes",
  "case.review",
  "case.decide",
  "consent.record_on_behalf",

  // campaigns, sponsors, in-kind
  "campaign.manage",
  "campaign.publish",
  "sponsor.review",
  "sponsor.agreement.prepare",
  "sponsor.agreement.approve",
  "inkind.manage",

  // interventions
  "intervention.manage",
  "intervention.outcome_review",
  "intervention.budget_change.approve",

  // finance
  "finance.view",
  "finance.reconcile",
  "finance.refund.request",
  "finance.refund.approve",
  "finance.disbursement.request",
  "finance.disbursement.approve",
  "finance.offline_receipt",
  "finance.supplier.manage",
  "finance.reports",

  // media
  "media.manage",
  "media.approve",

  // complaints, safeguarding, risk
  "complaint.manage",
  "safeguarding.manage",
  "risk.review",

  // administration
  "admin.users",
  "admin.privileged_roles",
  "admin.audit",
  "admin.categories",
  "admin.contact",
  "reports.internal",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  APPLICANT: ["application.own"],
  DONOR: ["donation.own"],
  SPONSOR: ["sponsor.own", "donation.own"],
  INVESTIGATOR: ["staff.dashboard", "application.view_assigned", "investigation.record"],
  CASE_MANAGER: [
    "staff.dashboard",
    "application.view_all",
    "application.triage",
    "investigation.assign",
    "investigation.record",
    "investigation.view_restricted_notes",
    "case.review",
    "case.decide",
    "consent.record_on_behalf",
    "campaign.manage",
    "campaign.publish",
    "sponsor.review",
    "sponsor.agreement.prepare",
    "inkind.manage",
    "intervention.manage",
    "intervention.outcome_review",
    "finance.disbursement.request",
    "risk.review",
    "reports.internal",
  ],
  FINANCE_OFFICER: [
    "staff.dashboard",
    "finance.view",
    "finance.reconcile",
    "finance.refund.request",
    "finance.refund.approve",
    "finance.disbursement.request",
    "finance.disbursement.approve",
    "finance.offline_receipt",
    "finance.supplier.manage",
    "finance.reports",
    "sponsor.agreement.approve",
    "intervention.budget_change.approve",
    "risk.review",
    "reports.internal",
  ],
  MEDIA_EDITOR: ["staff.dashboard", "media.manage", "media.approve"],
  SAFEGUARDING_OFFICER: [
    "staff.dashboard",
    "application.view_all",
    "investigation.view_restricted_notes",
    "complaint.manage",
    "safeguarding.manage",
    "risk.review",
  ],
  ADMIN: [
    "staff.dashboard",
    "admin.users",
    "admin.audit",
    "admin.categories",
    "admin.contact",
    "complaint.manage",
    "sponsor.review",
    "sponsor.agreement.approve",
    "risk.review",
    "reports.internal",
  ],
  SUPER_ADMIN: [
    "staff.dashboard",
    "admin.users",
    "admin.privileged_roles",
    "admin.audit",
    "admin.categories",
    "admin.contact",
    "reports.internal",
  ],
};

/** Roles that only a SUPER_ADMIN may grant or revoke. */
export const PRIVILEGED_ROLES: readonly Role[] = [
  "ADMIN",
  "SUPER_ADMIN",
  "FINANCE_OFFICER",
  "SAFEGUARDING_OFFICER",
];

export const STAFF_ROLES: readonly Role[] = [
  "INVESTIGATOR",
  "CASE_MANAGER",
  "FINANCE_OFFICER",
  "MEDIA_EDITOR",
  "SAFEGUARDING_OFFICER",
  "ADMIN",
  "SUPER_ADMIN",
];

/** Operations that require a recent MFA verification on the session (step-up). */
export const STEP_UP_PERMISSIONS: readonly Permission[] = [
  "admin.users",
  "admin.privileged_roles",
  "finance.refund.approve",
  "finance.disbursement.approve",
  "finance.offline_receipt",
  "sponsor.agreement.approve",
  "safeguarding.manage",
];

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) out.add(p);
  return out;
}

export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((r) => ROLE_PERMISSIONS[r]?.includes(permission));
}

export const isStaff = (roles: readonly Role[]) => roles.some((r) => STAFF_ROLES.includes(r));

export const ROLE_LABELS: Record<Role, string> = {
  APPLICANT: "Applicant",
  DONOR: "Donor",
  SPONSOR: "Sponsor",
  INVESTIGATOR: "Investigator",
  CASE_MANAGER: "Case manager",
  FINANCE_OFFICER: "Finance officer",
  MEDIA_EDITOR: "Media editor",
  SAFEGUARDING_OFFICER: "Safeguarding officer",
  ADMIN: "Administrator",
  SUPER_ADMIN: "Super administrator",
};
