import { StarIcon } from "./Icons";

export interface TestimonialCardProps {
  quote: string;
  name: string;
  role: string;
  /** Two-letter initials rendered on the avatar. */
  initials: string;
  /** Optional Tailwind gradient class list for the avatar background. */
  avatarBg?: string;
}

export function TestimonialCard({
  quote,
  name,
  role,
  initials,
  avatarBg = "bg-brand-pinkLight",
}: TestimonialCardProps) {
  return (
    <article className="flex h-full flex-col rounded-lg border border-brand-border bg-white p-6 shadow-card sm:p-7">
      <div className="mb-4 flex items-center gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <StarIcon key={i} className="h-4 w-4 text-brand-green" />
        ))}
      </div>
      <p className="text-[15px] leading-relaxed text-brand-text">"{quote}"</p>
      <div className="mt-6 flex items-center gap-3">
        <span
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-brand-pink ring-2 ring-white ${avatarBg}`}
          aria-hidden="true"
        >
          {initials}
        </span>
        <div>
          <p className="text-[13px] font-bold text-brand-text">{name}</p>
          <p className="text-[12px] text-brand-mute">{role}</p>
        </div>
      </div>
    </article>
  );
}
