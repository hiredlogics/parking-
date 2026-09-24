/**
 * Versioned legal documents.
 *
 * Terms and the Privacy Policy are content, not code, but they are also
 * evidence: a purchase records the exact version the customer accepted,
 * so a later edit must never be able to change what a past customer is
 * recorded as having agreed to. Every version is therefore its own
 * immutable module, and activation is a status flag rather than an edit.
 */

export type LegalDocumentId = "TERMS" | "PRIVACY";

/**
 * ACTIVE      the version served to customers and recorded at purchase.
 *             Exactly one per document.
 * SUPERSEDED  replaced by a newer version, kept so historical consent
 *             records can still be rendered.
 * DRAFT       prepared but not yet in force; never served, never recorded.
 */
export type LegalVersionStatus = "ACTIVE" | "SUPERSEDED" | "DRAFT";

export type LegalBlock =
  /** A paragraph of legal wording, reproduced verbatim. */
  | { kind: "p"; text: string }
  /** An address or contact block, where line breaks are meaningful. */
  | { kind: "lines"; label?: string; lines: string[] }
  /** A priced product list. */
  | { kind: "products"; items: { title: string; detail?: string }[] };

export interface LegalSection {
  /** 1–29. Rendered as the visible heading number. */
  number: number;
  heading: string;
  blocks: LegalBlock[];
}

export interface LegalDocumentVersion {
  documentId: LegalDocumentId;
  /** Stable identifier stored on every consent record, e.g. TERMS_2026_09. */
  version: string;
  status: LegalVersionStatus;
  /** ISO date this version came into force. */
  effectiveFrom: string;
  /** ISO date it stopped being served, or null while active. */
  effectiveTo: string | null;
  title: string;
  /** Shown to the customer, e.g. "September 2026". */
  lastUpdatedLabel: string;
  /** Unnumbered wording above section 1. */
  preamble: LegalBlock[];
  sections: LegalSection[];
}
