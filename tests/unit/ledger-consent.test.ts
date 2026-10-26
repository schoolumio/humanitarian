import { describe, expect, it } from "vitest";
import { validateJournal, UnbalancedJournalError } from "@/lib/ledger/journal";
import { effectiveConsents, publicationBlockers } from "@/lib/consent";

describe("journal validation", () => {
  const base = { idempotencyKey: "k", description: "d", sourceType: "TEST", sourceId: "1" };
  it("accepts a balanced journal", () => {
    expect(() =>
      validateJournal({
        ...base,
        lines: [
          { account: "CASH", debit: 100n },
          { account: "RESTRICTED_DONATIONS", credit: 100n, campaignId: "c1" },
        ],
      }),
    ).not.toThrow();
  });
  it("rejects unbalanced, one-line, two-sided or negative lines", () => {
    expect(() =>
      validateJournal({
        ...base,
        lines: [
          { account: "CASH", debit: 100n },
          { account: "RESTRICTED_DONATIONS", credit: 90n, campaignId: "c" },
        ],
      }),
    ).toThrow(UnbalancedJournalError);
    expect(() => validateJournal({ ...base, lines: [{ account: "CASH", debit: 100n }] })).toThrow();
    expect(() =>
      validateJournal({
        ...base,
        lines: [
          { account: "CASH", debit: 100n, credit: 100n },
          { account: "REFUNDS_PAYABLE", credit: 0n },
        ],
      }),
    ).toThrow();
    expect(() =>
      validateJournal({
        ...base,
        lines: [
          { account: "CASH", debit: -1n },
          { account: "REFUNDS_PAYABLE", credit: -1n },
        ],
      }),
    ).toThrow();
  });
  it("enforces fund dimensions on restricted accounts and forbids them elsewhere", () => {
    expect(() =>
      validateJournal({
        ...base,
        lines: [
          { account: "CASH", debit: 5n },
          { account: "RESTRICTED_DONATIONS", credit: 5n },
        ],
      }),
    ).toThrow(/restricted/);
    expect(() =>
      validateJournal({
        ...base,
        lines: [
          { account: "CASH", debit: 5n, campaignId: "c" },
          { account: "RESTRICTED_DONATIONS", credit: 5n, campaignId: "c" },
        ],
      }),
    ).toThrow(/unrestricted/);
  });
});

describe("consent checks", () => {
  const t0 = new Date("2026-01-01");
  const t1 = new Date("2026-02-01");
  it("uses the most recent consent row", () => {
    const m = effectiveConsents([
      { type: "SOCIAL_MEDIA", granted: true, createdAt: t0 },
      { type: "SOCIAL_MEDIA", granted: false, createdAt: t1 },
    ]);
    expect(m.get("SOCIAL_MEDIA")).toBe(false);
  });
  it("blocks each channel without its specific consent", () => {
    const consents = new Map([["PUBLIC_CAMPAIGN_PAGE", true]] as const);
    expect(
      publicationBlockers({
        channel: "CAMPAIGN_PAGE",
        consents: new Map(consents),
        media: [],
        openSafeguardingRestriction: false,
      }),
    ).toEqual([]);
    expect(
      publicationBlockers({
        channel: "SOCIAL_MEDIA",
        consents: new Map(consents),
        media: [],
        openSafeguardingRestriction: false,
      }).length,
    ).toBe(1);
    expect(
      publicationBlockers({
        channel: "PAID_ADVERTISING",
        consents: new Map(consents),
        media: [],
        openSafeguardingRestriction: false,
      }).length,
    ).toBe(1);
    expect(
      publicationBlockers({
        channel: "INTERNAL_ONLY",
        consents: new Map(),
        media: [],
        openSafeguardingRestriction: true,
      }),
    ).toEqual([]);
  });
  it("requires filming consent, guardian consent and safeguarding clearance for media", () => {
    const consents = new Map([["PUBLIC_CAMPAIGN_PAGE", true]] as const);
    const r = publicationBlockers({
      channel: "CAMPAIGN_PAGE",
      consents: new Map(consents),
      media: [
        { depictsBeneficiary: true, depictsMinor: true, status: "APPROVED", safeguardingCleared: false },
      ],
      openSafeguardingRestriction: false,
    });
    expect(r.join(" ")).toMatch(/filming/);
    expect(r.join(" ")).toMatch(/guardian/);
    expect(r.join(" ")).toMatch(/safeguarding review/);
  });
  it("blocks publication while a safeguarding restriction is open", () => {
    const r = publicationBlockers({
      channel: "CAMPAIGN_PAGE",
      consents: new Map([["PUBLIC_CAMPAIGN_PAGE", true]] as const),
      media: [],
      openSafeguardingRestriction: true,
    });
    expect(r).toHaveLength(1);
  });
});
