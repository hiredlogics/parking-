import type { Metadata } from "next";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import {
  AboutHero,
  AboutReadyCta,
  AboutStory,
  AboutTechnology,
} from "@/components/landing/AboutPageContent";

export const metadata: Metadata = {
  title: "About Us — Parking Appeals Group",
  description:
    "Created from real experience. Parking Appeals Group makes parking appeals, court claims and enforcement simpler with clear guidance and professionally drafted documents.",
};

export default function AboutPage() {
  return (
    <div className="min-h-dvh bg-white text-brand-text">
      <Header />
      <main>
        <AboutHero />
        <AboutStory />
        <AboutTechnology />
        <AboutReadyCta />
      </main>
      <Footer />
    </div>
  );
}
