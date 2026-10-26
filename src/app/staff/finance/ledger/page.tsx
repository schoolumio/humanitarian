import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { trialBalance } from "@/lib/ledger/journal";
import { DataTable, PageHeader, Section, formatDate } from "@/components/ui";
import { requirePagePermission } from "@/server/current-user";

export const metadata = { title: "Ledger" };

export default async function LedgerPage() {
  await requirePagePermission("finance.reports");
  const [tb, entries] = await Promise.all([
    trialBalance(db),
    db.journalEntry.findMany({ orderBy: { number: "desc" }, take: 50, include: { lines: true } }),
  ]);
  const totalD = tb.reduce((s, r) => s + r.debits, 0n);
  const totalC = tb.reduce((s, r) => s + r.credits, 0n);
  return (
    <div>
      <PageHeader
        title="Ledger"
        description="Append-only double-entry ledger. Entries cannot be edited; corrections are posted as reversing entries."
      />
      <Section
        title={`Trial balance (debits ${formatMoney(totalD)} = credits ${formatMoney(totalC)}${totalD === totalC ? " ✓ balanced" : " ✗ UNBALANCED"})`}
      >
        <DataTable
          caption="Trial balance"
          rows={tb}
          rowKey={(r) => r.code}
          columns={[
            { header: "Account", cell: (r) => `${r.code} ${r.name}` },
            { header: "Type", cell: (r) => r.type.toLowerCase() },
            { header: "Debits", cell: (r) => formatMoney(r.debits) },
            { header: "Credits", cell: (r) => formatMoney(r.credits) },
            { header: "Balance", cell: (r) => <strong>{formatMoney(r.balance)}</strong> },
          ]}
        />
      </Section>
      <Section title="Recent journal entries">
        <DataTable
          caption="Journal entries"
          rows={entries}
          rowKey={(e) => e.id}
          columns={[
            { header: "#", cell: (e) => e.number },
            { header: "Date", cell: (e) => formatDate(e.occurredAt, true) },
            {
              header: "Description",
              cell: (e) => (
                <>
                  {e.description}
                  {e.reversesId && <span className="block text-xs text-muted">reversal</span>}
                </>
              ),
            },
            {
              header: "Lines",
              cell: (e) => (
                <ul className="text-sm">
                  {e.lines.map((l) => (
                    <li key={l.id}>
                      {l.accountCode}{" "}
                      {l.debitMinor > 0n
                        ? `Dr ${formatMoney(l.debitMinor)}`
                        : `Cr ${formatMoney(l.creditMinor)}`}
                      {l.campaignId ? " (fund)" : ""}
                    </li>
                  ))}
                </ul>
              ),
            },
          ]}
        />
      </Section>
    </div>
  );
}
