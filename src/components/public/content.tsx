import type { ReactNode } from "react";
import { Alert } from "@/components/ui";
import { BRAND } from "@/lib/brand";

/** Information and policy pages: a warm header band followed by readable prose. */
export function ContentPage({
  title,
  intro,
  children,
  draftPolicy,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
  draftPolicy?: boolean;
}) {
  return (
    <article>
      <header className="bg-blush relative -mt-8 mb-10 overflow-hidden px-4 py-12 sm:-mt-10 sm:py-16 mx-[calc(50%-50vw)]">
        <span aria-hidden="true" className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-sun/25" />
        <span aria-hidden="true" className="absolute -bottom-20 left-10 h-48 w-48 rounded-full bg-brand/10" />
        <div className="relative mx-auto max-w-6xl">
          <span aria-hidden="true" className="mb-4 block h-1.5 w-16 rounded-full bg-sunrise" />
          <h1 className="max-w-3xl text-4xl sm:text-5xl">{title}</h1>
          {intro && <p className="mt-4 max-w-2xl text-lg text-muted sm:text-xl">{intro}</p>}
        </div>
      </header>
      <div className="max-w-3xl">
        {draftPolicy && (
          <div className="mb-6">
            <Alert tone="warning" title="Draft policy pending professional review">
              This policy describes how the platform is designed to operate. It must be reviewed by qualified
              legal, data-protection and fundraising advisers before {BRAND.name} accepts real applicants or
              funds. It does not by itself establish legal compliance.
            </Alert>
          </div>
        )}
        <div className="prose-ks card p-6 sm:p-10">{children}</div>
      </div>
    </article>
  );
}
