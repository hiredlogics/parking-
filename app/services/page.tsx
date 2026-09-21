import type { Metadata } from "next";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { ServicesPageContent } from "@/components/landing/ServicesPageContent";

export const metadata: Metadata = {
  title: "Our Services — Parking Appeals Group",
  description:
    "Simple, affordable solutions for parking tickets, court claims and enforcement action. Choose the service that matches your notice.",
};

export default function ServicesPage() {
  return (
    <div className="min-h-dvh bg-white text-brand-text">
      <Header />
      <main>
        <ServicesPageContent />
      </main>
      <Footer />
    </div>
  );
}
