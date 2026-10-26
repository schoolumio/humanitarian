import Link from "next/link";
import { Alert } from "@/components/ui";

export const metadata = { title: "Access denied" };

export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-xl">
      <Alert tone="warning" title="You do not have access to this page">
        <p>Your account does not have the permissions needed. If you think this is a mistake, contact your KindSpring administrator.</p>
        <p className="mt-2"><Link href="/">Return to the home page</Link></p>
      </Alert>
    </div>
  );
}
