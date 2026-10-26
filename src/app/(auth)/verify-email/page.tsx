import Link from "next/link";
import type { Metadata } from "next";
import { Alert } from "@/components/ui";
import { verifyEmail } from "@/server/services/auth";
import { toSafeMessage } from "@/lib/errors";

export const metadata: Metadata = { title: "Confirm email" };
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  let error: string | null = null;
  try {
    if (!token) throw new Error("missing");
    await verifyEmail(token);
  } catch (e) {
    error = token ? toSafeMessage(e) : "This link is incomplete.";
  }
  return (
    <div className="mx-auto max-w-md">
      {error ? (
        <Alert tone="danger" title="We could not confirm your email">{error}</Alert>
      ) : (
        <Alert tone="success" title="Your email address is confirmed">
          <Link href="/account">Continue to your account</Link>
        </Alert>
      )}
    </div>
  );
}
