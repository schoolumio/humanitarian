import Link from "next/link";
import type { Metadata } from "next";
import { formatMoney } from "@/lib/money";
import { Alert, Card } from "@/components/ui";
import { getReturnStatus } from "@/server/services/payments";

export const metadata: Metadata = { title: "Payment status" };
export const dynamic = "force-dynamic";

/**
 * Shown after the hosted checkout. The browser redirect itself proves nothing: the status
 * shown here comes from our database, updated only by verified provider data.
 */
export default async function ReturnPage({ searchParams }: { searchParams: Promise<{ reference?: string }> }) {
  const { reference = "" } = await searchParams;
  const s = await getReturnStatus(reference);
  if (!s) return <Alert tone="danger" title="We could not find this payment." />;
  const confirmed = ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUND_PENDING", "REFUNDED", "DISPUTED"].includes(s.status);
  return (
    <div className="mx-auto max-w-xl">
      <Card>
        {confirmed ? (
          <Alert tone="success" title="Thank you – your contribution is confirmed">
            {formatMoney(s.amountMinor, s.currency)} to “{s.campaign.title}”. A receipt has been emailed to you.
          </Alert>
        ) : s.status === "FAILED" ? (
          <Alert tone="danger" title="The payment was not completed">You have not been charged by KindSpring. You can try again from the case page.</Alert>
        ) : (
          <Alert tone="info" title="We are waiting for confirmation from the payment provider">
            This usually takes a few seconds. <Link href={`/give/return?reference=${reference}`}>Refresh this page</Link>. You will also receive an email when it is confirmed.
          </Alert>
        )}
        <p className="mt-4"><Link href={`/cases/${s.campaign.publicId}`}>Return to the case</Link></p>
        <p className="mt-1 text-sm text-muted">Reference: {reference}</p>
      </Card>
    </div>
  );
}
