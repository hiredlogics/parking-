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

/**
 * Render the appeal as a professionally formatted PDF letter.
 * Uses only standard fonts (Helvetica) so pdf-lib does not need to embed
 * external font files.
 */
export async function renderAppealPdf(input: {
  pcn: ConfirmedPcn;
  answers?: AllAnswers;
  evidence: EvidenceItem[];
  appeal: RenderableAppeal;
}): Promise<Uint8Array> {
  const { pcn, evidence, appeal } = input;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595.28; // A4
  const PAGE_H = 841.89;
  const MARGIN_X = 56;
  const MARGIN_TOP = 56;
  const MARGIN_BOTTOM = 56;
  const LINE_H = 14;
  const PARA_GAP = 8;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN_TOP;

  const drawHeader = () => {
    // Brand strip
    page.drawRectangle({
      x: 0, y: PAGE_H - 8, width: PAGE_W, height: 8,
      color: rgb(0.78, 0.23, 0.9),
    });
    page.drawText("Parking Appeals Group", {
      x: MARGIN_X, y: PAGE_H - 34, size: 16, font: bold, color: rgb(0.08, 0.08, 0.12),
    });
    page.drawText("Appeal correspondence", {
      x: MARGIN_X, y: PAGE_H - 50, size: 9, font, color: rgb(0.4, 0.4, 0.5),
    });
    y = PAGE_H - 78;
  };

  const drawFooter = (pageIndex: number) => {
    page.drawText(`Page ${pageIndex}`, {
      x: PAGE_W - MARGIN_X - 40, y: MARGIN_BOTTOM - 24, size: 8, font, color: rgb(0.5, 0.5, 0.5),
    });
    page.drawText("Prepared without admission that the identity of the driver is known.", {
      x: MARGIN_X, y: MARGIN_BOTTOM - 24, size: 8, font, color: rgb(0.5, 0.5, 0.5),
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

  const drawText = (text: string, opts: { font?: typeof font; size?: number; bold?: boolean } = {}) => {
    const f = opts.bold ? bold : (opts.font ?? font);
    const size = opts.size ?? 10.5;
    const maxWidth = PAGE_W - MARGIN_X * 2;
    const lines = wrapText(text, f, size, maxWidth);
    for (const ln of lines) {
      ensureSpace(LINE_H);
      page.drawText(ln, { x: MARGIN_X, y, size, font: f, color: rgb(0.08, 0.08, 0.12) });
      y -= LINE_H;
    }
  };

  // Reference block
  drawText("Reference", { bold: true, size: 11 });
  y -= 2;
  drawText(`Operator: ${pcn.operator_name ?? "—"}`);
  drawText(`PCN number: ${pcn.pcn_number ?? "—"}`);
  drawText(`Vehicle registration: ${pcn.vrm ?? "—"}`);
  drawText(`Parking location: ${pcn.parking_location ?? "—"}`);
  drawText(`Parking event date: ${pcn.parking_event_date ?? "—"}`);
  if (pcn.notice_issue_date) drawText(`Notice issue date: ${pcn.notice_issue_date}`);
  y -= PARA_GAP;

  drawText("Dear Sir or Madam,", { bold: false });
  y -= PARA_GAP;

  drawText("Formal Appeal", { bold: true, size: 11 });
  y -= 2;

  for (const p of appeal.paragraphs) {
    drawText(p.text);
    y -= PARA_GAP;
  }

  if (evidence.length > 0) {
    drawText("Enclosed evidence", { bold: true, size: 11 });
    y -= 2;
    for (const e of evidence) {
      drawText(`• ${formatEvidenceLine(e)}`);
    }
    y -= PARA_GAP;
  }

  drawText("Yours faithfully,");
  y -= LINE_H;
  drawText("The registered keeper");

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
        // Handle a single very long word.
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
