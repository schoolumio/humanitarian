"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import Link from "@/components/ui/link";
import { cx } from "@/components/ui";

export type SideNavItem = { href: string; label: string; icon: ReactNode };

/**
 * Sidebar navigation for signed-in areas. The current section is highlighted and announced
 * with aria-current; the longest matching prefix wins so "/staff" is not active on sub-pages.
 */
export function SideNav({ items, label }: { items: SideNavItem[]; label: string }) {
  const path = usePathname() ?? "";
  const active = items
    .filter((i) => path === i.href || path.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <ul
      className="flex gap-1 overflow-x-auto p-2 lg:flex-col lg:gap-0.5 lg:overflow-visible"
      aria-label={label}
    >
      {items.map((i) => {
        const on = i.href === active;
        return (
          <li key={i.href} className="shrink-0">
            <Link
              href={i.href}
              aria-current={on ? "page" : undefined}
              className={cx(
                "flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 font-semibold no-underline transition-colors lg:gap-3 lg:py-2.5",
                on ? "bg-brand text-white shadow-sm" : "text-ink hover:bg-brand-50 hover:text-brand",
              )}
            >
              <span aria-hidden="true" className={cx("shrink-0", on ? "text-white" : "text-brand")}>
                {i.icon}
              </span>
              {i.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
