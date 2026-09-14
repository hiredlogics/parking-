import { redirect } from "next/navigation";

/** Appeal flow now starts at upload. */
export default function StartPage() {
  redirect("/appeal/upload");
}
