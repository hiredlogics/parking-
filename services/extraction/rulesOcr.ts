import { createHash } from "crypto";
import type { ExtractedPcn, ExtractionResult, NoticeRoute } from "@/types";
import { resolveUkJurisdiction } from "@/lib/questions/jurisdiction";

/**
 * Rules / OCR-style fallback for UK private parking notices.
 *
 * Used when OpenAI vision is down, timed out, or rate-limited.
 * Pulls printable text from PDFs (and any embedded strings in images
 * are not OCR'd here — images without AI return empty fields + a warning
 * so the customer can type details on /appeal/confirm).
 *
 * Never invents legal conclusions — only pattern matches.
 */

const KNOWN_OPERATORS = [
  "ParkingEye",
  "Euro Car Parks",
  "Euro Car Park",
  "CP Plus",
  "Civil Enforcement",
  "CEL",
  "UKPC",
  "UK Parking Control",
  "Total Parking Solutions",
  "TPS",
  "APCOA",
  "NCP",
  "Metropolis",
  "Premier Park",
  "Parking and Property Management",
  "PPM",
  "Vehicle Control Services",
  "VCS",
  "Excel Parking",
  "Britannia Parking",
  "Smart Parking",
  "Indigo",
  "NSL",
  "Parking Ticketing Ltd",
  "Highview Parking",
] as const;

/** UK VRM patterns (current + older formats), allowing optional space. */
const VRM_RE =
  /\b([A-Z]{2}\d{2}\s?[A-Z]{3}|[A-Z]\d{1,3}\s?[A-Z]{3}|[A-Z]{3}\s?\d{1,3}[A-Z])\b/gi;

const PCN_STOP = new Set([
  "NUMBER",
  "REFERENCE",
  "NOTICE",
  "PARKING",
  "CHARGE",
  "TICKET",
  "VEHICLE",
  "AMOUNT",
  "TOTAL",
  "DATE",
  "LOCATION",
  "PARKINGEYE",
  "EURO",
]);

