import { BRAND } from "@/lib/brand";

/** Heart-and-sprout mark: care (heart) that grows into lasting change (sprout). */
export function LogoMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ks-heart" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e0245e" />
          <stop offset="0.6" stopColor="#ff7a59" />
          <stop offset="1" stopColor="#ffc23d" />
        </linearGradient>
      </defs>
      <path
        d="M24 42s-15-8.6-15-20.2C9 15.9 13.2 12 18 12c2.8 0 4.8 1.3 6 3.2C25.2 13.3 27.2 12 30 12c4.8 0 9 3.9 9 9.8C39 33.4 24 42 24 42Z"
        fill="url(#ks-heart)"
      />
      <path d="M24 33V22" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M24 26c-3.8 0-6.4-2.3-6.6-5.6 3.6-.3 6.3 1.8 6.6 5.6Z" fill="#fff" />
      <path d="M24 23.5c.4-3.6 3-5.8 6.6-5.5-.2 3.3-2.8 5.6-6.6 5.5Z" fill="#fff" opacity="0.9" />
    </svg>
  );
}

export function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark className="h-9 w-9 shrink-0" />
      <span
        className={`font-[family-name:var(--font-display)] text-[1.45rem] font-extrabold tracking-tight ${inverse ? "text-white" : "text-ink"}`}
      >
        {BRAND.wordmark[0]}
        <span className={inverse ? "text-sun" : "text-brand"}>{BRAND.wordmark[1]}</span>
      </span>
    </span>
  );
}
