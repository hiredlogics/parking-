import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { AppealBuilderSection } from "@/components/landing/AppealBuilderSection";
import { ExpertHelpSection } from "@/components/landing/ExpertHelpSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { TestimonialsSection } from "@/components/landing/TestimonialsSection";
import { BottomCTA } from "@/components/landing/BottomCTA";
import { TrustRow } from "@/components/landing/TrustRow";

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-white text-brand-text">
      <Header />
      <main>
        <Hero />
        <AppealBuilderSection />
        <ExpertHelpSection />
        <HowItWorksSection />
        <TestimonialsSection />
        <BottomCTA />
        <TrustRow />
      </main>
    </div>
  );
}
