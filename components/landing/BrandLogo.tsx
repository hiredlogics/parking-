import Link from "next/link";

/**
 * Option 1 wordmark — stacked, no monogram, no tagline:
 *   THE            (small, pink, letter-spaced)
 *   PARKING APPEALS
 *   GROUP
 */
export function BrandLogo({
  href = "/",
  invert = false,
  className = "",
  size = "md",
}: {
  href?: string;
  /** Light main lines for dark footers; THE stays brand pink. */
  invert?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const main = invert ? "text-white" : "text-brand-text";
  const scale =
    size === "lg"
      ? {
          the: "text-[10px] tracking-[0.42em] sm:text-[11px]",
          line: "text-[15px] tracking-[0.06em] sm:text-[17px]",
          gap: "gap-[0.15em]",
        }
      : size === "sm"
        ? {
            the: "text-[8px] tracking-[0.38em]",
            line: "text-[11px] tracking-[0.05em]",
            gap: "gap-[0.12em]",
          }
        : {
            the: "text-[9px] tracking-[0.4em] sm:text-[10px]",
            line: "text-[13px] tracking-[0.055em] sm:text-[14px]",
            gap: "gap-[0.14em]",
          };

  return (
    <Link
      href={href}
      className={`inline-flex shrink-0 flex-col items-start focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink focus-visible:ring-offset-2 ${className}`}
      aria-label="Parking Appeals Group — Home"
    >
      <span
        className={`font-display font-bold uppercase leading-none text-brand-pink ${scale.the}`}
      >
        THE
      </span>
      <span
        className={`mt-1 flex flex-col font-display font-extrabold uppercase leading-[1.05] ${main} ${scale.gap} ${scale.line}`}
      >
        <span>Parking Appeals</span>
        <span>Group</span>
      </span>
    </Link>
  );
}
