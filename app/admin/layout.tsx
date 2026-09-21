import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { getSession } from "@/lib/auth/session";

/**
 * Server-side guard: only ADMIN sessions may render an admin page. A
 * signed-in customer who somehow lands here is bounced back to their
 * portal instead.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.userId || session.kind !== "ADMIN") {
    redirect(session.userId ? "/portal" : "/login");
  }
  return <AdminShell>{children}</AdminShell>;
}
