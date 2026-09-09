import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } from "docx";
import type { AllAnswers, ConfirmedPcn, EvidenceItem } from "@/types";
import type { RenderableAppeal } from "./pdf";

export async function renderAppealDocx(input: {
  pcn: ConfirmedPcn;
  answers?: AllAnswers;
  evidence: EvidenceItem[];
  appeal: RenderableAppeal;
}): Promise<Uint8Array> {
  const { pcn, evidence, appeal } = input;

  const header = new Paragraph({
    alignment: AlignmentType.LEFT,
    children: [
      new TextRun({ text: "Parking Appeals Group", bold: true, size: 32 }),
    ],
    spacing: { after: 100 },
    border: {
      bottom: { color: "C33BFF", style: BorderStyle.SINGLE, size: 12, space: 4 },
    },
  });

  const subHeader = new Paragraph({
    children: [
      new TextRun({ text: "Appeal correspondence", italics: true, size: 20, color: "666666" }),
    ],
    spacing: { after: 320 },
  });

  const refBlock: Paragraph[] = [
    new Paragraph({ text: "Reference", heading: HeadingLevel.HEADING_2 }),
    line(`Operator: ${pcn.operator_name ?? "—"}`),
    line(`PCN number: ${pcn.pcn_number ?? "—"}`),
    line(`Vehicle registration: ${pcn.vrm ?? "—"}`),
    line(`Parking location: ${pcn.parking_location ?? "—"}`),
    line(`Parking event date: ${pcn.parking_event_date ?? "—"}`),
    ...(pcn.notice_issue_date ? [line(`Notice issue date: ${pcn.notice_issue_date}`)] : []),
    new Paragraph({ text: "" }),
    line("Dear Sir or Madam,"),
    new Paragraph({ text: "" }),
    new Paragraph({ text: "Formal Appeal", heading: HeadingLevel.HEADING_2 }),
  ];

  const bodyBlock: Paragraph[] = appeal.paragraphs.map((p) =>
    new Paragraph({
      children: [new TextRun({ text: p.text, size: 22 })],
      spacing: { after: 200 },
    }),
  );

  const evidenceBlock: Paragraph[] =
    evidence.length > 0
      ? [
          new Paragraph({ text: "Enclosed evidence", heading: HeadingLevel.HEADING_2 }),
          ...evidence.map(
            (e) => new Paragraph({ text: `• ${formatEvidenceLine(e)}`, spacing: { after: 80 } }),
          ),
        ]
      : [];

  const signBlock: Paragraph[] = [
    new Paragraph({ text: "" }),
    line("Yours faithfully,"),
    line("The registered keeper"),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Prepared without admission that the identity of the driver is known.",
          italics: true,
          size: 16,
          color: "888888",
        }),
      ],
    }),
  ];

  const doc = new Document({
    creator: "Parking Appeals Group",
    title: `Appeal ${pcn.pcn_number ?? ""}`.trim(),
    styles: {
      default: {
        document: { run: { size: 22, font: "Calibri" } },
      },
    },
    sections: [
      {
        properties: {},
        children: [
          header,
          subHeader,
          ...refBlock,
          ...bodyBlock,
          ...evidenceBlock,
          ...signBlock,
        ],
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  return new Uint8Array(buf);
}

function line(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun({ text, size: 22 })], spacing: { after: 80 } });
}

function formatEvidenceLine(e: EvidenceItem): string {
  const label = e.description ? `${e.type} — ${e.description}` : e.type;
  return `${label} (${e.fileName})`;
}
