/**
 * The legal version register.
 *
 * Adding a new version is adding a module here and flipping the previous
 * one to SUPERSEDED with an `effectiveTo` date. Nothing deletes a
 * version: a consent record from 2026 must still be renderable in 2030,
 * which is only true while the module it names still resolves.
 *
 * `activeVersion` is deliberately strict. Two ACTIVE versions of one
 * document would mean two customers could be shown different wording and
 * both be recorded against "the current terms", so that is a startup
 * error rather than a silent pick-the-first.
 */
import type { LegalDocumentId, LegalDocumentVersion } from "./types";
import { TERMS_2026_09 } from "./terms/TERMS_2026_09";
import { PRIVACY_2026_09 } from "./privacy/PRIVACY_2026_09";

const VERSIONS: readonly LegalDocumentVersion[] = [
  TERMS_2026_09,
  PRIVACY_2026_09,
] as const;

/** Every known version of a document, newest effective date first. */
export function versionsFor(
  documentId: LegalDocumentId,
): LegalDocumentVersion[] {
  return VERSIONS.filter((v) => v.documentId === documentId).sort((a, b) =>
    b.effectiveFrom.localeCompare(a.effectiveFrom),
  );
}

/** Resolve one version by its stable identifier, e.g. `TERMS_2026_09`. */
export function findVersion(version: string): LegalDocumentVersion | null {
  return VERSIONS.find((v) => v.version === version) ?? null;
}

export function activeVersion(
  documentId: LegalDocumentId,
): LegalDocumentVersion {
  const active = VERSIONS.filter(
    (v) => v.documentId === documentId && v.status === "ACTIVE",
  );
  if (active.length !== 1) {
    throw new Error(
      `Expected exactly one ACTIVE ${documentId} version, found ${active.length}.`,
    );
  }
  return active[0]!;
}

/** The identifiers recorded against a purchase. */
export function currentLegalVersions(): {
  termsVersion: string;
  privacyVersion: string;
} {
  return {
    termsVersion: activeVersion("TERMS").version,
    privacyVersion: activeVersion("PRIVACY").version,
  };
}
