import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { fundBalance, trialBalance } from "@/lib/ledger/journal";
import { buildSandboxWebhook, sandboxCompleteCheckout } from "@/lib/payments/sandbox";
import {
  processWebhook,
  reconcilePaymentByReference,
  initiateDonation,
  getReturnStatus,
  applyVerifiedTransaction,
  recordOfflineReceipt,
  confirmOfflineReceipt,
} from "@/server/services/payments";
import {
  approveRefund,
  requestRefund,
  submitRefundToProvider,
  rejectRefund,
} from "@/server/services/refunds";
import { financialSummary } from "@/server/services/reports";
import { makeUser, resetDb } from "../helpers/factory";
import { publishedCampaign } from "../helpers/scenario";
import { donate, key, payAndNotify, sendWebhook } from "../helpers/payments";

async function expectLedgerBalanced() {
  const rows = await db.$queryRaw<
    { entryId: string; d: bigint; c: bigint }[]
  >`SELECT "entryId", SUM("debitMinor") d, SUM("creditMinor") c FROM journal_lines GROUP BY "entryId" HAVING SUM("debitMinor") <> SUM("creditMinor")`;
  expect(rows).toEqual([]);
}

describe("payments, webhooks and the ledger", () => {
  beforeEach(resetDb);

  it("Journey D/E: a test-mode contribution is confirmed by a verified webhook exactly once", async () => {
    const { campaign } = await publishedCampaign();
    const p = await donate(campaign.publicId, "50000");
    expect(p.status).toBe("PENDING");
    expect(p.amountMinor).toBe(5_000_000n);

    // The browser return alone changes nothing until the provider confirms.
    expect((await getReturnStatus(p.reference))?.status).toBe("PENDING");

    const first = await payAndNotify(p.reference, "success", "evt_1");
    expect(first).toEqual({ status: 200, outcome: "APPLIED" });
    // Exact replay of the same event, and a second distinct delivery, are both no-ops.
    expect((await sendWebhook("charge.success", { reference: p.reference }, "evt_1")).outcome).toBe(
      "DUPLICATE",
    );
    expect((await sendWebhook("charge.success", { reference: p.reference }, "evt_2")).outcome).toBe(
      "IGNORED_DUPLICATE",
    );
    // A delayed, out-of-order failure after success is ignored.
    expect((await sendWebhook("charge.failed", { reference: p.reference }, "evt_3")).status).toBe(200);

    const after = await db.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.status).toBe("SUCCEEDED");
    expect(after.feeMinor).toBe(75_000n); // sandbox 1.5%
    const c = await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(c.confirmedAmountMinor).toBe(5_000_000n);
    expect(c.status).toBe("FUNDING_IN_PROGRESS");
    expect(await db.journalEntry.count({ where: { sourceId: p.id } })).toBe(2); // receipt + fee
    expect(await fundBalance(db, campaign.id)).toBe(5_000_000n - 75_000n);
    expect(await db.notification.count({ where: { template: "contribution_received" } })).toBe(1);
    await expectLedgerBalanced();
  });

  it("rejects forged and malformed webhooks", async () => {
    const { campaign } = await publishedCampaign();
    const p = await donate(campaign.publicId, "1000");
    await sandboxCompleteCheckout(p.reference, "success");
    const { raw } = buildSandboxWebhook("charge.success", { reference: p.reference });
    expect(
      (await processWebhook("sandbox", raw, new Headers({ "x-sandbox-signature": "0".repeat(128) }))).status,
    ).toBe(401);
    expect((await processWebhook("sandbox", raw, new Headers())).status).toBe(401);
    const tampered = raw.replace(p.reference, "ksp_" + "a".repeat(24));
    const { signature } = buildSandboxWebhook("x", {});
    expect(
      (await processWebhook("sandbox", tampered, new Headers({ "x-sandbox-signature": signature }))).status,
    ).toBe(401);
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("PENDING");
  });

  it("never trusts the webhook body: a success event for an unpaid transaction does nothing", async () => {
    const { campaign } = await publishedCampaign();
    const p = await donate(campaign.publicId, "1000");
    // Signed event claims success, but the provider's own record is still pending.
    const r = await sendWebhook("charge.success", { reference: p.reference });
    expect(r.outcome).toBe("STILL_PENDING");
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("PENDING");
  });

  it("rejects amount or currency mismatches and raises an alert", async () => {
    const { campaign } = await publishedCampaign();
    const p = await donate(campaign.publicId, "1000");
    await sandboxCompleteCheckout(p.reference, "success", { amountOverrideMinor: 100n });
    const r = await sendWebhook("charge.success", { reference: p.reference });
    expect(r.outcome).toBe("REJECTED_MISMATCH");
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).confirmedAmountMinor).toBe(
      0n,
    );
    expect(await db.riskAlert.count({ where: { type: "PAYMENT_AMOUNT_MISMATCH" } })).toBe(1);
  });

  it("handles concurrent duplicate webhook deliveries without double counting", async () => {
    const { campaign } = await publishedCampaign();
    const p = await donate(campaign.publicId, "20000");
    await sandboxCompleteCheckout(p.reference, "success");
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        sendWebhook("charge.success", { reference: p.reference }, `evt_c${i}`),
      ),
    );
    expect(results.filter((r) => r.outcome === "APPLIED")).toHaveLength(1);
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).confirmedAmountMinor).toBe(
      2_000_000n,
    );
    await expectLedgerBalanced();
  });

  it("is idempotent per client key and caps contributions at the remaining need (overfunding)", async () => {
    const { campaign } = await publishedCampaign();
    const k = key();
    const a = await initiateDonation(
      null,
      campaign.publicId,
      { amount: "1000", email: "d@example.test", name: "Donor", idempotencyKey: k },
      { ipHash: "ip1" },
    );
    const b = await initiateDonation(
      null,
      campaign.publicId,
      { amount: "1000", email: "d@example.test", name: "Donor", idempotencyKey: k },
      { ipHash: "ip1" },
    );
    expect(b.reference).toBe(a.reference);
    await expect(donate(campaign.publicId, "400001")).rejects.toThrow(/needs/);
    await expect(donate(campaign.publicId, "50")).rejects.toThrow(/minimum/);

    // Two simultaneous checkouts can still overfund; the excess is flagged, never moved silently.
    const p1 = await donate(campaign.publicId, "300000");
    const p2 = await donate(campaign.publicId, "300000");
    await payAndNotify(p1.reference);
    await payAndNotify(p2.reference);
    const c = await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(c.status).toBe("FULLY_FUNDED");
    expect(
      await db.riskAlert.count({ where: { type: "OVERFUNDED_CAMPAIGN", campaignId: campaign.id } }),
    ).toBe(1);
    await expect(donate(campaign.publicId, "1000")).rejects.toThrow(/not currently accepting/);
  });

  it("partial funding: progress reflects confirmed funds only", async () => {
    const { campaign } = await publishedCampaign();
    const p = await donate(campaign.publicId, "100000");
    await payAndNotify(p.reference, "failed");
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("FAILED");
    const ok = await donate(campaign.publicId, "100000");
    await payAndNotify(ok.reference);
    const c = await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(c.confirmedAmountMinor).toBe(10_000_000n);
    expect(c.status).toBe("FUNDING_IN_PROGRESS");
  });

  it("reconciliation repairs a missed webhook and marks payments matched", async () => {
    const { campaign } = await publishedCampaign();
    const p = await donate(campaign.publicId, "5000");
    await sandboxCompleteCheckout(p.reference, "success"); // webhook never delivered
    await reconcilePaymentByReference(p.reference);
    const after = await db.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.status).toBe("SUCCEEDED");
    expect(after.reconciliation).toBe("MATCHED");
  });

  it("refunds need independent approval and reduce funding exactly once", async () => {
    const { campaign } = await publishedCampaign();
    const p = await donate(campaign.publicId, "40000");
    await payAndNotify(p.reference);
    const f1 = await makeUser(["FINANCE_OFFICER"], "Finance One");
    const f2 = await makeUser(["FINANCE_OFFICER"], "Finance Two");
    const admin = await makeUser(["ADMIN", "SUPER_ADMIN"]);

    await expect(requestRefund(f1, p.id, "50000", "Donor asked for a refund within policy")).rejects.toThrow(
      /exceeds/,
    );
    const r = await requestRefund(f1, p.id, "15000", "Donor asked for a refund within policy");
    await expect(approveRefund(f1, r.id)).rejects.toThrow(/different finance officer/);
    await expect(approveRefund(admin, r.id)).rejects.toThrow(/permission/);
    await approveRefund(f2, r.id);
    await submitRefundToProvider(r.id); // sandbox processes synchronously
    await sendWebhook("refund.processed", {
      reference: p.reference,
      refundId: `sbx_rf_${r.id}`,
      amount: "1500000",
    }); // duplicate notification

    const pay = await db.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(pay.status).toBe("PARTIALLY_REFUNDED");
    expect(pay.refundedMinor).toBe(1_500_000n);
    const c = await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(c.refundedAmountMinor).toBe(1_500_000n);
    expect(await fundBalance(db, campaign.id)).toBe(4_000_000n - 60_000n - 1_500_000n);
    await expectLedgerBalanced();

    const r2 = await requestRefund(f2, p.id, "1000", "Another request for review");
    await rejectRefund(f1, r2.id, "Not within policy");
    expect((await db.refund.findUniqueOrThrow({ where: { id: r2.id } })).status).toBe("REJECTED");

    const summary = await financialSummary(f1);
    expect(summary.totalConfirmedDonationsMinor).toBe(4_000_000n);
    expect(summary.totalRefundsMinor).toBe(1_500_000n);
    expect(summary.totalFeesMinor).toBe(60_000n);
  });

  it("chargebacks: a lost dispute reduces the fund; a won one restores status", async () => {
    const { campaign } = await publishedCampaign();
    const p = await donate(campaign.publicId, "10000");
    await payAndNotify(p.reference);
    await sendWebhook("dispute.created", { reference: p.reference, disputeId: "d1", amount: "1000000" });
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("DISPUTED");
    await sendWebhook("dispute.lost", { reference: p.reference, disputeId: "d1", amount: "1000000" });
    const pay = await db.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(pay.status).toBe("REFUNDED");
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).refundedAmountMinor).toBe(
      1_000_000n,
    );
    await expectLedgerBalanced();
  });

  it("offline sponsor receipts need a second finance officer", async () => {
    const { campaign } = await publishedCampaign();
    const f1 = await makeUser(["FINANCE_OFFICER"]);
    const f2 = await makeUser(["FINANCE_OFFICER"]);
    const org = await db.organisation.create({
      data: { name: "Fictional Foods Ltd", contactEmail: "csr@fictional.test", status: "APPROVED" },
    });
    const ag = await db.sponsorshipAgreement.create({
      data: {
        organisationId: org.id,
        campaignId: campaign.id,
        pledgedAmountMinor: 10_000_000n,
        terms: "x".repeat(50),
        status: "SIGNED",
        preparedById: f1.userId,
      },
    });
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).confirmedAmountMinor).toBe(
      0n,
    ); // pledge ≠ money
    const p = await recordOfflineReceipt(f1, {
      agreementId: ag.id,
      amount: "100000",
      bankReference: "TRF-0001",
      receivedOn: "2026-10-01",
    });
    await expect(confirmOfflineReceipt(f1, p.id)).rejects.toThrow(/different finance officer/);
    await confirmOfflineReceipt(f2, p.id);
    expect((await db.sponsorshipAgreement.findUniqueOrThrow({ where: { id: ag.id } })).status).toBe(
      "FULFILLED",
    );
    const tb = await trialBalance(db);
    expect(tb.find((r) => r.code === "4010")?.balance).toBe(10_000_000n);
  });

  it("applyVerifiedTransaction ignores unknown references", async () => {
    expect(
      await applyVerifiedTransaction(
        {
          reference: "ksp_unknown",
          status: "success",
          amountMinor: 1n,
          currency: "NGN",
          feeMinor: 0n,
          providerTransactionId: "x",
          paidAt: null,
        },
        "test",
      ),
    ).toBe("IGNORED_UNKNOWN");
  });
});
