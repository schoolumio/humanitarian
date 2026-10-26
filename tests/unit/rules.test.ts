import { describe, expect, it } from "vitest";
import { submissionProblems } from "@/server/validation/application";
import { approvalBlockers } from "@/server/services/cases";
import { publicTextProblems, campaignPublicationBlockers } from "@/server/services/campaigns";
import { validateContributionAmount } from "@/server/services/payments";
import { refundableAmount } from "@/server/services/refunds";
import { disbursementApprovalBlockers, isMaterialBudgetChange } from "@/server/services/interventions";
import { normaliseNigerianPhone } from "@/lib/nigeria";
import { parseChecklist } from "@/server/services/admin";

describe("submission readiness", () => {
  const complete = { fullName: "Ada Test", phone: "+2348030000000", state: "Lagos", categoryId: "c", whatHappened: "x", assistanceNeeded: "y", requestedAmountMinor: 100n, contactMethods: ["SMS"], budgetItemCount: 1, assessmentConsent: true };
  it("passes a complete application without requiring evidence", () => {
    expect(submissionProblems(complete)).toEqual([]);
  });
  it("requires assessment consent and a safe contact method", () => {
    const p = submissionProblems({ ...complete, assessmentConsent: false, contactMethods: [] });
    expect(p.map((x) => x.step).sort()).toEqual([6, 7]);
  });
});

describe("eligibility decision rules (separation of duties)", () => {
  const base = { status: "PENDING_APPROVAL" as const, deciderId: "cm2", applicantId: "app", reviews: [{ reviewerId: "cm1", recommendation: "APPROVE" as const }], reportAuthorIds: ["inv"], openScreeningOrRemoteTasks: 0 };
  it("allows an independent approval", () => expect(approvalBlockers(base)).toEqual([]));
  it("blocks self-approval by the applicant", () => expect(approvalBlockers({ ...base, deciderId: "app" }).join()).toMatch(/own request/));
  it("blocks the investigator deciding", () => expect(approvalBlockers({ ...base, deciderId: "inv" }).join()).toMatch(/investigator/));
  it("requires a review by someone other than the decider", () => {
    expect(approvalBlockers({ ...base, deciderId: "cm1" }).join()).toMatch(/independent reviewer/);
    expect(approvalBlockers({ ...base, reviews: [{ reviewerId: "cm1", recommendation: "DECLINE" }] }).length).toBe(1);
  });
  it("requires verification checks to be resolved", () => expect(approvalBlockers({ ...base, openScreeningOrRemoteTasks: 2 }).length).toBe(1));
});

describe("public text privacy guard", () => {
  const applicant = { fullName: "Chiamaka Testperson Obi", phone: "+2348031234567", community: "Imaginary Close" };
  it("flags full names, phone numbers and exact community", () => {
    expect(publicTextProblems("Chiamaka Testperson needs help", applicant).length).toBe(1);
    expect(publicTextProblems("Call 0803 123 4567", applicant).length).toBe(1);
    expect(publicTextProblems("Lives on Imaginary Close", applicant).length).toBe(1);
  });
  it("flags sensational language", () => expect(publicTextProblems("A desperate mother", applicant).length).toBe(1));
  it("accepts dignified, anonymised text", () => expect(publicTextProblems("A mother of three in Ikorodu needs safe accommodation.", applicant)).toEqual([]));
});

describe("campaign publication consent", () => {
  const ok = { visibility: "PUBLIC" as const, consents: new Map([["PUBLIC_CAMPAIGN_PAGE", true]]), openSafeguarding: false, budgetTotal: 100n, target: 100n, applicationStatus: "APPROVED" };
  it("allows a consented public campaign", () => expect(campaignPublicationBlockers(ok)).toEqual([]));
  it("blocks a public page without consent", () => expect(campaignPublicationBlockers({ ...ok, consents: new Map() }).length).toBe(1));
  it("sponsors-only requires sponsor reporting consent", () => expect(campaignPublicationBlockers({ ...ok, visibility: "SPONSORS_ONLY" }).length).toBe(1));
  it("blocks mismatched budgets", () => expect(campaignPublicationBlockers({ ...ok, budgetTotal: 90n }).length).toBe(1));
});

describe("contribution amounts", () => {
  it("rejects amounts below the minimum, above the remaining need, or when funded", () => {
    expect(validateContributionAmount(5_000n, 1_000_000n)).toMatch(/minimum/);
    expect(validateContributionAmount(600_000n, 500_000n)).toMatch(/needs/);
    expect(validateContributionAmount(100_000n, 0n)).toMatch(/fully funded/);
    expect(validateContributionAmount(null, 100n)).toMatch(/valid/);
    expect(validateContributionAmount(100_000n, 500_000n)).toBeNull();
  });
});

describe("refunds", () => {
  it("never allows refunding more than paid minus refunded minus in-flight", () => {
    expect(refundableAmount({ amountMinor: 1000n, refundedMinor: 300n }, 200n)).toBe(500n);
    expect(refundableAmount({ amountMinor: 1000n, refundedMinor: 900n }, 200n)).toBe(0n);
  });
});

describe("disbursement approval", () => {
  const base = { status: "REQUESTED", requestedById: "a", approverId: "b", supplierVerified: true, amount: 100n, available: 100n, hasInvoice: true };
  it("allows independent approval within available funds", () => expect(disbursementApprovalBlockers(base)).toEqual([]));
  it("blocks self-approval", () => expect(disbursementApprovalBlockers({ ...base, approverId: "a" }).join()).toMatch(/different finance officer/));
  it("blocks insufficient funds and unverified suppliers", () => {
    expect(disbursementApprovalBlockers({ ...base, available: 99n }).length).toBe(1);
    expect(disbursementApprovalBlockers({ ...base, supplierVerified: false }).length).toBe(1);
  });
});

describe("budget changes", () => {
  it("treats changes above 10% as material", () => {
    expect(isMaterialBudgetChange(1000n, 1100n)).toBe(false);
    expect(isMaterialBudgetChange(1000n, 1101n)).toBe(true);
    expect(isMaterialBudgetChange(1000n, 899n)).toBe(true);
  });
});

describe("misc validation", () => {
  it("normalises Nigerian phone numbers", () => {
    expect(normaliseNigerianPhone("0803 123 4567")).toBe("+2348031234567");
    expect(normaliseNigerianPhone("+234 803 123 4567")).toBe("+2348031234567");
    expect(normaliseNigerianPhone("12345")).toBeNull();
  });
  it("parses category checklists", () => {
    expect(parseChecklist("REMOTE: Confirm landlord quote\nFIELD: Visit property")).toHaveLength(2);
    expect(() => parseChecklist("Bad line")).toThrow();
  });
});
