import { TestimonialCard } from "./TestimonialCard";

export function TestimonialsSection() {
  return (
    <section className="bg-brand-canvas py-14 sm:py-16 lg:py-20">
      <div className="container-page">
        <h2 className="text-center text-[13px] font-bold uppercase tracking-widest text-brand-text">
          Real Cases. Real Results.
        </h2>

        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
          <TestimonialCard
            quote="Brilliant service from start to finish. My parking charge was cancelled within days."
            name="Sarah M."
            role="Private Parking Charge"
            initials="SM"
            avatarBg="bg-brand-pinkLight"
          />
          <TestimonialCard
            quote="They helped me respond to a court claim and I got the claim dismissed. Highly recommend."
            name="James T."
            role="Court Claim"
            initials="JT"
            avatarBg="bg-brand-pinkLight"
          />
          <TestimonialCard
            quote="My CCJ was removed quickly and my credit score is back on track. Thank you!"
            name="Leanne K."
            role="CCJ Removal"
            initials="LK"
            avatarBg="bg-brand-pinkLight"
          />
        </div>
      </div>
    </section>
  );
}
