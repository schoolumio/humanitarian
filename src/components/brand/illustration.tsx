/**
 * Hero illustration: a community of abstract figures holding a shared heart, with growing
 * leaves – no stock photography, no identifiable people.
 */
export function HeroIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 420"
      className={className}
      role="img"
      aria-label="Illustration of a community lifting up a heart together"
    >
      <defs>
        <linearGradient id="hi-heart" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e0245e" />
          <stop offset="0.55" stopColor="#ff7a59" />
          <stop offset="1" stopColor="#ffc23d" />
        </linearGradient>
        <linearGradient id="hi-ground" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffe0ea" />
          <stop offset="1" stopColor="#fff1d6" />
        </linearGradient>
      </defs>
      <circle cx="240" cy="190" r="170" fill="#fff" opacity="0.18" />
      <circle cx="240" cy="190" r="120" fill="#fff" opacity="0.18" />
      <ellipse cx="240" cy="372" rx="200" ry="30" fill="url(#hi-ground)" opacity="0.9" />
      {/* Leaves */}
      <path d="M88 330c-30-40-14-92 30-110 10 44-2 86-30 110Z" fill="#15803d" opacity="0.85" />
      <path d="M392 330c30-40 14-92-30-110-10 44 2 86 30 110Z" fill="#0d9488" opacity="0.85" />
      {/* Heart */}
      <g>
        <path
          d="M240 225s-62-35-62-83c0-24 17-40 37-40 11 0 20 5 25 13 5-8 14-13 25-13 20 0 37 16 37 40 0 48-62 83-62 83Z"
          fill="url(#hi-heart)"
        />
        <path
          d="M218 128c-9 2-15 10-15 20"
          stroke="#fff"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
          opacity="0.7"
        />
      </g>
      {/* People */}
      <g>
        <circle cx="150" cy="232" r="22" fill="#6d28d9" />
        <path d="M112 360c0-55 17-100 38-100s38 45 38 100Z" fill="#6d28d9" />
        <path
          d="M168 280c18-10 32-28 42-52"
          stroke="#6d28d9"
          strokeWidth="16"
          strokeLinecap="round"
          fill="none"
        />
      </g>
      <g>
        <circle cx="330" cy="232" r="22" fill="#0f766e" />
        <path d="M292 360c0-55 17-100 38-100s38 45 38 100Z" fill="#0f766e" />
        <path
          d="M312 280c-18-10-32-28-42-52"
          stroke="#0f766e"
          strokeWidth="16"
          strokeLinecap="round"
          fill="none"
        />
      </g>
      <g>
        <circle cx="240" cy="262" r="20" fill="#c8174f" />
        <path d="M206 372c0-48 15-88 34-88s34 40 34 88Z" fill="#c8174f" />
      </g>
      <g>
        <circle cx="72" cy="280" r="15" fill="#ffc23d" />
        <path d="M46 368c0-40 12-70 26-70s26 30 26 70Z" fill="#f5a70a" />
      </g>
      <g>
        <circle cx="408" cy="280" r="15" fill="#38bdf8" />
        <path d="M382 368c0-40 12-70 26-70s26 30 26 70Z" fill="#0b8fcf" />
      </g>
      {/* Sparkles */}
      <g fill="#fff">
        <path d="M120 96l5 12 12 5-12 5-5 12-5-12-12-5 12-5Z" />
        <path d="M372 80l4 9 9 4-9 4-4 9-4-9-9-4 9-4Z" />
        <path d="M410 168l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
        <circle cx="90" cy="170" r="4" />
        <circle cx="300" cy="64" r="3" />
      </g>
    </svg>
  );
}

/** Soft decorative blobs for section backgrounds. */
export function Blobs({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 600 400"
      className={className}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="none"
    >
      <circle cx="80" cy="60" r="90" fill="#ffc23d" opacity="0.18" />
      <circle cx="560" cy="340" r="120" fill="#e0245e" opacity="0.12" />
      <circle cx="520" cy="40" r="50" fill="#38bdf8" opacity="0.16" />
    </svg>
  );
}
