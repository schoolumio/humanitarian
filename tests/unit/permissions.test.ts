import { describe, expect, it } from "vitest";
import { hasPermission, permissionsFor, ROLE_PERMISSIONS, PRIVILEGED_ROLES } from "@/lib/permissions";
import { buildActor, requirePermission } from "@/server/actor";

describe("permission matrix", () => {
  it("does not let administrators approve financial actions", () => {
    for (const p of ["finance.refund.approve", "finance.disbursement.approve", "finance.offline_receipt"] as const) {
      expect(hasPermission(["ADMIN"], p)).toBe(false);
      expect(hasPermission(["SUPER_ADMIN"], p)).toBe(false);
      expect(hasPermission(["FINANCE_OFFICER"], p)).toBe(true);
    }
  });
  it("restricts safeguarding to safeguarding officers", () => {
    const holders = Object.entries(ROLE_PERMISSIONS).filter(([, ps]) => ps.includes("safeguarding.manage")).map(([r]) => r);
    expect(holders).toEqual(["SAFEGUARDING_OFFICER"]);
  });
  it("gives investigators only assigned-case access", () => {
    const p = permissionsFor(["INVESTIGATOR"]);
    expect(p.has("application.view_assigned")).toBe(true);
    expect(p.has("application.view_all")).toBe(false);
    expect(p.has("case.decide")).toBe(false);
  });
  it("gives public roles no staff permissions", () => {
    for (const r of ["APPLICANT", "DONOR", "SPONSOR"] as const) expect(hasPermission([r], "staff.dashboard")).toBe(false);
  });
  it("combines multiple roles", () => {
    const p = permissionsFor(["DONOR", "APPLICANT"]);
    expect(p.has("donation.own") && p.has("application.own")).toBe(true);
  });
  it("treats finance and safeguarding roles as privileged", () => {
    expect(PRIVILEGED_ROLES).toContain("FINANCE_OFFICER");
    expect(PRIVILEGED_ROLES).toContain("SUPER_ADMIN");
  });
  it("requires step-up MFA for high-risk permissions when MFA is enabled", () => {
    const base = { id: "u1", email: "a@example.test", name: "A", emailVerifiedAt: new Date(), roles: [{ role: "FINANCE_OFFICER" as const }] };
    const noStepUp = buildActor({ ...base, mfaEnabledAt: new Date() }, { id: "s", mfaVerifiedAt: null });
    expect(() => requirePermission(noStepUp, "finance.refund.approve")).toThrow(/authenticator/);
    const stepped = buildActor({ ...base, mfaEnabledAt: new Date() }, { id: "s", mfaVerifiedAt: new Date() });
    expect(() => requirePermission(stepped, "finance.refund.approve")).not.toThrow();
    expect(() => requirePermission(stepped, "admin.users")).toThrow();
  });
});
