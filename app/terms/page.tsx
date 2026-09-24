import type { Metadata } from "next";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { activeVersion } from "@/lib/legal/registry";

export const metadata: Metadata = {
  title: "Terms and Conditions — Parking Appeals Group",
  description:
    "The Terms and Conditions governing the purchase and use of services provided through the Parking Appeals Group website.",
};

export default function TermsPage() {
  const doc = activeVersion("TERMS");
  return (
    <div className="min-h-dvh bg-white text-brand-text">
      <Header />
      <main>
        <LegalDocument doc={doc} />
      </main>
      <Footer />
    </div>
  );
}
