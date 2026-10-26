/**
 * Money handling.
 *
 * All amounts are integers in the currency's minor unit (BigInt). For NGN the minor
 * unit is the kobo: ₦1 = 100 kobo. Paystack also expects amounts in kobo.
 * Never use floating point for money. Parsing user input goes through parseMajorToMinor.
 */
export type CurrencyCode = "NGN";

export const CURRENCIES: Record<CurrencyCode, { minorUnits: number; symbol: string; locale: string }> = {
  NGN: { minorUnits: 2, symbol: "₦", locale: "en-NG" },
};

export const DEFAULT_CURRENCY: CurrencyCode = "NGN";

export function isSupportedCurrency(c: string): c is CurrencyCode {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, c);
}

/** Parse a user-entered major-unit string ("25,000.50", "₦1,200") into minor units. */
export function parseMajorToMinor(input: string, currency: CurrencyCode = DEFAULT_CURRENCY): bigint | null {
  const cleaned = input.replace(/[₦,\s]/g, "");
  const { minorUnits } = CURRENCIES[currency];
  const re = new RegExp(`^(\\d{1,13})(?:\\.(\\d{1,${minorUnits}}))?$`);
  const m = re.exec(cleaned);
  if (!m) return null;
  const whole = BigInt(m[1]!);
  const frac = (m[2] ?? "").padEnd(minorUnits, "0");
  return whole * 10n ** BigInt(minorUnits) + BigInt(frac || "0");
}

export function formatMoney(minor: bigint | number | string, currency: string = DEFAULT_CURRENCY, opts?: { compact?: boolean }) {
  const code = (isSupportedCurrency(currency) ? currency : DEFAULT_CURRENCY) as CurrencyCode;
  const { minorUnits, locale } = CURRENCIES[code];
  const value = BigInt(minor);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const divisor = 10n ** BigInt(minorUnits);
  const whole = abs / divisor;
  const frac = abs % divisor;
  const wholeStr = new Intl.NumberFormat(locale, opts?.compact ? { notation: "compact" } : {}).format(whole);
  const fracStr = frac === 0n ? "" : "." + frac.toString().padStart(minorUnits, "0");
  return `${negative ? "-" : ""}${CURRENCIES[code].symbol}${wholeStr}${opts?.compact ? "" : fracStr}`;
}

/** Major-unit string without the symbol, for form default values. */
export function minorToMajorString(minor: bigint, currency: CurrencyCode = DEFAULT_CURRENCY) {
  const divisor = 10n ** BigInt(CURRENCIES[currency].minorUnits);
  const frac = minor % divisor;
  return frac === 0n ? (minor / divisor).toString() : `${minor / divisor}.${frac.toString().padStart(2, "0")}`;
}

export const sum = (values: Iterable<bigint>) => {
  let t = 0n;
  for (const v of values) t += v;
  return t;
};

export const max0 = (v: bigint) => (v < 0n ? 0n : v);

/** Percentage (0–100, integer, floored) of part/whole; caps at 100 for display. */
export function progressPercent(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  const pct = Number((part * 100n) / whole);
  return Math.max(0, Math.min(100, pct));
}

/** Basis-point fee, rounded half-up in minor units. */
export function bpsOf(amount: bigint, bps: number): bigint {
  return (amount * BigInt(bps) + 5000n) / 10000n;
}

/**
 * Split an amount across weights proportionally (largest-remainder method) so the parts
 * always sum exactly to the total. Used for pro-rata refunds of unspent balances.
 */
export function allocateProportionally(total: bigint, weights: bigint[]): bigint[] {
  const wsum = sum(weights);
  if (wsum === 0n) return weights.map(() => 0n);
  const raw = weights.map((w) => (total * w) / wsum);
  const rems = weights.map((w, i) => ({ i, r: (total * w) % wsum }));
  let leftover = total - sum(raw);
  rems.sort((a, b) => (b.r > a.r ? 1 : b.r < a.r ? -1 : a.i - b.i));
  for (const { i } of rems) {
    if (leftover <= 0n) break;
    raw[i] = raw[i]! + 1n;
    leftover -= 1n;
  }
  return raw;
}
