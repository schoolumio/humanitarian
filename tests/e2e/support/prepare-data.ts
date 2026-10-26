/**
 * Creates the fictional preconditions for each journey using the real service layer, and
 * writes the identifiers the browser tests need to tests/e2e/.data.json.
 */
import { writeFileSync } from "node:fs";
import { hash } from "@node-rs/argon2";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { buildActor } from "@/server/actor";
import * as apps from "@/server/services/applications";
import * as cases from "@/server/services/cases";
import * as campaigns from "@/server/services/campaigns";
import * as iv from "@/server/services/interventions";
import * as media from "@/server/services/media";
import { uploadFile } from "@/server/services/files";
import { initiateDonation, processWebhook } from "@/server/services/payments";
import { buildSandboxWebhook, sandboxCompleteCheckout } from "@/lib/payments/sandbox";
import { resetDb } from "../../helpers/factory";
import { E2E_PASSWORD } from "./env";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4f30000000049454e44ae426082", "hex");
let passwordHash = "";

async function user(email: string, name: string, roles: Role[]) {
  const u = await db.user.create({ data: { email, name, passwordHash, emailVerifiedAt: new Date(), roles: { create: roles.map((role) => ({ role })) } }, include: { roles: true } });
  return buildActor(u);
}

async function submitted(applicant: Awaited<ReturnType<typeof user>>, categoryId: string, phone: string, consents: Record<string, boolean>) {
  const d = await apps.createDraft(applicant);
  await apps.saveStep(applicant, d.reference, 1, { fullName: `${applicant.name} Fictional`, phone, state: "Lagos", lga: "Ikorodu", community: "Example Close", householdSize: "3" });
  await apps.saveStep(applicant, d.reference, 2, { categoryId });
  await apps.saveStep(applicant, d.reference, 3, { whatHappened: "A fictional flood damaged the family's rented room last month.", assistanceNeeded: "Rent and replacement bedding.", whyNow: "Rent is due this month.", successOutcome: "Safe, stable housing." });
  await apps.saveStep(applicant, d.reference, 4, { items: [{ description: "Rent", quantity: "1", unitCost: "200000" }, { description: "Bedding", quantity: "1", unitCost: "50000" }] });
  await apps.saveStep(applicant, d.reference, 5, {});
  await apps.saveStep(applicant, d.reference, 6, { contactMethods: ["PHONE_CALL"] });
  await apps.saveConsents(applicant, d.reference, { ASSESSMENT_DATA_PROCESSING: true, ...consents });
  await apps.submitApplication(applicant, d.reference);
  return db.application.findUniqueOrThrow({ where: { reference: d.reference } });
}

async function toPendingApproval(appId: string, cm1: Awaited<ReturnType<typeof user>>, inv: Awaited<ReturnType<typeof user>>) {
  await cases.transitionCase(cm1, appId, "INITIAL_REVIEW", "Screening");
  await cases.assignInvestigator(cm1, appId, inv.userId, 2);
  const asg = await db.investigatorAssignment.findFirstOrThrow({ where: { applicationId: appId, investigatorId: inv.userId } });
  await cases.declareConflict(inv, asg.id, false, "");
  await cases.transitionCase(cm1, appId, "VERIFICATION_IN_PROGRESS", "Verify");
  for (const t of await db.verificationTask.findMany({ where: { applicationId: appId } })) await cases.updateTask(inv, appId, t.id, "DONE", "Checked");
  await cases.submitInvestigationReport(inv, appId, { summary: "Spoke with applicant and landlord.", findings: "Need confirmed.", recommendation: "APPROVE" });
  await cases.submitReview(cm1, appId, "APPROVE", "Evidence is consistent.");
  await cases.transitionCase(cm1, appId, "PENDING_APPROVAL", "Ready");
}

const CAMPAIGN = (title: string) => ({
  title, summary: "A family in Lagos State lost their rented room to flooding. Support will cover rent and bedding so the household can stay together safely.",
  locationLabel: "Ikorodu, Lagos State", interventionSummary: "Rent paid directly to the landlord and replacement bedding.",
  verificationSummary: "Verified by phone, a landlord confirmation and an independently reviewed investigation.",
  visibility: "PUBLIC", acceptsDonations: "on", acceptsSponsorship: "on", acceptsInKind: "on",
  budgetLines: [{ description: "Rent", amount: "200000" }, { description: "Bedding", amount: "50000" }],
});

