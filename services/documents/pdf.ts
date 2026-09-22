import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { AllAnswers, ConfirmedPcn, EvidenceItem } from "@/types";

/**
 * The only thing a renderer needs from an appeal.
 *
 * Kept structural rather than tied to `AssembledAppeal` so the same
 * renderer serves both the V1 assembler and a stored V2 draft — the
 * PDF is then guaranteed to contain the exact text that passed
 * validation.
 */
export interface RenderableAppeal {
  paragraphs: { id: string; text: string }[];
}

/** Brand colours — match landing / portal (navy + hot pink). */
const BRAND = {
  navy: rgb(0.059, 0.059, 0.102), // #0F0F1A
  pink: rgb(0.925, 0.082, 0.451), // #EC1573
  text: rgb(0.067, 0.094, 0.153), // #111827
  mute: rgb(0.42, 0.447, 0.502), // #6B7280
  line: rgb(0.898, 0.906, 0.922), // #E5E7EB
  white: rgb(1, 1, 1),
};

/**
 * Render the appeal as a professionally formatted PDF letter.
 * Uses only standard fonts (Helvetica) so pdf-lib does not need to embed
 * external font files. Includes brand header mark, accent bar, and a
 * unique case reference when provided.
 */
export async function renderAppealPdf(input: {
  pcn: ConfirmedPcn;
  answers?: AllAnswers;
  evidence: EvidenceItem[];
  appeal: RenderableAppeal;
  /** Case public id — printed as a unique letter reference. */
  caseReference?: string | null;
}): Promise<Uint8Array> {
  const { pcn, evidence, appeal } = input;
  const caseReference = input.caseReference?.trim() || null;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595.28; // A4
  const PAGE_H = 841.89;
  const MARGIN_X = 56;
  const MARGIN_TOP = 56;
  const MARGIN_BOTTOM = 64;
  const LINE_H = 14;
  const PARA_GAP = 8;
  const HEADER_H = 72;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN_TOP;

  const drawHeader = () => {
    // Full-bleed navy brand band
    page.drawRectangle({
      x: 0,
      y: PAGE_H - HEADER_H,
      width: PAGE_W,
      height: HEADER_H,
      color: BRAND.navy,
    });
    // Pink accent strip under the band
    page.drawRectangle({
      x: 0,
      y: PAGE_H - HEADER_H - 4,
      width: PAGE_W,
      height: 4,
      color: BRAND.pink,
    });

    // Logo mark (PA badge)
    const badgeX = MARGIN_X;
    const badgeY = PAGE_H - 52;
    const badgeSize = 28;
    page.drawRectangle({
      x: badgeX,
      y: badgeY,
      width: badgeSize,
      height: badgeSize,
      color: BRAND.white,
    });
    page.drawText("PA", {
      x: badgeX + 5,
      y: badgeY + 8,
      size: 12,
      font: bold,
      color: BRAND.pink,
    });

    page.drawText("Parking Appeals", {
      x: badgeX + badgeSize + 12,
      y: PAGE_H - 34,
      size: 14,
      font: bold,
      color: BRAND.white,
    });
    page.drawText("Group", {
      x: badgeX + badgeSize + 12 + bold.widthOfTextAtSize("Parking Appeals ", 14),
      y: PAGE_H - 34,
      size: 14,
      font: bold,
      color: BRAND.pink,
    });
    page.drawText("Formal appeal correspondence", {
      x: badgeX + badgeSize + 12,
      y: PAGE_H - 50,
      size: 8,
      font,
      color: rgb(0.75, 0.75, 0.8),
    });

    if (caseReference) {
      const label = `Ref: ${caseReference}`;
      const w = font.widthOfTextAtSize(label, 8);
      page.drawText(label, {
        x: PAGE_W - MARGIN_X - w,
        y: PAGE_H - 40,
        size: 8,
        font,
        color: rgb(0.85, 0.85, 0.9),
      });
    }

    y = PAGE_H - HEADER_H - 28;
  };

  const drawFooter = (pageIndex: number) => {
    page.drawRectangle({
      x: MARGIN_X,
      y: MARGIN_BOTTOM - 12,
      width: PAGE_W - MARGIN_X * 2,
      height: 0.5,
      color: BRAND.line,
    });
    page.drawText(
      "Prepared without admission that the identity of the driver is known.",
      {
        x: MARGIN_X,
        y: MARGIN_BOTTOM - 28,
        size: 7.5,
        font,
        color: BRAND.mute,
      },
    );
    const pageLabel = `Page ${pageIndex}`;
    const pw = font.widthOfTextAtSize(pageLabel, 8);
    page.drawText(pageLabel, {
      x: PAGE_W - MARGIN_X - pw,
      y: MARGIN_BOTTOM - 28,
      size: 8,
      font,
      color: BRAND.mute,
    });
    page.drawText("parkingappeals.group", {
      x: MARGIN_X,
      y: MARGIN_BOTTOM - 40,
      size: 7.5,
      font,
      color: BRAND.pink,
    });
  };

  let pageIndex = 1;
  drawHeader();

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN_BOTTOM) {
      drawFooter(pageIndex);
      page = doc.addPage([PAGE_W, PAGE_H]);
      pageIndex += 1;
      drawHeader();
    }
  };

  const drawText = (
    text: string,
    opts: { font?: typeof font; size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const f = opts.bold ? bold : (opts.font ?? font);
    const size = opts.size ?? 10.5;
    const color = opts.color ?? BRAND.text;
    const maxWidth = PAGE_W - MARGIN_X * 2;
    const lines = wrapText(text, f, size, maxWidth);
    for (const ln of lines) {
      ensureSpace(LINE_H);
      page.drawText(ln, { x: MARGIN_X, y, size, font: f, color });
      y -= LINE_H;
    }
  };

  // Unique letter meta
  const issued = new Date().toISOString().slice(0, 10);
  drawText("Appeal letter", { bold: true, size: 12 });
  y -= 2;
  if (caseReference) {
    drawText(`Our reference: ${caseReference}`, { size: 9.5, color: BRAND.mute });
  }
  drawText(`Date: ${issued}`, { size: 9.5, color: BRAND.mute });
  y -= PARA_GAP;

  // Reference block in a light panel look (top rule)
  page.drawRectangle({
    x: MARGIN_X,
    y: y + 4,
    width: PAGE_W - MARGIN_X * 2,
    height: 1,
    color: BRAND.pink,
  });
  y -= 10;

  drawText("Notice details", { bold: true, size: 11, color: BRAND.navy });
  y -= 2;
  drawText(`Operator: ${pcn.operator_name ?? "—"}`);
  drawText(`PCN number: ${pcn.pcn_number ?? "—"}`);
  drawText(`Vehicle registration: ${pcn.vrm ?? "—"}`);
  drawText(`Parking location: ${pcn.parking_location ?? "—"}`);
  drawText(`Parking event date: ${pcn.parking_event_date ?? "—"}`);
  if (pcn.notice_issue_date) drawText(`Notice issue date: ${pcn.notice_issue_date}`);
  y -= PARA_GAP;

  drawText("Dear Sir or Madam,");
  y -= PARA_GAP;

  drawText("Formal Appeal", { bold: true, size: 11, color: BRAND.navy });
  y -= 2;

  for (const p of appeal.paragraphs) {
    drawText(p.text);
    y -= PARA_GAP;
  }

  if (evidence.length > 0) {
    drawText("Enclosed evidence", { bold: true, size: 11, color: BRAND.navy });
    y -= 2;
    for (const e of evidence) {
      drawText(`• ${formatEvidenceLine(e)}`);
    }
    y -= PARA_GAP;
  }

  // Keep the closing block together so we never orphan "The registered
  // keeper" alone on a second page when page 1 still has room.
  const signOff = "The registered keeper";
  const closingNeeded = LINE_H * 2 + PARA_GAP;
  ensureSpace(closingNeeded);
  page.drawText("Yours faithfully,", {
    x: MARGIN_X,
    y,
    size: 10.5,
    font,
    color: BRAND.text,
  });
  y -= LINE_H;
  page.drawText(signOff, {
    x: MARGIN_X,
    y,
    size: 10.5,
    font: bold,
    color: BRAND.text,
  });
  y -= LINE_H;

  drawFooter(pageIndex);

  return await doc.save();
}

function formatEvidenceLine(e: EvidenceItem): string {
  const label = e.description ? `${e.type} — ${e.description}` : e.type;
  return `${label} (${e.fileName})`;
}

/**
 * Very small text wrapper for pdf-lib. Splits on whitespace and hard-wraps
 * long tokens. Adequate for standard A4 letters.
 */
function wrapText(
  text: string,
  font: import("pdf-lib").PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const out: string[] = [];
  const paragraphs = text.split(/\n/);
  for (const para of paragraphs) {
    if (para.trim() === "") {
      out.push("");
      continue;
    }
    const words = para.split(/\s+/);
    let line = "";
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth) {
        if (line) out.push(line);
        if (font.widthOfTextAtSize(w, size) > maxWidth) {
          let chunk = "";
          for (const ch of w) {
            if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
              out.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          line = chunk;
        } else {
          line = w;
        }
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
  }
  return out;
}
