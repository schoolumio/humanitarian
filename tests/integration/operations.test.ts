import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { fundBalance, postJournal } from "@/lib/ledger/journal";
import * as iv from "@/server/services/interventions";
import * as media from "@/server/services/media";
import * as sponsors from "@/server/services/sponsors";
import * as apps from "@/server/services/applications";
import { getDownloadUrl, uploadFile, canAccessFile } from "@/server/services/files";
import { setRole } from "@/server/services/admin";
import { submitComplaint, listComplaints, getComplaint } from "@/server/services/complaints";
import { audit } from "@/lib/audit";
import { makeUser, resetDb } from "../helpers/factory";
import { publishedCampaign, submittedApplication } from "../helpers/scenario";
import { donate, payAndNotify } from "../helpers/payments";

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4f30000000049454e44ae426082",
  "hex",
);
const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
const fakeFile = (name = "photo.png", bytes: Buffer = PNG) => ({
  name,
  size: bytes.length,
  arrayBuffer: async () =>
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer,
});

async function fundedCampaign() {
  const s = await publishedCampaign();
  const p = await donate(s.campaign.publicId, "400000");
  await payAndNotify(p.reference);
  return s;
}

describe("operations: files, interventions, finance controls, media, sponsors", () => {
  beforeEach(resetDb);

  it("Journey H: private documents are denied to unauthorised users and access is audited", async () => {
    const { applicant, app } = await submittedApplication();
    const file = await uploadFile(applicant, {
      purpose: "APPLICATION_EVIDENCE",
      applicationId: app.id,
      file: fakeFile(),
    });
    expect(await getDownloadUrl(applicant, file.id)).toMatch(/^\/api\/files\/local\?/);

    const otherApplicant = await makeUser(["APPLICANT"]);
    const donor = await makeUser(["DONOR"]);
    const sponsor = await makeUser(["SPONSOR"]);
    const unassignedInvestigator = await makeUser(["INVESTIGATOR"]);
    const admin = await makeUser(["ADMIN"]);
    for (const a of [otherApplicant, donor, sponsor, unassignedInvestigator, admin]) {
      await expect(getDownloadUrl(a, file.id)).rejects.toThrow(/not found/i);
    }
    await expect(getDownloadUrl(null, file.id)).rejects.toThrow(/sign in/i);
    const cm = await makeUser(["CASE_MANAGER"]);
    expect(await getDownloadUrl(cm, file.id)).toBeTruthy();
    expect(await db.auditLog.count({ where: { action: "file.access_denied", entityId: file.id } })).toBe(5);
    expect(await db.auditLog.count({ where: { action: "file.download", entityId: file.id } })).toBe(2);
  });

  it("rejects disguised and oversized uploads and uploads to others' applications", async () => {
    const { applicant, app } = await submittedApplication();
    await expect(
      uploadFile(applicant, {
        purpose: "APPLICATION_EVIDENCE",
        applicationId: app.id,
        file: fakeFile("evil.png", Buffer.from("MZ\x90\x00binary")),
      }),
    ).rejects.toThrow(/not accepted/);
    await expect(
      uploadFile(applicant, {
        purpose: "APPLICATION_EVIDENCE",
        applicationId: app.id,
        file: { ...fakeFile(), size: 5 * 1024 * 1024 },
      }),
    ).rejects.toThrow(/4 MB/);
    const other = await makeUser(["APPLICANT"]);
    await expect(
      uploadFile(other, { purpose: "APPLICATION_EVIDENCE", applicationId: app.id, file: fakeFile() }),
    ).rejects.toThrow(/not found/i);
    await expect(
      uploadFile(applicant, { purpose: "MEDIA_PUBLIC", applicationId: app.id, file: fakeFile() }),
    ).rejects.toThrow(/Unsupported/);
  });

  it("Journey I: disbursements require independent approval, verified suppliers and available funds", async () => {
    const s = await fundedCampaign();
    const f1 = await makeUser(["FINANCE_OFFICER"], "Finance One");
    const f2 = await makeUser(["FINANCE_OFFICER"], "Finance Two");
    const admin = await makeUser(["ADMIN", "SUPER_ADMIN"]);
    const intervention = await iv.createIntervention(s.cm1, s.campaign.id, {
      scope: "Pay rent to landlord and buy mattresses.",
      plannedOutcome: "Family housed for six months.",
      approvedBudget: "400000",
    });
    await iv.moveIntervention(s.cm1, intervention.id, "IN_PROGRESS", "Funded");
    const supplier = await iv.createSupplier(f1, { name: "Fictional Landlord Properties" });
    const d = await iv.requestDisbursement(f1, intervention.id, {
      supplierId: supplier.id,
      amount: "300000",
      purpose: "Six months' rent",
      invoiceNumber: "INV-1",
    });

    await expect(iv.approveDisbursement(f2, d.id)).rejects.toThrow(/not been independently verified/);
    await expect(iv.verifySupplier(f1, supplier.id)).rejects.toThrow(/different person/);
    await iv.verifySupplier(f2, supplier.id);
    await expect(iv.approveDisbursement(f1, d.id)).rejects.toThrow(/different finance officer/);
    await expect(iv.approveDisbursement(admin, d.id)).rejects.toThrow(/permission/);
    // The database itself refuses self-approval even if application code were bypassed.
    await expect(
      db.disbursement.update({ where: { id: d.id }, data: { approvedById: f1.userId } }),
    ).rejects.toThrow();

    await iv.approveDisbursement(f2, d.id);
    await iv.markDisbursementPaid(f2, d.id, "BANK-REF-001");
    const balance = await fundBalance(db, s.campaign.id);
    expect(balance).toBe(40_000_000n - 600_000n - 30_000_000n);
    const big = await iv.requestDisbursement(f1, intervention.id, {
      supplierId: supplier.id,
      amount: "100000",
      purpose: "More than is left",
      invoiceNumber: "INV-2",
    });
    await expect(iv.approveDisbursement(f2, big.id)).rejects.toThrow(/Insufficient restricted funds/);
  });

  it("material budget changes need independent approval", async () => {
    const s = await fundedCampaign();
    const f1 = await makeUser(["FINANCE_OFFICER"]);
    const intervention = await iv.createIntervention(s.cm1, s.campaign.id, {
      scope: "Pay rent to landlord and buy mattresses.",
      plannedOutcome: "Family housed for six months.",
      approvedBudget: "400000",
    });
    // Small change within the published budget: applied directly (still audited).
    expect(await iv.requestBudgetChange(s.cm1, intervention.id, "390000", "Mattress price decrease")).toEqual(
      { material: false, requiresApproval: false },
    );
    expect(
      (await db.intervention.findUniqueOrThrow({ where: { id: intervention.id } })).approvedBudgetMinor,
    ).toBe(39_000_000n);
    // Any increase beyond the published target needs approval even if small.
    expect(
      (await iv.requestBudgetChange(s.cm1, intervention.id, "410000", "Price increase")).requiresApproval,
    ).toBe(true);
    await iv.decideBudgetChange(
      await makeUser(["FINANCE_OFFICER"]),
      (await db.budgetChangeRequest.findFirstOrThrow({ where: { status: "PENDING" } })).id,
      false,
    );
    expect(
      (await iv.requestBudgetChange(s.cm1, intervention.id, "200000", "Landlord reduced rent significantly"))
        .material,
    ).toBe(true);
    const req = await db.budgetChangeRequest.findFirstOrThrow({ where: { status: "PENDING" } });
    await expect(iv.decideBudgetChange(s.cm1, req.id, true)).rejects.toThrow(/permission/);
    await iv.decideBudgetChange(f1, req.id, true);
    expect(
      (await db.intervention.findUniqueOrThrow({ where: { id: intervention.id } })).approvedBudgetMinor,
    ).toBe(20_000_000n);
  });

  it("Journey G: delivery evidence + independent outcome review complete the case; an editor publishes the outcome report", async () => {
    const s = await fundedCampaign();
    const intervention = await iv.createIntervention(s.cm1, s.campaign.id, {
      scope: "Pay rent to landlord and buy mattresses.",
      plannedOutcome: "Family housed for six months.",
      approvedBudget: "400000",
    });
    await iv.moveIntervention(s.cm1, intervention.id, "IN_PROGRESS", "Funded");
    await iv.recordDelivery(s.cm1, intervention.id, {
      description: "Rent paid to landlord; mattresses delivered and received by the beneficiary.",
      deliveredAt: new Date().toISOString(),
    });
    await iv.moveIntervention(s.cm1, intervention.id, "DELIVERED", "All items delivered");
    await iv.moveIntervention(s.cm1, intervention.id, "OUTCOME_REVIEW", "Ready for review");
    await expect(
      iv.completeOutcomeReview(s.cm2, intervention.id, {
        outcomeSummary: "The family moved in and confirmed receipt.",
        result: "COMPLETED",
      }),
    ).rejects.toThrow(/Checklist/);
    await iv.updateChecklist(s.cm1, intervention.id, [
      "scope_delivered",
      "delivery_evidence",
      "invoices_matched",
      "beneficiary_confirmed",
      "feedback_recorded",
    ]);
    await expect(
      iv.completeOutcomeReview(s.cm1, intervention.id, {
        outcomeSummary: "The family moved in and confirmed receipt.",
        result: "COMPLETED",
      }),
    ).rejects.toThrow(/own case manager/);
    await iv.completeOutcomeReview(s.cm2, intervention.id, {
      outcomeSummary: "The family moved in and confirmed receipt.",
      result: "COMPLETED",
    });
    expect((await db.campaign.findUniqueOrThrow({ where: { id: s.campaign.id } })).status).toBe("COMPLETED");
    expect((await db.application.findUniqueOrThrow({ where: { id: s.app.id } })).status).toBe("CLOSED");
    // Unspent balance is flagged rather than moved.
    expect(await db.riskAlert.count({ where: { type: "UNSPENT_BALANCE" } })).toBe(1);

    const editor1 = await makeUser(["MEDIA_EDITOR"]);
    const editor2 = await makeUser(["MEDIA_EDITOR"]);
    const story = await media.createStory(editor1, {
      campaignId: s.campaign.id,
      type: "COMPLETION_REPORT",
      channel: "CAMPAIGN_PAGE",
      title: "Support delivered",
      body: "Rent was paid and bedding delivered. The family confirmed they are settled.",
    });
    await media.submitStoryForReview(editor1, story.id);
    await expect(media.approveStory(editor1, story.id)).rejects.toThrow(/different editor/);
    await media.approveStory(editor2, story.id);
    await media.publishStory(editor2, story.id);
    const { getPublicCampaign } = await import("@/server/services/campaigns");
    const pub = await getPublicCampaign(s.campaign.publicId);
    expect(pub?.stories.map((x) => x.title)).toContain("Support delivered");
    expect(json(pub)).not.toMatch(/Ngozi|Sample Street|0803/);
  });

  it("Journey J: withdrawing consent moves publications to review and removes public copies", async () => {
    const s = await publishedCampaign();
    const e1 = await makeUser(["MEDIA_EDITOR"]);
    const e2 = await makeUser(["MEDIA_EDITOR"]);
    const file = await uploadFile(e1, { purpose: "MEDIA_ORIGINAL", file: fakeFile() });
    const asset = await media.addMediaAsset(e1, {
      campaignId: s.campaign.id,
      fileId: file.id,
      kind: "PHOTO",
      phase: "BEFORE",
      altText: "A rented room before repairs",
      depictsBeneficiary: "on",
    });
    await media.reviewMediaAsset(e2, asset.id, true);
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } })).publicFileId).toBeNull(); // approval alone does not publish
    const story = await media.createStory(e1, {
      campaignId: s.campaign.id,
      type: "CASE_STORY",
      channel: "CAMPAIGN_PAGE",
      title: "Starting again",
      body: "A family is preparing to move into safe accommodation.",
      mediaIds: [asset.id],
    });
    await media.submitStoryForReview(e1, story.id);
    await media.approveStory(e2, story.id);
    await media.publishStory(e2, story.id);
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } })).publicFileId).not.toBeNull();
    const social = await media.createStory(e1, {
      campaignId: s.campaign.id,
      type: "SOCIAL_POST",
      channel: "SOCIAL_MEDIA",
      title: "Social post",
      body: "Text for an approved social media post.",
    });
    await media.submitStoryForReview(e1, social.id);
    await media.approveStory(e2, social.id);
    await expect(media.publishStory(e2, social.id)).rejects.toThrow(/https/);
    await media.publishStory(e2, social.id, "https://social.example/post/1");

    await apps.saveConsents(s.applicant, s.app.reference, {
      FILMING_AND_PHOTOGRAPHY: false,
      SOCIAL_MEDIA: false,
    });
    const [st, so, as] = await Promise.all([
      db.story.findUniqueOrThrow({ where: { id: story.id } }),
      db.story.findUniqueOrThrow({ where: { id: social.id } }),
      db.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } }),
    ]);
    expect(st.status).toBe("UNDER_CONSENT_REVIEW");
    expect(so.status).toBe("UNDER_CONSENT_REVIEW");
    expect(as.publicFileId).toBeNull();
    expect(await db.riskAlert.count({ where: { type: "CONSENT_WITHDRAWN" } })).toBe(1);
    // Re-approval is blocked while consent is withdrawn.
    await media.submitStoryForReview(e1, social.id);
    await expect(media.approveStory(e2, social.id)).rejects.toThrow(/not consented/);
  });

  it("Journey F: sponsor onboarding, enquiry, agreement (prepare → approve → sign); no personal data exposed", async () => {
    const s = await publishedCampaign();
    const rep = await makeUser(["SPONSOR"], "Sponsor Rep");
    const f1 = await makeUser(["FINANCE_OFFICER"]);
    await expect(sponsors.listSponsorCases(rep, {})).rejects.toThrow(/Register your organisation/);
    const org = await sponsors.registerOrganisation(rep, {
      name: "Fictional Foods Ltd",
      contactEmail: "csr@fictional.test",
      isAuthorisedRepresentative: "on",
    });
    await expect(sponsors.listSponsorCases(rep, {})).rejects.toThrow(/awaiting review/);
    await sponsors.submitProposal(rep, {
      type: "ENQUIRY",
      message: "We would like to learn about sponsoring housing cases.",
    });
    await expect(
      sponsors.submitProposal(rep, {
        campaignId: s.campaign.id,
        type: "FULL_CASH_SPONSORSHIP",
        message: "We would like to fund this entire case.",
        proposedAmount: "400000",
      }),
    ).rejects.toThrow(/approved/);
    await sponsors.reviewOrganisation(
      s.cm1,
      org.id,
      "APPROVED",
      "CAC registration and representative checked.",
    );
    const cases = await sponsors.listSponsorCases(rep, { maxBudget: "500000" });
    expect(cases.map((c) => c.publicId)).toContain(s.campaign.publicId);
    expect(json(cases)).not.toMatch(/Ngozi|0803|Sample Street|applicationId/);
    const proposal = await sponsors.submitProposal(rep, {
      campaignId: s.campaign.id,
      type: "FULL_CASH_SPONSORSHIP",
      message: "We would like to fund this entire case.",
      proposedAmount: "400000",
    });
    const ag = await sponsors.prepareAgreement(s.cm1, proposal.id, {
      pledgedAmount: "400000",
      terms:
        "Sponsor funds the full approved budget. Quarterly reports. No beneficiary contact. Unspent funds follow the published policy.",
      brandingPermitted: "on",
    });
    await expect(sponsors.signAgreement(rep, ag.id, "Sponsor Rep")).rejects.toThrow(/not ready/);
    await expect(sponsors.approveAgreement(s.cm1, ag.id)).rejects.toThrow(/permission/);
    await sponsors.approveAgreement(f1, ag.id);
    await sponsors.signAgreement(rep, ag.id, "Sponsor Rep");
    expect((await db.campaign.findUniqueOrThrow({ where: { id: s.campaign.id } })).confirmedAmountMinor).toBe(
      0n,
    );
    const dash = await sponsors.sponsorDashboard(rep);
    expect(dash?.agreements[0]?.status).toBe("SIGNED");
    const other = await makeUser(["SPONSOR"]);
    await sponsors.registerOrganisation(other, { name: "Other Org", contactEmail: "o@other.test" });
    await expect(sponsors.sponsorReport(other, ag.id)).rejects.toThrow();
  });

  it("database rejects edits to append-only records and unbalanced journals", async () => {
    await audit({ actorId: null, action: "test.event", entityType: "Test" });
    await expect(db.auditLog.updateMany({ data: { action: "tampered" } })).rejects.toThrow(/append-only/);
    await expect(db.auditLog.deleteMany({})).rejects.toThrow(/append-only/);
    const e = await db.$transaction((tx) =>
      postJournal(tx, {
        idempotencyKey: "t1",
        description: "test",
        sourceType: "TEST",
        sourceId: "1",
        lines: [
          { account: "CASH", debit: 10n },
          { account: "PLATFORM_FEE_REVENUE", credit: 10n },
        ],
      }),
    );
    await expect(
      db.journalLine.updateMany({ where: { entryId: e.id }, data: { debitMinor: 999n } }),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.$transaction(async (tx) => {
        await tx.journalEntry.create({
          data: {
            idempotencyKey: "bad",
            description: "bad",
            sourceType: "TEST",
            sourceId: "2",
            lines: {
              create: [
                { accountCode: "1000", debitMinor: 10n },
                { accountCode: "4100", creditMinor: 9n },
              ],
            },
          },
        });
      }),
    ).rejects.toThrow(/does not balance/);
  });

  it("role management: privileged roles need a super admin; no self-escalation", async () => {
    const admin = await makeUser(["ADMIN"]);
    const superAdmin = await makeUser(["SUPER_ADMIN"]);
    const target = await makeUser(["DONOR"]);
    await setRole(admin, target.userId, "MEDIA_EDITOR", true);
    await expect(setRole(admin, target.userId, "FINANCE_OFFICER", true)).rejects.toThrow(/permission/);
    await expect(setRole(admin, admin.userId, "SUPER_ADMIN", true)).rejects.toThrow();
    await setRole(superAdmin, target.userId, "FINANCE_OFFICER", true);
    await expect(setRole(superAdmin, superAdmin.userId, "SUPER_ADMIN", false)).rejects.toThrow(/own roles/);
    const roles = await db.userRole.findMany({ where: { userId: target.userId } });
    expect(roles.map((r) => r.role).sort()).toEqual(["DONOR", "FINANCE_OFFICER", "MEDIA_EDITOR"]);
  });

  it("safeguarding complaints are hidden from admins and visible to safeguarding officers", async () => {
    await submitComplaint(
      null,
      {
        contactName: "Member Public",
        contactEmail: "pub@example.test",
        complainantRole: "PUBLIC",
        category: "SAFEGUARDING",
        subject: "Concern about a visit",
        description: "A fictional concern raised to test routing and access.",
      },
      { ipHash: "x" },
    );
    await submitComplaint(
      null,
      {
        contactName: "Donor",
        contactEmail: "d@example.test",
        complainantRole: "DONOR",
        category: "SERVICE",
        subject: "Slow receipt",
        description: "A fictional service complaint for testing purposes.",
      },
      { ipHash: "y" },
    );
    const admin = await makeUser(["ADMIN"]);
    const so = await makeUser(["SAFEGUARDING_OFFICER"]);
    const adminList = await listComplaints(admin);
    expect(adminList.map((c) => c.category)).toEqual(["SERVICE"]);
    const soList = await listComplaints(so);
    expect(soList).toHaveLength(2);
    const sg = soList.find((c) => c.isSafeguarding)!;
    await expect(getComplaint(admin, sg.id)).rejects.toThrow(/not found/i);
    await getComplaint(so, sg.id);
    expect(await db.auditLog.count({ where: { action: "safeguarding.view" } })).toBe(1);
  });

  it("canAccessFile denies deleted files", async () => {
    const { applicant, app } = await submittedApplication();
    const f = await uploadFile(applicant, {
      purpose: "APPLICATION_EVIDENCE",
      applicationId: app.id,
      file: fakeFile(),
    });
    const row = await db.storedFile.update({ where: { id: f.id }, data: { deletedAt: new Date() } });
    expect(await canAccessFile(applicant, row)).toBe(false);
  });
});

describe("consent after closure", () => {
  beforeEach(resetDb);
  it("allows withdrawing (but not granting) consent on a closed request", async () => {
    const { applicant, app } = await submittedApplication();
    await db.application.update({ where: { id: app.id }, data: { status: "CLOSED" } });
    await apps.saveConsents(applicant, app.reference, { SOCIAL_MEDIA: false });
    await expect(apps.saveConsents(applicant, app.reference, { PAID_ADVERTISING: true })).rejects.toThrow(
      /closed/,
    );
  });
});
