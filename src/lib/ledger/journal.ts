import type { Prisma } from "@prisma/client";
import type { Tx } from "../db";
import {
  ACCOUNT_BY_CODE,
  ACCOUNTS,
  FUND_EXPENSE_CODES,
  FUND_REVENUE_CODES,
  type AccountKey,
} from "./accounts";

export type JournalLineInput = {
  account: AccountKey;
  debit?: bigint;
  credit?: bigint;
  campaignId?: string | null;
  memo?: string;
};

export type JournalInput = {
  idempotencyKey: string;
  description: string;
  sourceType: string;
  sourceId: string;
  createdById?: string | null;
  currency?: string;
  lines: JournalLineInput[];
  reversesId?: string;
};

export class UnbalancedJournalError extends Error {}

/** Pure validation, also unit tested. The database re-checks balance at commit. */
export function validateJournal(input: JournalInput) {
  if (input.lines.length < 2) throw new UnbalancedJournalError("A journal needs at least two lines.");
  let debits = 0n;
  let credits = 0n;
  for (const l of input.lines) {
    const d = l.debit ?? 0n;
    const c = l.credit ?? 0n;
    if (d < 0n || c < 0n) throw new UnbalancedJournalError("Journal amounts cannot be negative.");
    if (d > 0n === c > 0n) throw new UnbalancedJournalError("Each line must be either a debit or a credit.");
    const acct = ACCOUNTS[l.account];
    if (acct.restricted && !l.campaignId) {
      throw new UnbalancedJournalError(`Account ${acct.code} is restricted and requires a campaign (fund).`);
    }
    if (!acct.restricted && l.campaignId) {
      throw new UnbalancedJournalError(`Account ${acct.code} is unrestricted and must not carry a fund.`);
    }
    debits += d;
    credits += c;
  }
  if (debits !== credits)
    throw new UnbalancedJournalError(`Journal does not balance: ${debits} != ${credits}`);
}

/**
 * Post a balanced journal. Idempotent on `idempotencyKey`: posting the same key twice
 * returns the existing entry, which makes webhook/job retries safe.
 * Must be called inside the same DB transaction as the business state change.
 */
export async function postJournal(tx: Tx, input: JournalInput) {
  validateJournal(input);
  const existing = await tx.journalEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;
  const currency = input.currency ?? "NGN";
  return tx.journalEntry.create({
    data: {
      idempotencyKey: input.idempotencyKey,
      description: input.description,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      createdById: input.createdById ?? null,
      reversesId: input.reversesId,
      lines: {
        create: input.lines.map((l) => ({
          accountCode: ACCOUNTS[l.account].code,
          campaignId: l.campaignId ?? null,
          debitMinor: l.debit ?? 0n,
          creditMinor: l.credit ?? 0n,
          currency,
          memo: l.memo,
        })),
      },
    },
  });
}

/** Post the exact mirror of an existing entry (used to correct errors without editing history). */
export async function reverseJournal(tx: Tx, entryId: string, reason: string, actorId: string | null) {
  const entry = await tx.journalEntry.findUniqueOrThrow({ where: { id: entryId }, include: { lines: true } });
  const byCode = Object.entries(ACCOUNTS);
  return postJournal(tx, {
    idempotencyKey: `reversal:${entry.id}`,
    description: `Reversal of #${entry.number}: ${reason}`,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    createdById: actorId,
    reversesId: entry.id,
    lines: entry.lines.map((l) => ({
      account: byCode.find(([, a]) => a.code === l.accountCode)![0] as AccountKey,
      debit: l.creditMinor,
      credit: l.debitMinor,
      campaignId: l.campaignId,
      memo: "reversal",
    })),
  });
}

/** Restricted fund balance (cash available to a campaign's intervention). */
export async function fundBalance(tx: Tx, campaignId: string): Promise<bigint> {
  const rows = await tx.journalLine.groupBy({
    by: ["accountCode"],
    where: { campaignId },
    _sum: { debitMinor: true, creditMinor: true },
  });
  let balance = 0n;
  for (const r of rows) {
    const d = r._sum.debitMinor ?? 0n;
    const c = r._sum.creditMinor ?? 0n;
    if (FUND_REVENUE_CODES.includes(r.accountCode)) balance += c - d;
    else if (FUND_EXPENSE_CODES.includes(r.accountCode)) balance -= d - c;
  }
  return balance;
}

/** Natural-sign balances per account (debit-normal for assets/expenses). */
export async function trialBalance(tx: Tx, where: Prisma.JournalLineWhereInput = {}) {
  const rows = await tx.journalLine.groupBy({
    by: ["accountCode"],
    where,
    _sum: { debitMinor: true, creditMinor: true },
  });
  return rows.map((r) => {
    const acct = ACCOUNT_BY_CODE[r.accountCode]!;
    const d = r._sum.debitMinor ?? 0n;
    const c = r._sum.creditMinor ?? 0n;
    const debitNormal = acct.type === "ASSET" || acct.type === "EXPENSE";
    return {
      code: acct.code,
      name: acct.name,
      type: acct.type,
      debits: d,
      credits: c,
      balance: debitNormal ? d - c : c - d,
    };
  });
}
