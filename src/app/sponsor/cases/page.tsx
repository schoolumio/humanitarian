import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { Badge, EmptyState, PageHeader, buttonClass, formatDate, inputClass } from "@/components/ui";
import { FundingSummary } from "@/components/public/campaign-card";
import { requirePageActor } from "@/server/current-user";
import { listSponsorCases } from "@/server/services/sponsors";

export const metadata = { title: "Eligible cases" };

export default async function SponsorCases({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePageActor("/sponsor/cases");
  const sp = await searchParams;
  let rows;
  try { rows = await listSponsorCases(actor, sp); } catch (e) { if (e instanceof AppError) redirect("/sponsor"); throw e; }
  const categories = await db.caseCategory.findMany({ where: { active: true } });
  return (
    <div>
      <PageHeader title="Eligible verified cases" description="Anonymised details only. Includes cases shared privately with approved sponsors." />
      <form className="mb-4 grid gap-2 rounded border border-line bg-white p-3 sm:grid-cols-5" role="search">
        <input name="q" defaultValue={sp.q} className={inputClass} aria-label="Search" placeholder="Search outcome or title" />
        <select name="category" defaultValue={sp.category ?? ""} className={inputClass} aria-label="Category"><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select>
        <input name="state" defaultValue={sp.state} className={inputClass} aria-label="Location" placeholder="State" />
        <input name="maxBudget" defaultValue={sp.maxBudget} className={inputClass} aria-label="Maximum budget in naira" placeholder="Max budget ₦" />
        <button className={buttonClass("secondary")}>Filter</button>
      </form>
      {rows.length ? <ul className="grid gap-4 md:grid-cols-2">{rows.map((c) => (
        <li key={c.id} className="rounded-[var(--radius-card)] border border-line bg-white p-5">
          <div className="mb-2 flex gap-2"><Badge tone="info">{c.category.name}</Badge>{c.visibility === "SPONSORS_ONLY" && <Badge tone="warning">Private – not publicly listed</Badge>}</div>
          <h2 className="text-lg"><Link href={`/sponsor/cases/${c.id}`}>{c.title}</Link></h2>
          <p className="text-sm text-muted">{c.locationLabel} · verified {formatDate(c.verifiedAt)}</p>
          <p className="mt-2 line-clamp-3">{c.interventionSummary}</p>
          <div className="mt-3"><FundingSummary c={c} /></div>
        </li>
      ))}</ul> : <EmptyState title="No cases match these filters" />}
    </div>
  );
}