async function main() {
  await resetDb();
  passwordHash = await hash(E2E_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const category = await db.caseCategory.create({ data: { slug: "emergency-accommodation", name: "Emergency accommodation and housing", description: "Short-term rent and safe accommodation." } });
  const cm1 = await user("cm1@e2e.test", "Case Manager One", ["CASE_MANAGER"]);
  const cm2 = await user("cm2@e2e.test", "Case Manager Two", ["CASE_MANAGER"]);
  const inv = await user("investigator@e2e.test", "Field Investigator", ["INVESTIGATOR"]);
  const fin1 = await user("finance1@e2e.test", "Finance One", ["FINANCE_OFFICER"]);
  const fin2 = await user("finance2@e2e.test", "Finance Two", ["FINANCE_OFFICER"]);
  const ed1 = await user("editor1@e2e.test", "Editor One", ["MEDIA_EDITOR"]);
  const ed2 = await user("editor2@e2e.test", "Editor Two", ["MEDIA_EDITOR"]);
  await user("sponsor@e2e.test", "Sponsor Rep", ["SPONSOR"]);
  await user("outsider@e2e.test", "Outsider Applicant", ["APPLICANT"]);

  // Journey B: submitted, assigned, conflict not yet declared.
  const appB = await submitted(await user("applicant.b@e2e.test", "Applicant Bee", ["APPLICANT"]), category.id, "08031110001", {});
  await cases.transitionCase(cm1, appB.id, "INITIAL_REVIEW", "Screening");
  await cases.assignInvestigator(cm1, appB.id, inv.userId, 1);
  await cases.transitionCase(cm1, appB.id, "VERIFICATION_IN_PROGRESS", "Verify");

  // Journey C: awaiting final decision (cm1 investigated? no – cm1 reviewed, so cm2 decides).
  const appC = await submitted(await user("applicant.c@e2e.test", "Applicant Cee", ["APPLICANT"]), category.id, "08031110002", { PUBLIC_CAMPAIGN_PAGE: true });
  await toPendingApproval(appC.id, cm1, inv);

  // Journey D/E: a published campaign.
  const applicantD = await user("applicant.d@e2e.test", "Applicant Dee", ["APPLICANT"]);
  const appD = await submitted(applicantD, category.id, "08031110003", { PUBLIC_CAMPAIGN_PAGE: true });
  // Journey H: a private evidence file belonging to applicant D.
  const evidence = await uploadFile(applicantD, { purpose: "APPLICATION_EVIDENCE", applicationId: appD.id, file: { name: "tenancy.png", size: PNG.length, arrayBuffer: async () => PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.length) as ArrayBuffer } });
  await toPendingApproval(appD.id, cm1, inv);
  await cases.decideCase(cm2, appD.id, { decision: "APPROVED", reasonInternal: "Verified need within policy.", approvedAmount: "250000" });
  const campD = await campaigns.createCampaign(cm1, appD.id, CAMPAIGN("Safe housing for a family in Ikorodu"));
  await campaigns.markReadyForPublication(cm1, campD.id);
  await campaigns.publishCampaign(cm2, campD.id);

  // Journeys G, I, J: a funded campaign with an intervention in progress and a published story.
  const applicantG = await user("applicant.g@e2e.test", "Applicant Gee", ["APPLICANT"]);
  const appG = await submitted(applicantG, category.id, "08031110004", { PUBLIC_CAMPAIGN_PAGE: true, SOCIAL_MEDIA: true, FILMING_AND_PHOTOGRAPHY: true });
  await toPendingApproval(appG.id, cm1, inv);
  await cases.decideCase(cm2, appG.id, { decision: "APPROVED", reasonInternal: "Verified need within policy.", approvedAmount: "250000" });
  const campG = await campaigns.createCampaign(cm1, appG.id, CAMPAIGN("Rebuilding after a flood in Ikorodu"));
  await campaigns.markReadyForPublication(cm1, campG.id);
  await campaigns.publishCampaign(cm2, campG.id);
  const pay = await initiateDonation(null, campG.publicId, { amount: "250000", email: "donor@e2e.test", name: "Fictional Donor", idempotencyKey: "e2eprepdonation000001" }, { ipHash: "e2e" });
  await sandboxCompleteCheckout(pay.reference, "success");
  const wh = buildSandboxWebhook("charge.success", { reference: pay.reference }, "evt_prep_1");
  await processWebhook("sandbox", wh.raw, new Headers({ "x-sandbox-signature": wh.signature }));
  const intervention = await iv.createIntervention(cm1, campG.id, { scope: "Pay rent and buy bedding.", plannedOutcome: "Family housed safely.", approvedBudget: "250000" });
  await iv.moveIntervention(cm1, intervention.id, "IN_PROGRESS", "Funded");
  const supplier = await iv.createSupplier(fin1, { name: "Fictional Landlord Properties" });
  await iv.verifySupplier(fin2, supplier.id);
  const disb = await iv.requestDisbursement(fin1, intervention.id, { supplierId: supplier.id, amount: "200000", purpose: "Rent paid to landlord", invoiceNumber: "INV-E2E-1" });
  const file = await uploadFile(ed1, { purpose: "MEDIA_ORIGINAL", file: { name: "before.png", size: PNG.length, arrayBuffer: async () => PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.length) as ArrayBuffer } });
  const asset = await media.addMediaAsset(ed1, { campaignId: campG.id, fileId: file.id, kind: "PHOTO", phase: "BEFORE", altText: "A damaged rented room", depictsBeneficiary: "on" });
  await media.reviewMediaAsset(ed2, asset.id, true);
  const story = await media.createStory(ed1, { campaignId: campG.id, type: "CASE_STORY", channel: "SOCIAL_MEDIA", title: "Starting again after the flood", body: "A family is preparing to move into safe accommodation." });
  await media.submitStoryForReview(ed1, story.id);
  await media.approveStory(ed2, story.id);
  await media.publishStory(ed2, story.id, "https://social.example/kindspring/post/1");

  const data = {
    appB: { id: appB.id, reference: appB.reference },
    appC: { id: appC.id, reference: appC.reference },
    campaignD: { id: campD.id, publicId: campD.publicId },
    campaignG: { id: campG.id, publicId: campG.publicId },
    appG: { reference: appG.reference },
    interventionG: intervention.id,
    disbursementG: disb.id,
    storyG: story.id,
    evidenceFileD: evidence.id,
  };
  writeFileSync("tests/e2e/.data.json", JSON.stringify(data, null, 2));
  console.log("E2E data prepared.");
}

main().then(() => db.$disconnect()).catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
