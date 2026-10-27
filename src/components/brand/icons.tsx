/** Simple, friendly line icons (24×24). Decorative unless a label is given. */
type P = { className?: string; label?: string };
const base = (label?: string) =>
  label
    ? { role: "img", "aria-label": label }
    : { "aria-hidden": true as const, focusable: "false" as const };
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const HomeIcon = ({ className = "h-7 w-7", label }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(label)}>
    <path {...stroke} d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10M10 19.5v-5h4v5" />
  </svg>
);
export const FoodIcon = ({ className = "h-7 w-7", label }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(label)}>
    <path
      {...stroke}
      d="M4 13h16a8 8 0 0 1-16 0ZM8 9c0-1.5 1-2 1-3.5M12 9c0-1.5 1-2 1-3.5M16 9c0-1.5 1-2 1-3.5"
    />
  </svg>
);
export const ShopIcon = ({ className = "h-7 w-7", label }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(label)}>
    <path
      {...stroke}
      d="M4 9 5.5 4h13L20 9M4 9h16v1.5a2.7 2.7 0 0 1-5.3 0 2.7 2.7 0 0 1-5.4 0A2.7 2.7 0 0 1 4 10.5ZM5.5 13v7h13v-7M10 20v-4h4v4"
    />
  </svg>
);
export const BookIcon = ({ className = "h-7 w-7", label }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(label)}>
    <path
      {...stroke}
      d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5Zm0 0v13"
    />
  </svg>
);
export const ToolIcon = ({ className = "h-7 w-7", label }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(label)}>
    <path
      {...stroke}
      d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 0-2-2ZM5 5l4 4M3.5 7.5l3-3"
    />
  </svg>
);
export const CommunityIcon = ({ className = "h-7 w-7", label }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(label)}>
    <path
      {...stroke}
      d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.5 20c.5-3.5 2.8-5.5 5.5-5.5s5 2 5.5 5.5M12.5 15.2c.9-.5 2.1-.7 3.5-.7 2.7 0 5 2 5.5 5.5"
    />
  </svg>
);
export const HeartIcon = ({ className = "h-7 w-7", label }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(label)}>
    <path
      {...stroke}
      d="M12 20s-8-4.6-8-10.7C4 6.4 6.2 4.5 8.6 4.5c1.6 0 2.7.8 3.4 1.9.7-1.1 1.8-1.9 3.4-1.9 2.4 0 4.6 1.9 4.6 4.8C20 15.4 12 20 12 20Z"
    />
  </svg>
);
export const ShieldIcon = ({ className = "h-7 w-7", label }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(label)}>
    <path {...stroke} d="M12 3 5 6v5.5c0 4.3 3 7.7 7 9.5 4-1.8 7-5.2 7-9.5V6l-7-3Zm-3 9 2 2 4-4" />
  </svg>
);
export const SearchIcon = ({ className = "h-7 w-7", label }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(label)}>
    <path {...stroke} d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.5 15.5 20 20" />
  </svg>
);
export const GiftIcon = ({ className = "h-7 w-7", label }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(label)}>
    <path
      {...stroke}
      d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7C10.5 4 7 4 7 5.8 7 7 9.5 7 12 7Zm0 0c1.5-3 5-3 5-1.2C17 7 14.5 7 12 7Z"
    />
  </svg>
);
export const BuildingIcon = ({ className = "h-7 w-7", label }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(label)}>
    <path {...stroke} d="M4 20V5l8-2v17M12 8l8 2v10M3 20h18M7 8h2M7 12h2M7 16h2M15 13h2M15 16h2" />
  </svg>
);
export const ReceiptIcon = ({ className = "h-7 w-7", label }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(label)}>
    <path {...stroke} d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6M9 12h6M9 16h4" />
  </svg>
);
export const SparkIcon = ({ className = "h-7 w-7", label }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(label)}>
    <path
      {...stroke}
      d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"
    />
  </svg>
);
export const ArrowRight = ({ className = "h-5 w-5", label }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(label)}>
    <path {...stroke} d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/** Icon and colour scheme for each support category (by slug), with a sensible fallback. */
const line = (d: string) =>
  function LineIcon({ className = "h-5 w-5", label }: P) {
    return (
      <svg viewBox="0 0 24 24" className={className} {...base(label)}>
        <path {...stroke} d={d} />
      </svg>
    );
  };
export const GridIcon = line("M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z");
export const FileIcon = line(
  "M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8l-5-5Zm0 0v5h5M9 13h6M9 17h4",
);
export const UserIcon = line("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7.5 8.5c.8-3.6 3.8-6 7.5-6s6.7 2.4 7.5 6");
export const ChatIcon = line("M4 5.5h16v10H9l-5 4v-14ZM8 9.5h8M8 12.5h5");
export const AlertIcon = line("M12 4 2.8 19.5h18.4L12 4Zm0 6v4.5m0 2.5v.5");
export const ChartIcon = line("M4 20V4m0 16h16M8 16v-4m4 4V8m4 8v-6");
export const ListIcon = line("M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01");
export const MailIcon = line("M3.5 6h17v12h-17zM4 6.5l8 6 8-6");
export const CameraIcon = line("M4 8h3.5L9 5.5h6L16.5 8H20v11H4V8Zm8 8.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z");
export const LockIcon = line("M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3");

export const CATEGORY_STYLE: Record<
  string,
  { Icon: (p: P) => React.JSX.Element; tint: string; ink: string }
> = {
  "emergency-accommodation": { Icon: HomeIcon, tint: "bg-brand-50", ink: "text-brand" },
  "food-and-essentials": { Icon: FoodIcon, tint: "bg-sun-50", ink: "text-[#9a5b00]" },
  "livelihood-recovery": { Icon: ShopIcon, tint: "bg-sea-50", ink: "text-sea" },
  "education-and-training": { Icon: BookIcon, tint: "bg-grape-50", ink: "text-grape" },
  "work-equipment": { Icon: ToolIcon, tint: "bg-leaf-50", ink: "text-leaf" },
  "community-projects": { Icon: CommunityIcon, tint: "bg-[#e8f5ff]", ink: "text-[#0b5f8a]" },
};
export const categoryStyle = (slug: string) =>
  CATEGORY_STYLE[slug] ?? { Icon: HeartIcon, tint: "bg-brand-50", ink: "text-brand" };
