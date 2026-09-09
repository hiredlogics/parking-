import { redirect } from "next/navigation";
import { PortalShell } from "@/components/portal/PortalShell";
import { getSession } from "@/lib/auth/session";

/**
 * Portal is customer-facing. Admins can also view it (useful for
 * support); unauthenticated visitors are sent to /signin.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.userId) {
    redirect("/signin?next=/portal");
  }
  return <PortalShell>{children}</PortalShell>;
}
