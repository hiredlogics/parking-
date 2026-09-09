/**
 * Keeper-safe validation and transformation — Master Developer Pack, Part 10.
 *
 * Global Keeper Rule: the system must never identify or imply the driver
 * unless the driver has already been formally identified.
 *
 * This module:
 *   1. Provides the approved first-person → keeper-safe transformations
 *      from Part 10, used to normalise free-text customer input before it
 *      is inserted into any variable.
 *   2. Provides a validator that scans final appeal text and blocks any
 *      residual driver-identifying wording.
 *
 * Approved paragraphs from `paragraphs/library.ts` are keeper-safe as
 * written (verified by a library-wide unit test), so in practice the
 * validator only fires on values coming from free-text answers.
 */

export interface KeeperSafeMapping {
  /** Case-insensitive regex to match. */
  pattern: RegExp;
  /** Keeper-safe replacement string. */
  replacement: string;
  /** Short label surfaced in diagnostics. */
  label: string;
}

/**
 * Part 10 approved transformations. Order matters: more specific
 * variants are listed first so they win over the generic fallbacks.
 */
export const KEEPER_SAFE_MAPPINGS: KeeperSafeMapping[] = [
  // "I paid on the app." → "A payment was made using the parking app."
  {
    label: "paid on the app",
    pattern: /\bi\s+paid\s+(?:on|via|through|using)\s+the\s+(?:parking\s+)?app\b\.?/gi,
    replacement: "A payment was made using the parking app.",
  },
  // "I paid for my parking..." → generic paid mapping (Part 10)
  {
    label: "paid for my parking",
    pattern: /\bi\s+paid\s+for\s+my\s+parking\b\.?/gi,
    replacement: "A payment was made in connection with the parking session.",
  },

  // "I typed the wrong registration." / "I entered the wrong VRM..." →
  // "An incorrect vehicle registration was entered during the payment process."
  {
    label: "typed wrong registration",
    pattern: /\bi\s+(?:typed|entered|keyed)\s+(?:in\s+)?the\s+wrong\s+(?:reg(?:istration)?|number\s*plate|vrm)\b\.?/gi,
    replacement: "An incorrect vehicle registration was entered during the payment process.",
  },
  {
    label: "typo in registration",
    pattern: /\bi\s+made\s+a\s+typo\s+in\s+(?:the\s+)?(?:reg(?:istration)?|number\s*plate|vrm)\b\.?/gi,
    replacement: "An incorrect vehicle registration was entered during the payment process.",
  },

  // "I didn't see the sign when I drove in." / "I did not see the sign..." →
  // "No sufficiently prominent entrance signage was visible on entry."
  {
    label: "didn't see the sign",
    pattern: /\bi\s+(?:did\s*n[o']?t|didn'?t)\s+see\s+(?:any\s+|the\s+)?sign(?:s|age)?\b(?:\s+when\s+i\s+drove\s+in)?\.?/gi,
    replacement: "No sufficiently prominent entrance signage was visible on entry.",
  },
  {
    label: "couldn't see the sign",
    pattern: /\bi\s+(?:could\s*n[o']?t|couldn'?t)\s+see\s+(?:any\s+|the\s+)?sign(?:s|age)?\b\.?/gi,
    replacement: "No sufficiently prominent entrance signage was visible on entry.",
  },

  // "I went to the shop." / "I was shopping..." →
  // "The vehicle's presence was connected with a genuine customer visit."
  {
    label: "went to the shop",
    pattern: /\bi\s+went\s+to\s+the\s+shop\b\.?/gi,
    replacement: "The vehicle's presence was connected with a genuine customer visit.",
  },
  {
    label: "was shopping",
    pattern: /\bi\s+was\s+shopping\b\.?/gi,
    replacement: "The vehicle's presence was connected with a genuine customer visit.",
  },

  // "I came back twice." / "I drove back..." →
  // "The vehicle attended the location on more than one separate occasion."
  {
    label: "came back twice",
    pattern: /\bi\s+came\s+back\s+(?:twice|again)\b\.?/gi,
    replacement: "The vehicle attended the location on more than one separate occasion.",
  },
  {
    label: "drove back",
    pattern: /\bi\s+drove\s+back\b\.?/gi,
    replacement: "The vehicle attended the location on more than one separate occasion.",
  },

  // ---- Added by MASTER Developer Pack V2, Part 11 ----

  // "I broke down and couldn't move." →
  // "The vehicle became mechanically immobilised and could not
  //  reasonably be moved during the relevant period."
  {
    label: "broke down and couldn't move",
    pattern:
      /\bi\s+broke\s+down\s+and\s+(?:i\s+)?(?:could\s*n[o']?t|couldn'?t)\s+move\b(?:\s+(?:it|the\s+car|the\s+vehicle))?\.?/gi,
    replacement:
      "The vehicle became mechanically immobilised and could not reasonably be moved during the relevant period.",
  },
  {
    label: "broke down",
    pattern: /\bi\s+broke\s+down\b\.?/gi,
    replacement: "The vehicle became mechanically immobilised.",
  },
  {
    label: "my car wouldn't start",
    pattern:
      /\bmy\s+(?:car|vehicle)\s+(?:would\s*n[o']?t|wouldn'?t|did\s*n[o']?t|didn'?t)\s+start\b\.?/gi,
    replacement: "The vehicle became mechanically immobilised and would not start.",
  },

  // "I park there because I live there." →
  // "The vehicle was parked pursuant to the resident's pre-existing
  //  parking rights, subject to the terms of the relevant tenancy/lease."
  {
    label: "park there because I live there",
    pattern:
      /\bi\s+park(?:ed)?\s+there\s+because\s+i\s+live\s+there\b\.?/gi,
    replacement:
      "The vehicle was parked pursuant to the resident's pre-existing parking rights, subject to the terms of the relevant tenancy/lease.",
  },
  {
    label: "I live there and parked",
    pattern: /\bi\s+live\s+there\s+and\s+park(?:ed)?\b[^.]*\.?/gi,
    replacement:
      "The vehicle was parked pursuant to the resident's pre-existing parking rights, subject to the terms of the relevant tenancy/lease.",
  },
  {
    label: "it's my parking space",
    pattern:
      /\bit'?s?\s+my\s+(?:allocated\s+)?parking\s+(?:space|bay)\b\.?/gi,
    replacement:
      "The space is allocated to the resident under the relevant tenancy/lease.",
  },

  // Generic fallbacks for residual first-person driver wording.
  { label: "i parked", pattern: /\bi\s+parked\b/gi, replacement: "The vehicle was parked" },
  {
    label: "i entered the car park",
    pattern: /\bi\s+(?:entered|drove\s+into|went\s+into)\s+(?:the\s+)?(?:car\s*park|site)\b/gi,
    replacement: "The vehicle entered the site",
  },
  { label: "i drove", pattern: /\bi\s+drove\b/gi, replacement: "The vehicle was driven" },
  {
    label: "i left the car park",
    pattern: /\bi\s+left\s+(?:the\s+)?(?:car\s*park|site)\b/gi,
    replacement: "The vehicle left the site",
  },
  {
    label: "i overstayed",
    pattern: /\bi\s+overstayed\b/gi,
    replacement: "The vehicle's stay exceeded the permitted period",
  },
  {
    label: "i returned to my car",
    pattern: /\bi\s+returned\s+to\s+(?:my|the)\s+car\b/gi,
    replacement: "The registered keeper returned to the vehicle",
  },
  { label: "my car", pattern: /\bmy\s+car\b/gi, replacement: "the vehicle" },
  { label: "i paid", pattern: /\bi\s+(?:have\s+)?paid\b/gi, replacement: "A payment was made" },
];

/**
 * Patterns that unmistakably identify or imply the driver. If any remain
 * after transformation, generation MUST be blocked.
 */
/**
 * Patterns that unmistakably identify or imply the driver in a
 * customer-facing prompt or a first-person statement by the appellant.
 *
 * Note: an approved paragraph may reference statutory concepts such as
 * "the driver's name and current address for service" (see PP-POFA-005E)
 * without identifying the driver. Those legitimate references are not
 * matched here; the patterns target first-person driver wording and
 * driver-identification questions the system might have asked.
 */
export const UNSAFE_DRIVER_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { label: "I drove", pattern: /\bi\s+drove\b/gi },
  { label: "I parked", pattern: /\bi\s+parked\b/gi },
  { label: "I overstayed", pattern: /\bi\s+overstayed\b/gi },
  { label: "I returned to my car", pattern: /\bi\s+returned\s+to\s+(?:my|the)\s+car\b/gi },
  {
    label: "I entered the car park",
    pattern: /\bi\s+(?:entered|drove\s+into|went\s+into)\s+(?:the\s+)?(?:car\s*park|site)\b/gi,
  },
  { label: "I paid", pattern: /\bi\s+paid\b/gi },
  { label: "who was driving", pattern: /\bwho\s+was\s+driving\b/gi },
  { label: "were you driving", pattern: /\bwere\s+you\s+driving\b/gi },
  // Match prompt-like requests for the driver's name — the pack forbids the
  // system asking for or requesting the driver's name. A statutory
  // reference embedded in an approved paragraph (e.g. "notification of the
  // driver's name and current address for service") is not a prompt.
  {
    label: "provide/what is the driver's name",
    pattern:
      /\b(?:provide|give(?:\s+us)?|state|what(?:\s+is|'s)?|please\s+(?:provide|give))\s+(?:the\s+)?driver'?s?\s+name\b/gi,
  },
  {
    label: "driver's name?",
    pattern: /\bdriver'?s?\s+name\s*\?/gi,
  },
];

export interface TransformResult {
  text: string;
  appliedMappings: string[];
}

export function transformToKeeperSafe(input: string): TransformResult {
  let text = input;
  const applied: string[] = [];
  for (const m of KEEPER_SAFE_MAPPINGS) {
    m.pattern.lastIndex = 0;
    if (m.pattern.test(text)) {
      m.pattern.lastIndex = 0;
      text = text.replace(m.pattern, m.replacement);
      applied.push(m.label);
    }
  }
  return { text, appliedMappings: applied };
}

export interface KeeperSafeCheck {
  ok: boolean;
  violations: Array<{ label: string; excerpt: string }>;
}

export function validateKeeperSafe(text: string): KeeperSafeCheck {
  const violations: Array<{ label: string; excerpt: string }> = [];
  for (const { pattern, label } of UNSAFE_DRIVER_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const start = Math.max(0, match.index - 30);
      const end = Math.min(text.length, match.index + match[0].length + 30);
      violations.push({ label, excerpt: text.slice(start, end) });
    }
  }
  return { ok: violations.length === 0, violations };
}

export function makeKeeperSafeOrReport(input: string): {
  text: string;
  appliedMappings: string[];
  residualViolations: KeeperSafeCheck["violations"];
} {
  const { text, appliedMappings } = transformToKeeperSafe(input);
  const check = validateKeeperSafe(text);
  return { text, appliedMappings, residualViolations: check.violations };
}
