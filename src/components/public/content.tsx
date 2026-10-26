import type { ReactNode } from "react";
import { Alert } from "@/components/ui";

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
    <article className="max-w-3xl">
      <h1 className="text-3xl">{title}</h1>
      {intro && <p className="mt-2 text-lg text-muted">{intro}</p>}
      {draftPolicy && (
        <div className="mt-4">
          <Alert tone="warning" title="Draft policy pending professional review">
            This policy describes how the platform is designed to operate. It must be reviewed by qualified
            legal, data-protection and fundraising advisers before KindSpring accepts real applicants or
            funds. It does not by itself establish legal compliance.
          </Alert>
        </div>
      )}
      <div className="prose-ks mt-6">{children}</div>
    </article>
  );
}
