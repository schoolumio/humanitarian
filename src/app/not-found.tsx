import Link from "next/link";
import { Alert } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl">
      <Alert tone="info" title="Page not found">
        <p>This page does not exist or you do not have access to it.</p>
        <p className="mt-2"><Link href="/">Go to the home page</Link></p>
      </Alert>
    </div>
  );
}