/** Prefer explicit “PCN reference / number : VALUE” forms. */
const PCN_RE =
  /(?:\bPCN\b|\bParking\s*Charge(?:\s*Notice)?)\s*(?:Reference|Ref\.?|No\.?|Number|#)\s*[:#]?\s*([A-Z0-9][-A-Z0-9/]{4,24})\b/i;

const AMOUNT_RE =
  /(?:£|GBP\s*)(\d{1,4}(?:\.\d{2})?)\b|(?:amount|charge|total|pay(?:ment)?)\s*(?:due|of|:)?\s*£?\s*(\d{1,4}(?:\.\d{2})?)/gi;

const DATE_RE =
  /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/g;

const TIME_RE = /\b([01]?\d|2[0-3])[:.]([0-5]\d)(?::[0-5]\d)?\b/g;

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

/**
 * Pull readable text from PDF bytes without a heavy PDF engine.
 * Works for many text-based parking PDFs; scanned image PDFs need AI/OCR.
 */
export function extractPrintableText(bytes: Uint8Array, mimeType: string): string {
  const mime = mimeType.toLowerCase();
  const raw = Buffer.from(bytes).toString("latin1");

  if (mime.includes("pdf") || raw.startsWith("%PDF")) {
    // Prefer parenthesised PDF string literals: (Hello World)
    const fromLiterals: string[] = [];
    const lit = /\((?:\\.|[^\\)]){2,200}\)/g;
    let m: RegExpExecArray | null;
    while ((m = lit.exec(raw)) !== null) {
      const inner = m[0]
        .slice(1, -1)
        .replace(/\\([nrt()\\])/g, (_, c: string) =>
          c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? "\t" : c,
        );
      if (/[A-Za-z0-9£]/.test(inner)) fromLiterals.push(inner);
    }
    if (fromLiterals.length >= 3) {
      return fromLiterals.join("\n");
    }
  }

  // Generic printable sweep (also helps some image EXIF / embedded text).
  return raw
    .replace(/[^\x09\x0A\x0D\x20-\x7E£]/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

export function parsePcnText(text: string): {
  raw: ExtractedPcn;
  confidence: ExtractionResult["confidence"];
  warnings: string[];
} {
  const warnings: string[] = [];
  const confidence: ExtractionResult["confidence"] = {};
  const raw: ExtractedPcn = { case_stage: "INITIAL_OPERATOR_APPEAL" };
  const upper = text.toUpperCase();
  const normalised = text.replace(/\s+/g, " ");

  // Operator
  for (const name of KNOWN_OPERATORS) {
    if (upper.includes(name.toUpperCase())) {
      raw.operator_name = name === "Euro Car Park" ? "Euro Car Parks" : name;
      confidence.operator_name = 0.75;
      break;
    }
  }

  // PCN reference
  const pcn = PCN_RE.exec(normalised);
  if (pcn?.[1]) {
    const candidate = pcn[1].trim().toUpperCase();
    if (/\d/.test(candidate) && !PCN_STOP.has(candidate)) {
      raw.pcn_number = candidate;
      confidence.pcn_number = 0.7;
    }
  }
  // Secondary: “Reference: 1234567890” / “Ticket No 12345”
  if (!raw.pcn_number) {
    const alt =
      /\b(?:Reference|Ticket\s*(?:No\.?|Number)|Notice\s*(?:No\.?|Number))\s*[:#]?\s*([A-Z0-9][-A-Z0-9/]{5,24})\b/i.exec(
        normalised,
      );
    const candidate = alt?.[1]?.trim().toUpperCase();
    if (candidate && /\d/.test(candidate) && !PCN_STOP.has(candidate)) {
      raw.pcn_number = candidate;
      confidence.pcn_number = 0.65;
    }
  }

  // VRM — pick the most "notice-like" match (skip common false positives)
  const vrms = [...normalised.matchAll(VRM_RE)]
    .map((x) => x[1].replace(/\s+/g, " ").toUpperCase())
    .filter((v) => !/^(PDF|HTTP|HTTPS|PAGE)$/i.test(v));
  if (vrms.length > 0) {
    raw.vrm = vrms[0].length === 7 && !vrms[0].includes(" ")
      ? `${vrms[0].slice(0, 4)} ${vrms[0].slice(4)}`
      : vrms[0];
    confidence.vrm = 0.65;
  }

  // Amount — prefer values in typical PCN range (£20–£200)
  let bestAmount: number | null = null;
  for (const m of normalised.matchAll(AMOUNT_RE)) {
    const n = Number(m[1] ?? m[2]);
    if (!Number.isFinite(n)) continue;
    if (n >= 20 && n <= 500) {
      if (bestAmount == null || (n >= 40 && n <= 170)) bestAmount = n;
    }
  }
  if (bestAmount != null) {
    raw.charge_amount = bestAmount;
    confidence.charge_amount = 0.55;
  }

  // Dates → ISO
  const dates: string[] = [];
  for (const m of normalised.matchAll(DATE_RE)) {
    const iso = toIsoDate(m);
    if (iso) dates.push(iso);
  }
  if (dates[0]) {
    raw.parking_event_date = dates[0];
    confidence.parking_event_date = 0.5;
  }
  if (dates[1]) {
    raw.notice_issue_date = dates[1];
    confidence.notice_issue_date = 0.45;
  }

  // Times
  const times = [...normalised.matchAll(TIME_RE)].map(
    (m) => `${m[1].padStart(2, "0")}:${m[2]}`,
  );
  if (times[0]) {
    raw.entry_time = times[0];
    confidence.entry_time = 0.4;
  }
  if (times[1]) {
    raw.exit_time = times[1];
    confidence.exit_time = 0.4;
  }

  // Notice route
  raw.notice_route = inferNoticeRoute(upper);
  confidence.notice_route = raw.notice_route === "UNKNOWN" ? 0.2 : 0.6;

  // Location — line after "Location" / "Site"
  const loc =
    /(?:Location|Site|Car\s*park|Parking\s*at)\s*[:\-]\s*([^\n]{5,80})/i.exec(
      text,
    );
  if (loc?.[1]) {
    raw.parking_location = loc[1].trim().replace(/\s+/g, " ").slice(0, 120);
    confidence.parking_location = 0.5;
  }

  // Breach keywords
  const breachHints: Array<[RegExp, string]> = [
    [/overstay|maximum\s+stay|permitted\s+period/i, "Overstaying maximum permitted stay"],
    [/no\s+valid\s+ticket|failure\s+to\s+(?:pay|display)|unpaid/i, "Failure to make a valid payment"],
    [/permit|authoris/i, "No valid permit displayed"],
    [/incorrect(?:ly)?\s+(?:entered|keyed)|VRM/i, "Vehicle registration entered incorrectly"],
  ];
  for (const [re, label] of breachHints) {
    if (re.test(text)) {
      raw.alleged_breach = label;
      confidence.alleged_breach = 0.45;
      break;
    }
  }

  const inferredNation = resolveUkJurisdiction({
    parkingLocation: raw.parking_location,
    extraText: [raw.alleged_breach, raw.operator_name, text.slice(0, 800)],
  });
  if (inferredNation) {
    raw.uk_jurisdiction = inferredNation;
    confidence.uk_jurisdiction = 0.55;
  }

  const filled = Object.keys(raw).filter((k) => k !== "case_stage" && (raw as Record<string, unknown>)[k] != null).length;
  if (filled === 0) {
    warnings.push(
      "Backup OCR could not read this notice automatically. Please enter the details yourself.",
    );
  } else if (filled < 3) {
    warnings.push(
      "Backup OCR only found a few fields. Please check and complete the details.",
    );
  } else {
    warnings.push(
      "Details were filled by backup OCR because AI was unavailable. Please check carefully.",
    );
  }

  return { raw, confidence, warnings };
}

export function rulesExtractFromBytes(input: {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}): ExtractionResult {
  const text = extractPrintableText(input.bytes, input.mimeType);
  const parsed = parsePcnText(text);
  const isImage = /^image\//i.test(input.mimeType);
  if (isImage && Object.keys(parsed.confidence).length === 0) {
    parsed.warnings = [
      "AI was unavailable and image OCR needs a photo reader. Please type the notice details on the next screen.",
    ];
  }
  return {
    raw: parsed.raw,
    confidence: parsed.confidence,
    providerId: "rules-ocr",
    extractedAt: new Date().toISOString(),
    warnings: parsed.warnings,
  };
}

function inferNoticeRoute(upper: string): NoticeRoute {
  if (
    /NOTICE\s+TO\s+KEEPER|NTK|POSTAL|KEEPER\s+LIABILITY|SCHEDULE\s+4/.test(upper)
  ) {
    return "POSTAL";
  }
  if (/WINDSCREEN|AFFIXED\s+TO\s+THE\s+VEHICLE|ATTACHED\s+TO\s+THE\s+VEHICLE/.test(upper)) {
    return "WINDSCREEN";
  }
  return "UNKNOWN";
}

function toIsoDate(m: RegExpExecArray): string | null {
  if (m[4] && m[5] && m[6]) {
    return `${m[4]}-${m[5]}-${m[6]}`;
  }
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (!d || !mo || !y) return null;
  if (y < 100) y += 2000;
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 2000 || y > 2100) return null;
  // UK notices are almost always DD/MM/YYYY
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
