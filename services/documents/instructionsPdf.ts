import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Customer-facing submission instructions PDF.
 *
 * Generic guidance only — no invented operator-specific addresses or
 * portals unless later supplied by admin configuration.
 */
export async function renderInstructionsPdf(input: {
  caseReference: string;
  operatorName?: string | null;
  pcnNumber?: string | null;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN_X = 56;
  const navy = rgb(0.059, 0.059, 0.102);
  const pink = rgb(0.925, 0.082, 0.451);
  const text = rgb(0.067, 0.094, 0.153);
  const mute = rgb(0.42, 0.447, 0.502);

  const page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - 56;

  page.drawRectangle({
    x: 0,
    y: PAGE_H - 64,
    width: PAGE_W,
    height: 64,
    color: navy,
  });
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 68,
    width: PAGE_W,
    height: 4,
    color: pink,
  });
  page.drawText("Parking Appeals Group", {
    x: MARGIN_X,
    y: PAGE_H - 36,
    size: 14,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText("How to submit your appeal", {
    x: MARGIN_X,
    y: PAGE_H - 52,
    size: 9,
    font,
    color: rgb(0.8, 0.8, 0.85),
  });
  y = PAGE_H - 96;

  const draw = (line: string, opts: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> } = {}) => {
    const f = opts.bold ? bold : font;
    const size = opts.size ?? 10.5;
    const color = opts.color ?? text;
    const max = PAGE_W - MARGIN_X * 2;
    const words = line.split(/\s+/);
    let cur = "";
    for (const w of words) {
      const cand = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(cand, size) > max) {
        if (cur) {
          page.drawText(cur, { x: MARGIN_X, y, size, font: f, color });
          y -= 14;
        }
        cur = w;
      } else {
        cur = cand;
      }
    }
    if (cur) {
      page.drawText(cur, { x: MARGIN_X, y, size, font: f, color });
      y -= 14;
    }
  };

  const gap = () => {
    y -= 8;
  };

  draw("Submission instructions", { bold: true, size: 13, color: navy });
  gap();
  draw(`Your reference: ${input.caseReference}`, { size: 9.5, color: mute });
  if (input.pcnNumber) draw(`PCN / notice number: ${input.pcnNumber}`, { size: 9.5, color: mute });
  if (input.operatorName) draw(`Operator: ${input.operatorName}`, { size: 9.5, color: mute });
  gap();

  draw("1. What this pack contains", { bold: true, size: 11, color: navy });
  draw("• Final Appeal — the letter prepared for you to send to the parking company.");
  draw("• These instructions — practical steps for submitting your appeal.");
  gap();

  draw("2. How to submit", { bold: true, size: 11, color: navy });
  draw(
    "Follow the appeal instructions on your parking notice (or any letter from the operator). That usually means an online portal, an email address, or a postal address printed on the notice.",
  );
  draw(
    "We do not invent operator-specific portals or addresses. Use only the contact details shown on your notice or correspondence.",
  );
  gap();

  draw("3. What to include", { bold: true, size: 11, color: navy });
  draw("• Your Final Appeal letter (PDF).");
  draw("• Copies of any evidence you uploaded (payment screenshots, photos, permits, etc.).");
  draw("• Your PCN / notice number and vehicle registration, if the form asks for them.");
  gap();

  draw("4. Keep proof", { bold: true, size: 11, color: navy });
  draw(
    "Save a copy of everything you send, and keep any confirmation the operator provides (email receipt, portal reference, or postal proof of posting).",
  );
  gap();

  draw("5. After you submit", { bold: true, size: 11, color: navy });
  draw(
    "Operators usually reply within their stated timescale. You can track this case in your Parking Appeals Group portal and record the outcome when you hear back.",
  );
  gap();

  draw(
    "If you are unsure how to send the appeal, check the notice again or contact the operator using the details printed there.",
    { size: 9.5, color: mute },
  );

  return doc.save();
}
