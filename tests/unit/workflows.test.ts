import { describe, expect, it } from "vitest";
import { APPLICATION_TRANSITIONS } from "@/lib/workflow/application";
import { CAMPAIGN_TRANSITIONS, fundingStatusFor } from "@/lib/workflow/campaign";
import { canMovePayment, statusAfterRefund } from "@/lib/workflow/payment";
import {
  canMoveIntervention,
  completionBlockers,
  DEFAULT_COMPLETION_CHECKLIST,
} from "@/lib/workflow/intervention";
import { assertTransition, canTransition, InvalidTransitionError } from "@/lib/workflow/machine";
import { permissionsFor } from "@/lib/permissions";

describe("application state machine", () => {
  const owner = { permissions: new Set<never>(), isOwner: true };
  it("lets the owner submit and withdraw drafts only", () => {
    expect(canTransition(APPLICATION_TRANSITIONS, "DRAFT", "SUBMITTED", owner)).toBe(true);
    expect(canTransition(APPLICATION_TRANSITIONS, "PENDING_APPROVAL", "APPROVED", owner)).toBe(false);
  });
  it("only case.decide can approve or decline", () => {
    const cm = { permissions: permissionsFor(["CASE_MANAGER"]) };
    const inv = { permissions: permissionsFor(["INVESTIGATOR"]) };
    expect(canTransition(APPLICATION_TRANSITIONS, "PENDING_APPROVAL", "APPROVED", cm)).toBe(true);
    expect(canTransition(APPLICATION_TRANSITIONS, "PENDING_APPROVAL", "APPROVED", inv)).toBe(false);
    expect(
      canTransition(APPLICATION_TRANSITIONS, "VERIFICATION_IN_PROGRESS", "FIELD_VISIT_REQUIRED", inv),
    ).toBe(true);
  });
  it("rejects invalid transitions explicitly", () => {
    expect(() => assertTransition("Application", APPLICATION_TRANSITIONS, "SUBMITTED", "APPROVED")).toThrow(
      InvalidTransitionError,
    );
    expect(() => assertTransition("Application", APPLICATION_TRANSITIONS, "CLOSED", "SUBMITTED")).toThrow();
  });
  it("cannot skip verification straight to approval from submission", () => {
    expect(APPLICATION_TRANSITIONS.SUBMITTED.APPROVED).toBeUndefined();
  });
});

describe("campaign state machine", () => {
  it("funding transitions are SYSTEM-only", () => {
    expect(CAMPAIGN_TRANSITIONS.PUBLISHED.FUNDING_IN_PROGRESS).toEqual(["SYSTEM"]);
    expect(
      canTransition(CAMPAIGN_TRANSITIONS, "PUBLISHED", "FULLY_FUNDED", {
        permissions: permissionsFor(["SUPER_ADMIN", "CASE_MANAGER"]),
      }),
    ).toBe(false);
  });
  it("derives funding status from confirmed net funding", () => {
    expect(fundingStatusFor("PUBLISHED", 0n, 100n)).toBe("PUBLISHED");
    expect(fundingStatusFor("PUBLISHED", 40n, 100n)).toBe("FUNDING_IN_PROGRESS");
    expect(fundingStatusFor("FUNDING_IN_PROGRESS", 100n, 100n)).toBe("FULLY_FUNDED");
    expect(fundingStatusFor("FULLY_FUNDED", 60n, 100n)).toBe("FUNDING_IN_PROGRESS");
    expect(fundingStatusFor("FULLY_FUNDED", 0n, 100n)).toBe("FUNDING_IN_PROGRESS");
    // A funded campaign whose intervention is underway is unaffected.
    expect(fundingStatusFor("INTERVENTION_IN_PROGRESS", 0n, 100n)).toBe("INTERVENTION_IN_PROGRESS");
  });
  it("completion requires outcome review", () => {
    expect(CAMPAIGN_TRANSITIONS.FULLY_FUNDED.COMPLETED).toBeUndefined();
    expect(CAMPAIGN_TRANSITIONS.OUTCOME_REVIEW.COMPLETED).toEqual(["intervention.outcome_review"]);
  });
});

describe("payment state machine", () => {
  it("only reaches SUCCEEDED from pending/created/failed", () => {
    expect(canMovePayment("PENDING", "SUCCEEDED")).toBe(true);
    expect(canMovePayment("FAILED", "SUCCEEDED")).toBe(true);
    expect(canMovePayment("SUCCEEDED", "SUCCEEDED")).toBe(false);
    expect(canMovePayment("REFUNDED", "SUCCEEDED")).toBe(false);
    expect(canMovePayment("SUCCEEDED", "FAILED")).toBe(false);
  });
  it("computes post-refund status", () => {
    expect(statusAfterRefund(100n, 0n)).toBe("SUCCEEDED");
    expect(statusAfterRefund(100n, 30n)).toBe("PARTIALLY_REFUNDED");
    expect(statusAfterRefund(100n, 100n)).toBe("REFUNDED");
  });
});

describe("intervention rules", () => {
  it("prevents completion without evidence, checklist or with unpaid disbursements", () => {
    const checklist = DEFAULT_COMPLETION_CHECKLIST.map((i) => ({ ...i }));
    expect(completionBlockers({ checklist, deliveryEvidenceCount: 0, openDisbursements: 1 }).length).toBe(
      checklist.length + 2,
    );
    expect(
      completionBlockers({
        checklist: checklist.map((i) => ({ ...i, done: true })),
        deliveryEvidenceCount: 1,
        openDisbursements: 0,
      }),
    ).toEqual([]);
  });
  it("supports partial delivery and unsuccessful outcomes", () => {
    expect(canMoveIntervention("IN_PROGRESS", "PARTIALLY_DELIVERED")).toBe(true);
    expect(canMoveIntervention("IN_PROGRESS", "UNSUCCESSFUL")).toBe(true);
    expect(canMoveIntervention("PLANNING", "COMPLETED")).toBe(false);
  });
});
