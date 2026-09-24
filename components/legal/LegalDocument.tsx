import type {
  LegalBlock,
  LegalDocumentVersion,
} from "@/lib/legal/types";

/**
 * Renders a versioned legal document.
 *
 * Wording is printed exactly as stored — this component only supplies
 * structure and typography. Nothing here reflows, abbreviates or
 * reformats the text of a section.
 */
export function LegalDocument({ doc }: { doc: LegalDocumentVersion }) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="border-b border-brand-borderSoft pb-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-brand-pink">
          Parking Appeals Group
        </p>
        <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight text-brand-text sm:text-[34px]">
          {doc.title}
        </h1>
        <p className="mt-2 text-[14px] text-brand-mute">
          The Parking Appeals Group Limited
        </p>
        <p className="mt-1 text-[13.5px] text-brand-mute">
          Last updated: {doc.lastUpdatedLabel}
        </p>
      </header>

      {doc.preamble.length > 0 && (
        <div className="mt-6 space-y-4">
          {doc.preamble.map((block, i) => (
            <Block key={i} block={block} />
          ))}
        </div>
      )}

      <div className="mt-10 space-y-10">
        {doc.sections.map((section) => (
          <section
            key={section.number}
            id={`section-${section.number}`}
            aria-labelledby={`heading-${section.number}`}
            className="scroll-mt-24"
          >
            <h2
              id={`heading-${section.number}`}
              className="text-[16px] font-bold uppercase tracking-wide text-brand-text sm:text-[17px]"
            >
              <span className="text-brand-pink">{section.number}.</span>{" "}
              {section.heading}
            </h2>
            <div className="mt-3 space-y-4">
              {section.blocks.map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="mt-14 border-t border-brand-borderSoft pt-5 text-[12.5px] text-brand-mute">
        <p>The Parking Appeals Group Limited | parkingappealsgroup.co.uk</p>
        <p className="mt-1">Document version: {doc.version}</p>
      </footer>
    </article>
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (block.kind === "p") {
    return (
      <p className="text-[15px] leading-[1.75] text-brand-text/90">
        {block.text}
      </p>
    );
  }

  if (block.kind === "lines") {
    return (
      <div className="text-[15px] leading-[1.75] text-brand-text/90">
        {block.label && (
          <p className="font-semibold text-brand-text">{block.label}</p>
        )}
        {block.lines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {block.items.map((item, i) => (
        <li
          key={i}
          className="rounded-xl bg-brand-canvas px-4 py-3 text-[15px] leading-[1.7]"
        >
          <span className="font-semibold text-brand-text">{item.title}</span>
          {item.detail && (
            <span className="mt-0.5 block text-brand-mute">{item.detail}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
