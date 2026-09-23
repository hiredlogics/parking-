/**
 * @vitest-environment node
 *
 * Reading uploaded documents, and refusing to trust what comes back.
 *
 * The provider is an AI call, so nothing it returns may be
 * self-certifying. These tests pin the four structural checks in
 * lib/facts/fromDocuments.ts — scope, vocabulary, shape and deference to
 * established facts — and prove the checks hold when the provider is
 * wrong, not only when it behaves.
 */
import { describe, expect, it } from "vitest";
import { admitDocumentFacts } from "@/lib/facts/fromDocuments";
import { FACT } from "@/lib/facts/facts";
import { factRegistryValues } from "@/lib/facts/registry";
import {
  factsInScope,
  schemaForEvidenceType,
} from "@/services/evidence/scope";
import { MockEvidenceUnderstandingProvider } from "@/services/evidence/mockProvider";
import { getEvidenceUnderstandingProvider } from "@/services/evidence";

const candidate = (factKey: string, value: unknown, basis = "because") => ({
  factKey,
  value: value as never,
  basis,
  confidence: 0.9,
});

describe("the schema handed to the model comes from the fact registry", () => {
  it("constrains an enumerated fact to exactly the registered vocabulary", () => {
    const spec = schemaForEvidenceType("authorisation_evidence")!;
    const props = (spec.schema as { properties: Record<string, never> })
      .properties;
    const facts = (props.facts as { properties: Record<string, never> })
      .properties;
    const occupier = facts[FACT.OCCUPIER_STATUS] as unknown as {
      enum: unknown[];
    };
    const registered = factRegistryValues(FACT.OCCUPIER_STATUS)!;
    // The model's options are the registry's values, plus null.
    expect(occupier.enum).toEqual([...registered, null]);
  });

  it("asks for an array for a multi-value fact", () => {
    const spec = schemaForEvidenceType("signage_photo")!;
    const props = (spec.schema as { properties: Record<string, never> })
      .properties;
    const facts = (props.facts as { properties: Record<string, never> })
      .properties;
    const basis = facts[FACT.SIGNAGE_ISSUE_BASIS] as unknown as {
      type: string[];
      items: { enum: string[] };
    };
    expect(basis.type).toContain("array");
    expect(basis.items.enum).toEqual(factRegistryValues(FACT.SIGNAGE_ISSUE_BASIS));
  });

  it("has no schema at all for an uncategorised upload", () => {
    expect(factsInScope("other")).toEqual([]);
    expect(schemaForEvidenceType("other")).toBeNull();
  });
});

describe("admission refuses what the document category cannot show", () => {
  it("admits a fact inside the document's scope", () => {
    const out = admitDocumentFacts({
      candidates: [
        {
          evidenceType: "authorisation_evidence",
          facts: [candidate(FACT.OCCUPIER_STATUS, "tenant")],
        },
      ],
      alreadyEstablished: {},
    });
    expect(out.answers[FACT.OCCUPIER_STATUS]).toBe("tenant");
    expect(out.provenance[FACT.OCCUPIER_STATUS]).toBe("document");
  });

  it("refuses a fact the document category has no business establishing", () => {
    const out = admitDocumentFacts({
      candidates: [
        {
          evidenceType: "payment_receipt",
          facts: [candidate(FACT.OCCUPIER_STATUS, "tenant")],
        },
      ],
      alreadyEstablished: {},
    });
    expect(out.answers[FACT.OCCUPIER_STATUS]).toBeUndefined();
    expect(out.rejected[0].reason).toMatch(/cannot establish/);
  });

  it("refuses a value outside the registered vocabulary rather than repairing it", () => {
    const out = admitDocumentFacts({
      candidates: [
        {
          evidenceType: "authorisation_evidence",
          // Plausible, and not a registered value.
          facts: [candidate(FACT.OCCUPIER_STATUS, "shared_ownership_leaseholder")],
        },
      ],
      alreadyEstablished: {},
    });
    expect(out.answers[FACT.OCCUPIER_STATUS]).toBeUndefined();
    expect(out.rejected[0].reason).toMatch(/outside the registered vocabulary/);
  });

  it("refuses a value of the wrong shape", () => {
    const out = admitDocumentFacts({
      candidates: [
        {
          evidenceType: "anpr_evidence",
          // A count must be a number, not a numeral in a string.
          facts: [candidate(FACT.VISIT_COUNT, "2")],
        },
        {
          evidenceType: "signage_photo",
          // A multi-value fact must arrive as an array.
          facts: [candidate(FACT.SIGNAGE_ISSUE_BASIS, "charge_not_prominent")],
        },
      ],
      alreadyEstablished: {},
    });
    expect(out.answers[FACT.VISIT_COUNT]).toBeUndefined();
    expect(out.answers[FACT.SIGNAGE_ISSUE_BASIS]).toBeUndefined();
    expect(out.rejected).toHaveLength(2);
  });

  it("never overwrites what the notice or the customer established", () => {
    const out = admitDocumentFacts({
      candidates: [
        {
          evidenceType: "payment_receipt",
          facts: [candidate(FACT.PAYMENT_MADE, "YES")],
        },
      ],
      alreadyEstablished: { [FACT.PAYMENT_MADE]: "NO" },
    });
    expect(out.answers[FACT.PAYMENT_MADE]).toBeUndefined();
    expect(out.rejected[0].reason).toMatch(/Already established/);
  });

  it("does not let upload order decide between two documents that disagree", () => {
    const out = admitDocumentFacts({
      candidates: [
        {
          evidenceType: "authorisation_evidence",
          facts: [candidate(FACT.OCCUPIER_STATUS, "tenant")],
        },
        {
          evidenceType: "authorisation_evidence",
          facts: [candidate(FACT.OCCUPIER_STATUS, "leaseholder")],
        },
      ],
      alreadyEstablished: {},
    });
    expect(out.answers[FACT.OCCUPIER_STATUS]).toBe("tenant");
    expect(out.rejected[0].reason).toMatch(/Another document already/);
  });

  it("records a basis for everything it admits", () => {
    const out = admitDocumentFacts({
      candidates: [
        {
          evidenceType: "authorisation_evidence",
          facts: [
            candidate(FACT.OCCUPIER_STATUS, "tenant", "Clause 1 names the tenant."),
          ],
        },
      ],
      alreadyEstablished: {},
    });
    expect(out.admitted).toEqual([
      {
        factKey: FACT.OCCUPIER_STATUS,
        value: "tenant",
        basis: "Clause 1 names the tenant.",
      },
    ]);
  });
});

