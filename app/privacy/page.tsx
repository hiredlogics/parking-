import type { Metadata } from "next";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { activeVersion } from "@/lib/legal/registry";

export const metadata: Metadata = {
  title: "Privacy Policy — Parking Appeals Group",
  description:
    "How The Parking Appeals Group Limited handles personal information.",
};

export default function PrivacyPage() {
  const doc = activeVersion("PRIVACY");
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
