import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { EmptyState, PageHeader, Pagination, buttonClass, inputClass } from "@/components/ui";
import { CampaignCard } from "@/components/public/campaign-card";
import { listPublicCampaigns } from "@/server/services/campaigns";

export const metadata: Metadata = { title: "Verified cases" };
export const dynamic = "force-dynamic";

export default async function CasesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [result, categories] = await Promise.all([
    listPublicCampaigns({ category: sp.category || undefined, q: sp.q || undefined, status: sp.status || "open", page: sp.page ?? 1 }),
    db.caseCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (result.filters.category) u.set("category", result.filters.category);
    if (result.filters.q) u.set("q", result.filters.q);
    u.set("status", result.filters.status);
    u.set("page", String(p));
    return `/cases?${u}`;
  };
  return (
    <div>
      <PageHeader title="Verified cases" description="Every case listed here has been investigated and approved by the KindSpring team. Personal details are never published." />
      <form className="mb-6 grid gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4 sm:grid-cols-4" role="search">
        <div>
          <label htmlFor="q" className="text-sm font-semibold">Search</label>
          <input id="q" name="q" defaultValue={result.filters.q} placeholder="Title or location" className={inputClass} />
        </div>
        <div>
          <label htmlFor="category" className="text-sm font-semibold">Category</label>
          <select id="category" name="category" defaultValue={result.filters.category ?? ""} className={inputClass}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="status" className="text-sm font-semibold">Show</label>
          <select id="status" name="status" defaultValue={result.filters.status} className={inputClass}>
            <option value="open">Open for contributions</option>
            <option value="funded">Funded – support underway</option>
            <option value="completed">Completed</option>
            <option value="all">All published cases</option>
          </select>
        </div>
        <div className="flex items-end"><button className={buttonClass("primary", "w-full")}>Apply filters</button></div>
      </form>
      {result.rows.length ? (
        <>
          <p className="mb-3 text-sm text-muted">{result.total} case{result.total === 1 ? "" : "s"}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{result.rows.map((c) => <CampaignCard key={c.publicId} c={c} />)}</div>
          <Pagination page={result.page} pageSize={result.pageSize} total={result.total} hrefFor={qs} />
        </>
      ) : (
        <EmptyState title="No cases match these filters" action={<Link href="/cases">Clear filters</Link>}>
          Cases appear only after verification and approval.
        </EmptyState>
      )}
    </div>
  );
}
