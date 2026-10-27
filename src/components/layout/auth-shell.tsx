import type { ReactNode } from "react";
import { HeroIllustration } from "@/components/brand/illustration";
import { ShieldIcon } from "@/components/brand/icons";

const POINTS = [
  "Every case is investigated before it is published",
  "Personal details are never made public",
  "Funds are tracked from gift to delivery",
];

/** Split-screen frame for sign-in, registration and password pages. */
export function AuthShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="card mx-auto grid max-w-5xl overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="bg-sunrise-deep relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        <span aria-hidden="true" className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
        <span aria-hidden="true" className="absolute -bottom-24 -right-10 h-64 w-64 rounded-full bg-sun/20" />
        <div className="relative">
          <p className="font-[family-name:var(--font-display)] text-3xl font-bold leading-tight text-white">
            Kindness you can trust.
          </p>
          <ul className="mt-6 flex flex-col gap-3">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3 text-white/95">
                <ShieldIcon className="mt-0.5 h-5 w-5 shrink-0 text-sun" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative mx-auto mt-8 w-full max-w-xs" aria-hidden="true">
          <HeroIllustration />
        </div>
      </div>
      <div className="p-6 sm:p-10">
        <span aria-hidden="true" className="mb-4 block h-1.5 w-14 rounded-full bg-sunrise" />
        <h1 className="text-3xl sm:text-4xl">{title}</h1>
        {intro && <div className="mt-2 text-muted">{intro}</div>}
        <div className="mt-6 [&_form>button]:w-full">{children}</div>
      </div>
    </div>
  );
}
