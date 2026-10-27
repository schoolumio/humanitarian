import Link from "@/components/ui/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

const buttonStyles = {
  primary:
    "bg-gradient-to-r from-brand to-brand-600 text-white shadow-[0_8px_20px_-8px_rgb(200_23_79/0.6)] hover:from-brand-700 hover:to-brand",
  cta: "bg-sun text-ink shadow-[0_8px_20px_-8px_rgb(245_167_10/0.7)] hover:bg-sun-600",
  secondary: "bg-white text-brand border-2 border-brand/25 hover:border-brand hover:bg-brand-50",
  danger: "bg-danger-700 text-white hover:opacity-90",
  ghost: "text-brand underline hover:bg-brand-50",
} as const;

export type ButtonVariant = keyof typeof buttonStyles;

export function buttonClass(variant: ButtonVariant = "primary", extra?: string) {
  return cx(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2 font-bold no-underline transition-all disabled:cursor-not-allowed disabled:opacity-60",
    buttonStyles[variant],
    extra,
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("card p-5 sm:p-6", className)} {...props} />;
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="bg-blush relative mb-8 overflow-hidden rounded-[1.75rem] border border-brand-100 px-6 py-6 shadow-[var(--shadow-soft)] sm:px-8 sm:py-7">
      <span aria-hidden="true" className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-sun/25" />
      <span aria-hidden="true" className="absolute -bottom-20 right-40 h-36 w-36 rounded-full bg-brand/10" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-2 text-sm font-extrabold uppercase tracking-wider text-brand">{eyebrow}</p>
          ) : (
            <span aria-hidden="true" className="mb-3 block h-1.5 w-14 rounded-full bg-sunrise" />
          )}
          <h1 className="break-words text-3xl sm:text-4xl">{title}</h1>
          {description && <div className="mt-2 max-w-3xl text-muted">{description}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

const tones = {
  neutral: "bg-[#f4f0fa] text-ink border-[#e3dcef]",
  info: "bg-grape-50 text-grape border-grape/25",
  success: "bg-leaf-50 text-leaf border-leaf/30",
  warning: "bg-sun-50 text-[#7a4a00] border-sun-600/50",
  danger: "bg-brand-50 text-danger-700 border-danger/40",
} as const;

export type Tone = keyof typeof tones;

/** Status badges always carry text (never colour alone). */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx("inline-block max-w-full rounded-full border px-3 py-0.5 text-sm font-bold", tones[tone])}
    >
      {children}
    </span>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-2xl border p-4", tones[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : ""}>{children}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border-2 border-dashed border-brand/20 bg-white/80 p-8 text-center sm:p-10">
      <span
        aria-hidden="true"
        className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-2xl"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-7 w-7 text-brand"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 20s-8-4.6-8-10.7C4 6.4 6.2 4.5 8.6 4.5c1.6 0 2.7.8 3.4 1.9.7-1.1 1.8-1.9 3.4-1.9 2.4 0 4.6 1.9 4.6 4.8C20 15.4 12 20 12 20Z" />
        </svg>
      </span>
      <p className="font-[family-name:var(--font-display)] text-lg font-bold text-ink">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-xl text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: ReactNode;
  href?: string;
  hint?: string;
}) {
  const body = (
    <>
      <span className="block text-sm font-semibold text-muted">{label}</span>
      <span className="mt-1 block font-[family-name:var(--font-display)] text-3xl font-extrabold text-brand">
        {value}
      </span>
      {hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
    </>
  );
  return href ? (
    <Link href={href} className="card lift block border-l-4 border-l-brand p-5 no-underline">
      {body}
    </Link>
  ) : (
    <div className="card border-l-4 border-l-sun p-5">{body}</div>
  );
}

/** Accessible progress bar with a text equivalent. */
export function Progress({ percent, label }: { percent: number; label: string }) {
  return (
    <div>
      <div
        className="h-3.5 w-full overflow-hidden rounded-full bg-brand-50"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-sunrise"
          style={{ width: `${Math.max(percent, percent > 0 ? 3 : 0)}%` }}
        />
      </div>
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (p: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-2">
      {page > 1 ? (
        <Link className={buttonClass("secondary")} href={hrefFor(page - 1)}>
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link className={buttonClass("secondary")} href={hrefFor(page + 1)}>
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/**
 * Responsive table: a normal table when its container is wide enough, stacked label/value
 * cards otherwise. Uses container queries so tables inside sidebars or narrow columns switch
 * layout based on the space they actually have; wider tables switch later. Each cell provides
 * its label through `columns`.
 */
const TABLE_LAYOUT = {
  // Class strings are spelled out in full so Tailwind can find them.
  narrow: {
    head: "hidden @2xl:table-header-group",
    row: "@2xl:table-row @2xl:p-0",
    cell: "@2xl:table-cell @2xl:px-3 @2xl:py-3 @2xl:align-top",
    label: "@2xl:hidden",
  },
  medium: {
    head: "hidden @3xl:table-header-group",
    row: "@3xl:table-row @3xl:p-0",
    cell: "@3xl:table-cell @3xl:px-3 @3xl:py-3 @3xl:align-top",
    label: "@3xl:hidden",
  },
  wide: {
    head: "hidden @4xl:table-header-group",
    row: "@4xl:table-row @4xl:p-0",
    cell: "@4xl:table-cell @4xl:px-3 @4xl:py-3 @4xl:align-top",
    label: "@4xl:hidden",
  },
} as const;

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
}: {
  columns: { header: string; cell: (row: T) => ReactNode; className?: string }[];
  rows: T[];
  rowKey: (row: T) => string;
  caption?: string;
}) {
  const L = TABLE_LAYOUT[columns.length <= 4 ? "narrow" : columns.length <= 6 ? "medium" : "wide"];
  return (
    <div className="@container card overflow-x-auto">
      <table className="w-full border-collapse text-left text-[0.95rem]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className={cx("bg-[#f6f1fb]", L.head)}>
          <tr>
            {columns.map((c) => (
              <th
                key={c.header}
                scope="col"
                className="whitespace-nowrap px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-grape"
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              className={cx(
                "block border-t border-line p-3 transition-colors first:border-t-0 hover:bg-cream",
                L.row,
              )}
            >
              {columns.map((c) => (
                <td key={c.header} className={cx("flex gap-2 py-1", L.cell, c.className)}>
                  <span className={cx("w-32 shrink-0 text-sm text-muted", L.label)}>{c.header}</span>
                  <span className="min-w-0 wrap-anywhere">{c.cell(r)}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Field({
  label,
  name,
  hint,
  error,
  children,
}: {
  label: string;
  name: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="font-bold">
        {label}
      </label>
      {hint && (
        <p id={`${name}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${name}-error`} className="text-sm font-medium text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  "min-h-12 w-full rounded-xl border-2 border-[#ddd3e8] bg-white px-4 py-2 text-ink placeholder:text-muted/70 transition-colors focus:border-brand focus:outline-none focus-visible:outline-2 focus-visible:outline-grape aria-[invalid=true]:border-danger-700";

export function DefinitionList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[minmax(7rem,12rem)_minmax(0,1fr)]">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="min-w-0 text-sm font-semibold text-muted">{k}</dt>
          <dd className="mb-2 min-w-0 wrap-anywhere sm:mb-0">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id ? `${id}-h` : undefined} className="mt-8">
      <h2 id={id ? `${id}-h` : undefined} className="mb-4 text-2xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function formatDate(d: Date | string | null | undefined, withTime = false) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
    timeZone: "Africa/Lagos",
  }).format(date);
}

export function humanize(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
}
