"use client";

import { Alert, Button } from "@/components/ui";

/** Never shows stack traces or internal messages. */
export default function ErrorPage({ reset, error }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl">
      <Alert tone="danger" title="Something went wrong">
        <p>Please try again. If the problem continues, contact us and quote this reference: {error.digest ?? "unavailable"}.</p>
        <div className="mt-3"><Button variant="secondary" onClick={reset}>Try again</Button></div>
      </Alert>
    </div>
  );
}
