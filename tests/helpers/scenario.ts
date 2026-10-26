import { db } from "@/lib/db";
import type { Actor } from "@/server/actor";
import * as apps from "@/server/services/applications";
import * as cases from "@/server/services/cases";
import * as campaigns from "@/server/services/campaigns";
import { makeCategory, makeUser } from "./factory";

/** Fictional applicant data used across tests. */
export const FICTIONAL = {
  fullName: "Ngozi Example Testcase",
  phone: "0803 000 0001",
  state: "Lagos",
  lga: "Ikorodu",
  community: "Sample Street Estate",
  householdSize: "4",
};

export async function submittedApplication(applicant?: Actor, overrides: Partial<typeof FICTIONAL> = {}) {
  const a = applicant ?? (await makeUser(["APPLICANT"], "Applicant Person"));
  const category = await makeCategory();
  const draft = await apps.createDraft(a);
  await apps.saveStep(a, draft.reference, 1, { ...FICTIONAL, ...overrides });
  await apps.saveStep(a, draft.reference, 2, { categoryId: category.id });
  await apps.saveStep(a, draft.reference, 3, {
    whatHappened: "A fictional fire damaged the rented room and household items last month.",
    assistanceNeeded: "Six months of rent and basic household items.",
    whyNow: "The landlord requires payment this month.",
    successOutcome: "Stable accommodation for the household.",
  });
  await apps.saveStep(a, draft.reference, 4, {
    items: [
      { description: "Rent (6 months)", quantity: "1", unitCost: "300000" },
      { description: "Mattress", quantity: "2", unitCost: "50000" },
    ],
  });
  await apps.saveStep(a, draft.reference, 5, {});
  await apps.saveStep(a, draft.reference, 6, { contactMethods: ["PHONE_CALL", "SMS"] });
  await apps.saveConsents(a, draft.reference, {
    ASSESSMENT_DATA_PROCESSING: true,
    PUBLIC_CAMPAIGN_PAGE: true,
    SPONSOR_REPORTING: true,
    FILMING_AND_PHOTOGRAPHY: true,
    SOCIAL_MEDIA: true,
  });
  await apps.submitApplication(a, draft.reference);
  const app = await db.application.findUniqueOrThrow({ where: { reference: draft.reference } });
  return { applicant: a, app, category };
}

/** Run a case through verification to APPROVED with proper separation of duties. */
export async function approvedCase() {
  const s = await submittedApplication();
  const cm1 = await makeUser(["CASE_MANAGER"], "Case Manager One");
  const cm2 = await makeUser(["CASE_MANAGER"], "Case Manager Two");
  const inv = await makeUser(["INVESTIGATOR"], "Investigator Person");
  await cases.transitionCase(cm1, s.app.id, "INITIAL_REVIEW", "Screening started");
  await cases.assignInvestigator(cm1, s.app.id, inv.userId, 2);
  const asg = await db.investigatorAssignment.findFirstOrThrow({
    where: { applicationId: s.app.id, investigatorId: inv.userId },
  });
  await cases.declareConflict(inv, asg.id, false, "");
  await cases.transitionCase(cm1, s.app.id, "VERIFICATION_IN_PROGRESS", "Remote verification");
  const tasks = await db.verificationTask.findMany({ where: { applicationId: s.app.id } });
  for (const t of tasks) await cases.updateTask(inv, s.app.id, t.id, "DONE", "Checked");
  await cases.submitInvestigationReport(inv, s.app.id, {
    summary: "Spoke with applicant and landlord.",
    findings: "Need confirmed; quote matches local prices.",
    recommendation: "APPROVE",
  });
  await cases.submitReview(cm1, s.app.id, "APPROVE", "Findings are consistent and well evidenced.");
  await cases.transitionCase(cm1, s.app.id, "PENDING_APPROVAL", "Ready for decision");
  await cases.decideCase(cm2, s.app.id, {
    decision: "APPROVED",
    reasonInternal: "Verified need within policy.",
    approvedAmount: "400000",
  });
  return { ...s, cm1, cm2, inv };
}

export const CAMPAIGN_INPUT = {
  title: "Safe accommodation for a family of four",
  summary:
    "A family in Lagos State lost their rented room to a fire. Support will cover six months' rent and replace essential bedding so the household can stay together safely.",
  locationLabel: "Ikorodu, Lagos State",
  interventionSummary: "Six months' rent paid directly to the landlord, plus two mattresses.",
  verificationSummary:
    "Verified by phone, a landlord confirmation and an investigator report reviewed independently.",
  visibility: "PUBLIC",
  acceptsDonations: "on",
  acceptsSponsorship: "on",
  acceptsInKind: "on",
  budgetLines: [
    { description: "Rent (6 months)", amount: "300000" },
    { description: "Two mattresses", amount: "100000" },
  ],
};

export async function publishedCampaign() {
  const s = await approvedCase();
  const c = await campaigns.createCampaign(s.cm1, s.app.id, CAMPAIGN_INPUT);
  await campaigns.markReadyForPublication(s.cm1, c.id);
  await campaigns.publishCampaign(s.cm2, c.id);
  const campaign = await db.campaign.findUniqueOrThrow({ where: { id: c.id } });
  return { ...s, campaign };
}
