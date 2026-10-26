import Link from "@/components/ui/link";
import { db } from "@/lib/db";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Support categories" };
export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const cats = await db.caseCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  return (
    <div>
      <PageHeader
        title="Support categories"
        description="The kinds of needs KindSpring can help with. Other genuine humanitarian needs may be considered."
      />
      {cats.length ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {cats.map((c) => (
            <li key={c.id} className="rounded-[var(--radius-card)] border border-line bg-white p-5">
              <h2 className="text-lg">{c.name}</h2>
              <p className="mt-1">{c.description}</p>
              <p className="mt-2">
                <Link href={`/cases?category=${c.slug}&status=all`}>See cases →</Link>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Categories are being set up" />
      )}
    </div>
  );
}
