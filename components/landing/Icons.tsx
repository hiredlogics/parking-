import type { ReactElement, SVGProps } from "react";

/**
 * Landing-page icon set.
 * All icons are `currentColor` so callers control colour via Tailwind's
 * `text-*` utilities. Sizing is controlled via `w-*`/`h-*` utilities on
 * the caller side (each icon defaults to a sensible viewBox).
 *
 * These are hand-tuned SVGs — no external icon package — to keep the
 * bundle size down and match the pink-line aesthetic of the reference.
 */

type Icon = ((props: SVGProps<SVGSVGElement>) => ReactElement) & {
  displayName?: string;
};

function wrap(
  displayName: string,
  children: ReactElement,
  viewBox = "0 0 24 24",
): Icon {
  const C: Icon = (props) => (
    <svg
      viewBox={viewBox}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
  C.displayName = displayName;
  return C;
}

export const ArrowRightIcon = wrap(
  "ArrowRightIcon",
  <path d="M5 12h14M13 5l7 7-7 7" />,
);

export const ChevronDownIcon = wrap(
  "ChevronDownIcon",
  <path d="M6 9l6 6 6-6" />,
);

export const ShieldIcon = wrap(
  "ShieldIcon",
  <>
    <path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" />
    <path d="M9.5 12.5l1.75 1.75L15 10.5" />
  </>,
);

export const LockIcon = wrap(
  "LockIcon",
  <>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    <path d="M12 15v2" />
  </>,
);

export const ClockIcon = wrap(
  "ClockIcon",
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);

export const PoundIcon = wrap(
  "PoundIcon",
  <path d="M8 20h9M8.5 20V13a5 5 0 0 1 9.5-2M6.5 15h7" />,
);

export const HeadsetIcon = wrap(
  "HeadsetIcon",
  <>
    <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
    <rect x="3" y="13" width="4" height="6" rx="1.5" />
    <rect x="17" y="13" width="4" height="6" rx="1.5" />
    <path d="M20 19v1a3 3 0 0 1-3 3h-3" />
  </>,
);

export const ChatQuestionIcon = wrap(
  "ChatQuestionIcon",
  <>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v9A2.5 2.5 0 0 1 17.5 17H12l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 14.5v-9z" />
    <path d="M10 8.5a2 2 0 1 1 3.5 1.3c-.7.5-1.5.9-1.5 1.7v.5" />
    <path d="M12 14.25v.01" />
  </>,
);

export const CheckIcon = wrap("CheckIcon", <path d="M4 12l5 5L20 6" />);

export function StarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2.5l3.09 6.26 6.91 1.01-5 4.87 1.18 6.86L12 18.27l-6.18 3.24L7 14.64l-5-4.87 6.91-1.01L12 2.5z" />
    </svg>
  );
}

/** Courthouse / building icon (Council PCN + CCJ Removal). */
export const CourthouseIcon = wrap(
  "CourthouseIcon",
  <>
    <path d="M3 20h18" />
    <path d="M4 20V10" />
    <path d="M8 20V10" />
    <path d="M12 20V10" />
    <path d="M16 20V10" />
    <path d="M20 20V10" />
    <path d="M2 10h20L12 3 2 10z" />
    <path d="M2 20l-.5 1h21L22 20" />
  </>,
);

/** Car / private parking icon. */
export const CarIcon = wrap(
  "CarIcon",
  <>
    <path d="M4 17h16" />
    <path d="M5 17v2h2v-2" />
    <path d="M17 17v2h2v-2" />
    <path d="M4 17l1.5-5.5A2 2 0 0 1 7.4 10h9.2a2 2 0 0 1 1.9 1.5L20 17" />
    <path d="M6 14h12" />
    <circle cx="7.5" cy="14.5" r=".8" />
    <circle cx="16.5" cy="14.5" r=".8" />
  </>,
);

/** Simple document / certificate icon. */
export const DocumentIcon = wrap(
  "DocumentIcon",
  <>
    <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M15 3v4h4" />
    <path d="M8 12h8M8 15h8M8 18h5" />
  </>,
);

/** Gavel icon for Court Claim. */
export const GavelIcon = wrap(
  "GavelIcon",
  <>
    <path d="M14 3l7 7-3 3-7-7 3-3z" />
    <path d="M11 6l4 4" />
    <path d="M4.5 21l7.5-7.5" />
    <path d="M3 21h9" />
    <path d="M6 12l6 6" />
  </>,
);

/** Person + shield icon for bailiff / enforcement. */
export const PersonShieldIcon = wrap(
  "PersonShieldIcon",
  <>
    <circle cx="9" cy="7" r="3" />
    <path d="M3.5 20c.6-3.3 2.9-5.5 5.5-5.5s4.9 2.2 5.5 5.5" />
    <path d="M17 9l4 1.5V14c0 3-2 4.8-4 5.5-2-.7-4-2.5-4-5.5v-3.5L17 9z" />
  </>,
);

/** A small logo mark used inline where the PNG is oversized. */
export function LogoMarkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" {...props}>
      <rect x="1" y="1" width="38" height="38" rx="7" fill="#EC1573" />
      <text
        x="50%"
        y="55%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontWeight="800"
        fontSize="20"
        fill="#ffffff"
      >
        PA
      </text>
    </svg>
  );
}

/**
 * Yellow "sticker" icon used to punch up the Penalty Charge Notice card
 * (the yellow sticker in the top-left of the hero visual).
 */
export function YellowTicketBadge(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" {...props}>
      <rect
        x="6"
        y="6"
        width="88"
        height="88"
        fill="#FFE01B"
        stroke="#111827"
        strokeWidth="4"
      />
      <text
        x="50"
        y="42"
        textAnchor="middle"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontWeight="900"
        fontSize="10.5"
        fill="#111827"
      >
        PENALTY
      </text>
      <text
        x="50"
        y="58"
        textAnchor="middle"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontWeight="900"
        fontSize="10.5"
        fill="#111827"
      >
        CHARGE
      </text>
      <text
        x="50"
        y="74"
        textAnchor="middle"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontWeight="900"
        fontSize="10.5"
        fill="#111827"
      >
        NOTICE
      </text>
    </svg>
  );
}
