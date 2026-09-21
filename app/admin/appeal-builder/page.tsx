import { redirect } from "next/navigation";

/** Appeal Builder admin screen removed — use Appeal Cases / Appeals for Review. */
export default function AppealBuilderRedirect() {
  redirect("/admin/cases");
}
