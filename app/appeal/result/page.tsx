import { redirect } from "next/navigation";

/**
 * Retired.
 *
 * This page used to assemble and preview appeal wording in the browser
 * before payment. Under the V2 workflow no appeal exists until the
 * payment gate is cleared, so there is nothing to preview here — the
 * pre-payment summary lives at /appeal/review, and the finished appeal
 * is served from the server after checkout.
 *
 * Kept as a redirect so existing links and stored progress still land
 * somewhere sensible.
 */
export default function ResultPage() {
  redirect("/appeal/review");
}
