import Image from "next/image";

/**
 * Brand logo. Renders the client-supplied `public/logo.png` mark.
 * `className` controls sizing (Tailwind width/height utilities).
 * Aspect ratio of the supplied PNG is 251×200.
 */
export function Logo({
  className,
  alt = "Parking Appeals Group",
  width = 40,
  height = 32,
}: {
  className?: string;
  alt?: string;
  width?: number;
  height?: number;
}) {
  return (
    <Image
      src="/logo.png"
      alt={alt}
      width={width}
      height={height}
      priority
      className={className}
    />
  );
}