describe("tags follow from read facts, never from the upload alone", () => {
  it("a read permit supports the authorisation tag an unread upload could not", () => {
    const out = admitDocumentFacts({
      candidates: [
        {
          evidenceType: "permit",
          facts: [candidate(FACT.PERMISSION_HELD, "YES")],
        },
      ],
      alreadyEstablished: {},
    });
    expect(out.tags).toContain("authorised_or_permit");
  });

  it("a rejected fact grounds no tag", () => {
    const out = admitDocumentFacts({
      candidates: [
        {
          // Out of scope: a receipt cannot establish permission.
          evidenceType: "payment_receipt",
          facts: [candidate(FACT.PERMISSION_HELD, "YES")],
        },
      ],
      alreadyEstablished: {},
    });
    expect(out.answers[FACT.PERMISSION_HELD]).toBeUndefined();
    expect(out.tags).not.toContain("authorised_or_permit");
  });

  it("derives residence from occupancy the agreement states", () => {
    const out = admitDocumentFacts({
      candidates: [
        {
          evidenceType: "authorisation_evidence",
          facts: [candidate(FACT.OCCUPIER_STATUS, "tenant")],
        },
      ],
      alreadyEstablished: {},
    });
    expect(out.tags).toContain("resident_parking_rights");
  });

  it("does not derive residence from a visitor", () => {
    const out = admitDocumentFacts({
      candidates: [
        {
          evidenceType: "authorisation_evidence",
          facts: [candidate(FACT.OCCUPIER_STATUS, "visitor")],
        },
      ],
      alreadyEstablished: {},
    });
    expect(out.tags).not.toContain("resident_parking_rights");
  });
});

describe("the mock provider stays inside its own scope", () => {
  it("returns only facts the evidence category may establish", async () => {
    const provider = new MockEvidenceUnderstandingProvider();
    for (const evidenceType of Object.keys({
      payment_receipt: 1,
      app_screenshot: 1,
      permit: 1,
      authorisation_evidence: 1,
      signage_photo: 1,
      anpr_evidence: 1,
      breakdown_evidence: 1,
      location_evidence: 1,
      other: 1,
    })) {
      const reading = await provider.derive({
        name: "f.pdf",
        mimeType: "application/pdf",
        bytes: new Uint8Array(),
        evidenceType,
      });
      const scope = new Set(factsInScope(evidenceType));
      for (const f of reading.facts) {
        expect(scope.has(f.factKey), `${evidenceType} → ${f.factKey}`).toBe(true);
      }
    }
  });

  it("returns readings that survive admission unchanged", async () => {
    const provider = new MockEvidenceUnderstandingProvider();
    const reading = await provider.derive({
      name: "tenancy.pdf",
      mimeType: "application/pdf",
      bytes: new Uint8Array(),
      evidenceType: "authorisation_evidence",
    });
    const out = admitDocumentFacts({
      candidates: [
        { evidenceType: "authorisation_evidence", facts: reading.facts },
      ],
      alreadyEstablished: {},
    });
    expect(out.rejected).toEqual([]);
    expect(out.admitted.length).toBe(reading.facts.length);
  });

  it("the suite is pinned to the mock provider", () => {
    expect(getEvidenceUnderstandingProvider()?.id).toBe("mock-evidence-v1");
  });
});

