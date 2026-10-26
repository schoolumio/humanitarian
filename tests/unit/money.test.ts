import { describe, expect, it } from "vitest";
import { allocateProportionally, bpsOf, formatMoney, minorToMajorString, parseMajorToMinor, progressPercent, sum } from "@/lib/money";

describe("money (NGN, integer kobo)", () => {
  it("parses naira strings into kobo without floating point", () => {
    expect(parseMajorToMinor("25000")).toBe(2_500_000n);
    expect(parseMajorToMinor("₦1,200.50")).toBe(120_050n);
    expect(parseMajorToMinor("0.1")).toBe(10n);
    expect(parseMajorToMinor("19.99")).toBe(1999n);
  });
  it("rejects invalid and over-precise input", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1e5", "12,34.5.6"]) expect(parseMajorToMinor(bad)).toBeNull();
  });
  it("formats with the naira symbol", () => {
    expect(formatMoney(2_500_000n)).toBe("₦25,000");
    expect(formatMoney(120_050n)).toBe("₦1,200.50");
    expect(formatMoney(-500n)).toBe("-₦5");
  });
  it("round-trips major strings", () => {
    expect(minorToMajorString(120_050n)).toBe("1200.50");
    expect(minorToMajorString(2_500_000n)).toBe("25000");
  });
  it("computes capped progress", () => {
    expect(progressPercent(50n, 200n)).toBe(25);
    expect(progressPercent(300n, 200n)).toBe(100);
    expect(progressPercent(10n, 0n)).toBe(0);
  });
  it("rounds basis-point fees half up", () => {
    expect(bpsOf(10_000n, 150)).toBe(150n);
    expect(bpsOf(333n, 150)).toBe(5n);
  });
  it("allocates proportionally with an exact total", () => {
    const parts = allocateProportionally(1000n, [1n, 1n, 1n]);
    expect(sum(parts)).toBe(1000n);
    expect(parts).toEqual([334n, 333n, 333n]);
    expect(allocateProportionally(10n, [0n, 0n])).toEqual([0n, 0n]);
  });
});
