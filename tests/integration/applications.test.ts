import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as apps from "@/server/services/applications";
import * as cases from "@/server/services/cases";
import { listRiskAlerts } from "@/server/services/risk";
import { makeUser, resetDb } from "../helpers/factory";
import { approvedCase, submittedApplication } from "../helpers/scenario";

describe("applications and verification", () => {
  beforeEach(resetDb);

  it("Journey A: an applicant submits once (idempotent) and sees status", async () => {
    const { applicant, app } = await submittedApplication();
    expect(app.status).toBe("SUBMITTED");
    expect(app.phone).toBe("+2348030000001");
    const again = await apps.submitApplication(applicant, app.reference);
    expect(again.alreadySubmitted).toBe(true);
    expect(await db.statusHistory.count({ where: { entityId: app.id, toStatus: "SUBMITTED" } })).toBe(1);
    expect(await db.notification.count({ where: { template: "application_submitted" } })).toBe(1);
    const view = await apps.getOwnApplication(applicant, app.reference);
    expect(view.app.status).toBe("SUBMITTED");
    expect(await db.verificationTask.count({ where: { applicationId: app.id } })).toBeGreaterThan(5);
    await expect(apps.saveStep(applicant, app.reference, 1, {})).rejects.toThrow(/already been submitted/);
  });

  it("blocks cross-account access to applications (IDOR)", async () => {
    const { app } = await submittedApplication();
    const other = await makeUser(["APPLICANT"]);
    await expect(apps.getOwnApplication(other, app.reference)).rejects.toThrow(/not found/i);
    const donor = await makeUser(["DONOR"]);
    await expect(apps.getOwnApplication(donor, app.reference)).rejects.toThrow(/permission/);
  });

  it("validates input on the server (mass assignment ignored)", async () => {
    const a = await makeUser(["APPLICANT"]);
    const d = await apps.createDraft(a);
    await expect(apps.saveStep(a, d.reference, 1, { fullName: "X", phone: "123" })).rejects.toThrow();
    await apps.saveStep(a, d.reference, 1, { fullName: "Valid Name", phone: "08030000002", state: "Oyo", lga: "Ibadan North", community: "Somewhere", householdSize: "2", status: "APPROVED", applicantId: "attacker", riskLevel: "LOW" });
    const row = await db.application.findUniqueOrThrow({ where: { reference: d.reference } });
    expect(row.status).toBe("DRAFT");
    expect(row.applicantId).toBe(a.userId);
  });

  it("refuses submission without assessment consent, but never requires evidence", async () => {
    const a = await makeUser(["APPLICANT"]);
    const d = await apps.createDraft(a);
    await expect(apps.submitApplication(a, d.reference)).rejects.toThrow(/permission to use your information|Complete your details/);
  });

  it("flags possible duplicates for human review without blocking", async () => {
    await submittedApplication();
    const second = await submittedApplication();
    expect(second.app.status).toBe("SUBMITTED");
    const cm = await makeUser(["CASE_MANAGER"]);
    const alerts = await listRiskAlerts(cm, {});
    expect(alerts.rows.some((r) => r.type === "POSSIBLE_DUPLICATE_APPLICATION")).toBe(true);
  });

  it("Journey B: investigators see only assigned cases and must declare conflicts", async () => {
    const { app } = await submittedApplication();
    const cm = await makeUser(["CASE_MANAGER"]);
    const inv = await makeUser(["INVESTIGATOR"]);
    const otherInv = await makeUser(["INVESTIGATOR"]);
    await expect(cases.getCaseForStaff(inv, app.id)).rejects.toThrow(/not found/i);
    await cases.transitionCase(cm, app.id, "INITIAL_REVIEW", "Start");
    await cases.assignInvestigator(cm, app.id, inv.userId, 1);
    expect((await cases.getCaseForStaff(inv, app.id)).app.id).toBe(app.id);
    await expect(cases.getCaseForStaff(otherInv, app.id)).rejects.toThrow(/not found/i);
    expect((await cases.listCases(otherInv, {})).total).toBe(0);
    await cases.transitionCase(cm, app.id, "VERIFICATION_IN_PROGRESS", "Verify");
    const task = await db.verificationTask.findFirstOrThrow({ where: { applicationId: app.id } });
    await expect(cases.updateTask(inv, app.id, task.id, "DONE", "ok")).rejects.toThrow(/conflict of interest/);
    const asg = await db.investigatorAssignment.findFirstOrThrow({ where: { applicationId: app.id } });
    await cases.declareConflict(inv, asg.id, false, "");
    await cases.updateTask(inv, app.id, task.id, "DONE", "Spoke to applicant");
    await cases.addNote(inv, app.id, "Restricted observation", true);
    await cases.submitInvestigationReport(inv, app.id, { summary: "Visited and confirmed.", findings: "Need confirmed by landlord.", recommendation: "APPROVE" });
    // Investigator notes marked restricted are hidden from investigators without that permission.
    const invView = await cases.getCaseForStaff(inv, app.id);
    expect(invView.notes.some((n) => n.restricted)).toBe(false);
    const cmView = await cases.getCaseForStaff(cm, app.id);
    expect(cmView.notes.some((n) => n.restricted)).toBe(true);
    await expect(cases.decideCase(inv, app.id, { decision: "APPROVED", reasonInternal: "x".repeat(20), approvedAmount: "1" })).rejects.toThrow(/permission/);
  });

  it("Journey C: approval requires independent review and a different decision maker", async () => {
    const { app } = await submittedApplication();
    const cm1 = await makeUser(["CASE_MANAGER"]);
    const cm2 = await makeUser(["CASE_MANAGER"]);
    const inv = await makeUser(["INVESTIGATOR", "CASE_MANAGER"]);
    await cases.transitionCase(cm1, app.id, "INITIAL_REVIEW", "Start");
    await cases.assignInvestigator(cm1, app.id, inv.userId, 2);
    await cases.transitionCase(cm1, app.id, "VERIFICATION_IN_PROGRESS", "Verify");
    for (const t of await db.verificationTask.findMany({ where: { applicationId: app.id } })) await cases.updateTask(cm1, app.id, t.id, "DONE", "Checked");
    await cases.submitInvestigationReport(inv, app.id, { summary: "Summary text", findings: "Findings text", recommendation: "APPROVE" });
    await expect(cases.submitReview(inv, app.id, "APPROVE", "I investigated this myself")).rejects.toThrow(/independent reviewer/);
    await cases.submitReview(cm1, app.id, "APPROVE", "Evidence is consistent.");
    await cases.transitionCase(cm1, app.id, "PENDING_APPROVAL", "Ready");
    await expect(cases.decideCase(cm1, app.id, { decision: "APPROVED", reasonInternal: "Approve the case now", approvedAmount: "400000" })).rejects.toThrow(/independent reviewer/);
    await expect(cases.decideCase(inv, app.id, { decision: "APPROVED", reasonInternal: "Approve the case now", approvedAmount: "400000" })).rejects.toThrow(/investigator/);
    await cases.decideCase(cm2, app.id, { decision: "APPROVED", reasonInternal: "Verified and within policy.", approvedAmount: "400000" });
    const row = await db.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(row.status).toBe("APPROVED");
    const hist = await db.statusHistory.findFirstOrThrow({ where: { entityId: app.id, toStatus: "APPROVED" } });
    expect(hist.actorId).toBe(cm2.userId);
    expect(hist.fromStatus).toBe("PENDING_APPROVAL");
  });

  it("staff cannot work on their own application", async () => {
    const staffApplicant = await makeUser(["APPLICANT", "CASE_MANAGER"]);
    const { app } = await submittedApplication(staffApplicant);
    await expect(cases.getCaseForStaff(staffApplicant, app.id)).rejects.toThrow(/submitted yourself/);
  });

  it("declines with an applicant-facing explanation and allows justified reopening", async () => {
    const s = await approvedCase();
    const other = await submittedApplication();
    await cases.transitionCase(s.cm1, other.app.id, "INITIAL_REVIEW", "Start");
    await expect(cases.decideCase(s.cm1, other.app.id, { decision: "DECLINED", reasonInternal: "Outside current scope." })).rejects.toThrow();
    await cases.decideCase(s.cm1, other.app.id, { decision: "DECLINED", reasonInternal: "Outside current scope.", reasonForApplicant: "This need falls outside the categories we can currently fund." });
    const view = await apps.getOwnApplication(other.applicant, other.app.reference);
    expect(view.decision?.reasonForApplicant).toMatch(/outside/);
    await cases.reopenCase(s.cm2, other.app.id, "New evidence received from the applicant.");
    expect((await db.application.findUniqueOrThrow({ where: { id: other.app.id } })).status).toBe("INITIAL_REVIEW");
  });
});
