import Link from "@/components/ui/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

const buttonStyles = {
  primary: "bg-teal text-white hover:bg-teal-700",
  cta: "bg-amber text-charcoal hover:bg-amber-600",
  secondary: "bg-white text-teal border border-teal hover:bg-teal-50",
  danger: "bg-coral-700 text-white hover:opacity-90",
  ghost: "text-teal underline hover:bg-teal-50",
} as const;

export type ButtonVariant = keyof typeof buttonStyles;

export function buttonClass(variant: ButtonVariant = "primary", extra?: string) {
  return cx(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 font-semibold no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-60",
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
  return (
    <div
      className={cx("rounded-[var(--radius-card)] border border-line bg-white p-5", className)}
      {...props}
    />
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const tones = {
  neutral: "bg-ivory text-charcoal border-line",
  info: "bg-teal-50 text-teal border-teal/30",
  success: "bg-sage text-teal border-teal/30",
  warning: "bg-amber/25 text-charcoal border-amber-600/50",
  danger: "bg-coral/15 text-coral-700 border-coral/50",
} as const;

export type Tone = keyof typeof tones;

/** Status badges always carry text (never colour alone). */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx("inline-block rounded border px-2 py-0.5 text-sm font-medium", tones[tone])}>
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
    <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-md border p-4", tones[tone])}>
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
    <div className="rounded-[var(--radius-card)] border border-dashed border-line bg-white p-8 text-center">
      <p className="text-lg font-semibold text-teal">{title}</p>
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
      <span className="block text-sm text-muted">{label}</span>
      <span className="mt-1 block text-2xl font-bold text-teal">{value}</span>
      {hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
    </>
  );
  return href ? (
    <Link
      href={href}
      className="block rounded-[var(--radius-card)] border border-line bg-white p-4 no-underline hover:border-teal"
    >
      {body}
    </Link>
  ) : (
    <div className="rounded-[var(--radius-card)] border border-line bg-white p-4">{body}</div>
  );
}

/** Accessible progress bar with a text equivalent. */
export function Progress({ percent, label }: { percent: number; label: string }) {
  return (
    <div>
      <div
        className="h-3 w-full overflow-hidden rounded-full bg-sage"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-teal" style={{ width: `${percent}%` }} />
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
 * Responsive table: a normal table on wide screens, stacked label/value cards on phones.
 * Each cell provides its label through `columns`.
 */
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
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-white">
      <table className="w-full border-collapse text-left text-[0.95rem]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="hidden bg-teal-50 md:table-header-group">
          <tr>
            {columns.map((c) => (
              <th key={c.header} scope="col" className="px-3 py-2 font-semibold text-teal">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              className="block border-t border-line p-3 first:border-t-0 md:table-row md:p-0"
            >
              {columns.map((c) => (
                <td
                  key={c.header}
                  className={cx("flex gap-2 py-1 md:table-cell md:px-3 md:py-2 md:align-top", c.className)}
                >
                  <span className="w-32 shrink-0 text-sm text-muted md:hidden">{c.header}</span>
                  <span className="min-w-0 break-words">{c.cell(r)}</span>
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
      <label htmlFor={name} className="font-semibold">
        {label}
      </label>
      {hint && (
        <p id={`${name}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${name}-error`} className="text-sm font-medium text-coral-700">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  "min-h-11 w-full rounded-md border border-charcoal/40 bg-white px-3 py-2 text-charcoal placeholder:text-muted/70 aria-[invalid=true]:border-coral-700";

export function DefinitionList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[12rem_1fr]">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-sm font-semibold text-muted">{k}</dt>
          <dd className="mb-2 break-words sm:mb-0">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id ? `${id}-h` : undefined} className="mt-8">
      <h2 id={id ? `${id}-h` : undefined} className="mb-3 text-xl">
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
