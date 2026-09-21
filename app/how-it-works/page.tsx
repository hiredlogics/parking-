import type { Metadata } from "next";
import { Header } from "@/components/landing/Header";
import { HowItWorksHero } from "@/components/landing/HowItWorksHero";
import { HowItWorksTiers } from "@/components/landing/HowItWorksTiers";
import { BottomCTA } from "@/components/landing/BottomCTA";
import { Footer } from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "How It Works — Parking Appeals Group",
  description:
    "Self-service appeals from £4.99, Order for Recovery for £30, and expert help for court claims, CCJs and enforcement.",
};

export default function HowItWorksPage() {
  return (
    <div className="min-h-dvh bg-white text-brand-text">
      <Header />
      <main>
        <HowItWorksHero />
        <HowItWorksTiers />
        <BottomCTA variant="light" />
      </main>
      <Footer />
    </div>
  );
}
