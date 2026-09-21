import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { AppealBuilderSection } from "@/components/landing/AppealBuilderSection";
import { OrderForRecoverySection } from "@/components/landing/OrderForRecoverySection";
import { ExpertHelpSection } from "@/components/landing/ExpertHelpSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { BottomCTA } from "@/components/landing/BottomCTA";
import { Footer } from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-white text-brand-text">
      <Header />
      <main>
        <Hero />
        <AppealBuilderSection />
        <OrderForRecoverySection />
        <ExpertHelpSection />
        <HowItWorksSection />
        <BottomCTA />
      </main>
      <Footer />
    </div>
  );
}