describe("every essential-evidence requirement is reachable from a real upload", () => {
  /*
   * The bug this guards: EVIDENCE_ESSENTIAL names the evidence a module
   * needs in the KB's vocabulary ("lease", "recovery_report"), and the
   * retrieval filter compared it against the nine tiles a customer can
   * upload under. The two sets had nothing in common, so every module
   * with an essential-evidence requirement was unreachable in
   * production — the whole residential route among them. The UAT
   * fixtures hid it by setting evidenceTypes to values the upload path
   * rejects.
   */
  it("no module is gated behind evidence a customer cannot supply", async () => {
    const { EVIDENCE_ESSENTIAL } = await import("@/lib/retrieval/engine");
    const { ALLOWED_EVIDENCE_TYPES } = await import("@/lib/cases/evidence");
    const { expandEvidenceKinds } = await import("@/types/evidence");

    const reachable = new Set(
      expandEvidenceKinds([...ALLOWED_EVIDENCE_TYPES] as string[]),
    );
    const unreachable: string[] = [];
    for (const [moduleId, kinds] of Object.entries(EVIDENCE_ESSENTIAL)) {
      if (!kinds.some((k) => reachable.has(k))) unreachable.push(moduleId);
    }
    expect(unreachable).toEqual([]);
  });

  it("the upload vocabulary and the fixture vocabulary agree", async () => {
    const { ALLOWED_EVIDENCE_TYPES } = await import("@/lib/cases/evidence");
    const { UAT_FIXTURES } = await import("../fixtures/uatCases");
    const used = new Set(UAT_FIXTURES.flatMap((f) => f.evidenceTypes));
    const { expandEvidenceKinds } = await import("@/types/evidence");
    const reachable = new Set(
      expandEvidenceKinds([...ALLOWED_EVIDENCE_TYPES] as string[]),
    );
    // A fixture may use a KB evidence kind, but it must be one a real
    // upload can actually produce.
    for (const t of used) {
      expect(reachable.has(t), `fixture evidence type "${t}"`).toBe(true);
    }
  });
});

describe("end to end: reading a document changes which grounds are retrieved", () => {
  const notice = {
    operator_name: "Test Parking Ltd",
    pcn_number: "PCN654321",
    vrm: "AB12 CDE",
    parking_location: "Riverside Court, Leeds, LS1 1AA",
    parking_event_date: "2026-05-01",
    notice_issue_date: "2026-05-08",
    notice_route: "POSTAL",
    charge_amount: 100,
    alleged_breach: "Parked without displaying a valid permit",
    case_stage: "INITIAL_OPERATOR_APPEAL",
  } as never;

  async function retrieveWith(answers: Record<string, unknown>) {
    const { analyseCase, factsForCase } = await import("@/lib/analysis/engine");
    const { retrieveKnowledge } = await import("@/lib/retrieval/engine");
    const evidenceTypes = ["authorisation_evidence"];
    const input = {
      confirmed: notice,
      answers: answers as never,
      evidenceTypes,
      answerProvenance: Object.fromEntries(
        Object.keys(answers).map((k) => [k, "document" as const]),
      ),
    };
    const analysis = analyseCase(input);
    const facts = factsForCase(input);
    return {
      analysis,
      facts,
      moduleIds: retrieveKnowledge({
        analysis,
        facts,
        parkingEventDate: "2026-05-01",
        evidenceTypes,
      }).modules.map((m) => m.moduleId),
    };
  }

  it("a read tenancy agreement opens residential grounds an unread upload did not", async () => {
    const provider = new MockEvidenceUnderstandingProvider();
    const reading = await provider.derive({
      name: "tenancy.pdf",
      mimeType: "application/pdf",
      bytes: new Uint8Array(),
      evidenceType: "authorisation_evidence",
    });
    const admitted = admitDocumentFacts({
      candidates: [
        { evidenceType: "authorisation_evidence", facts: reading.facts },
      ],
      alreadyEstablished: {},
    });

    // Upload alone: the agreement is on the case but nobody has read it.
    const unread = await retrieveWith({});
    // Read: occupancy and the allocated bay are established by the document.
    const read = await retrieveWith({
      ...admitted.answers,
      scenarios: admitted.tags,
    });

    expect(read.facts.provenance["occupier_status"]).toBe("document");
    expect(read.moduleIds.length).toBeGreaterThan(unread.moduleIds.length);
    expect(read.moduleIds.some((m) => m.startsWith("KB-RES-"))).toBe(true);
    expect(unread.moduleIds.some((m) => m.startsWith("KB-RES-"))).toBe(false);
  });
});
