import Link from "next/link";

/** PA mark + wordmark — matches Parking Appeals Group marketing site. */
export function BrandLogo({
  href = "/",
  invert = false,
  className = "",
}: {
  href?: string;
  /** White wordmark for dark footers */
  invert?: boolean;
  className?: string;
}) {
  const word = invert ? "text-white" : "text-brand-text";
  return (
    <Link
      href={href}
      className={`flex shrink-0 items-center gap-2.5 focus:outline-none ${className}`}
      aria-label="Parking Appeals Group — Home"
    >
      <span
        className="text-[28px] font-black leading-none tracking-tight sm:text-[30px]"
        aria-hidden
      >
        <span className="text-brand-pink">P</span>
        <span className={invert ? "text-white" : "text-brand-text"}>A</span>
      </span>
      <span className={`flex flex-col leading-[1.05] ${word}`}>
        <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] sm:text-[11px]">
          Parking Appeals
        </span>
        <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] sm:text-[11px]">
          Group
        </span>
      </span>
    </Link>
  );
}
