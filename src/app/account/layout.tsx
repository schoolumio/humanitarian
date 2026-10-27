import { PortalShell } from "@/components/layout/portal-shell";
import { getActor } from "@/server/current-user";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  // Signed-out visitors are redirected to sign in by the page itself.
  return actor ? <PortalShell actor={actor}>{children}</PortalShell> : <>{children}</>;
}
