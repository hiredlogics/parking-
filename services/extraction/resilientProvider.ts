import type { ExtractionResult } from "@/types";
import type { DocumentExtractionProvider } from "./types";
import { rulesExtractFromBytes, sha256Hex } from "./rulesOcr";
import { cacheDel, cacheGetJson, cacheSetJson } from "@/lib/cache/store";

/**
 * AI-first extraction with:
 *   1. Redis/memory cache — ONLY successful AI results (never sticky fallback)
 *   2. Hard timeout on the AI call
 *   3. Rules/OCR fallback when AI is down (unless EXTRACTION_DISABLE_FALLBACK=1)
 *
 * Important: Redis here is a speed cache for notice reading. It is NOT the
 * case rules / question engine. Those live separately in Postgres + Redis config cache.
 */
export class ResilientExtractionProvider implements DocumentExtractionProvider {
  readonly id: string;
  readonly displayName: string;

  constructor(
    private readonly primary: DocumentExtractionProvider,
    private readonly opts: {
      aiTimeoutMs: number;
      cacheTtlSeconds: number;
      rulesOnly?: boolean;
      /** When true, surface AI errors instead of rules OCR. */
      disableFallback?: boolean;
    },
  ) {
    this.id = `resilient:${primary.id}`;
    this.displayName = `${primary.displayName} + rules fallback`;
  }

  async extract(file: {
    name: string;
    mimeType: string;
    bytes: Uint8Array | ArrayBuffer;
    hint?: string;
    caseId?: string | null;
  }): Promise<ExtractionResult> {
    const bytes =
      file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    const hash = sha256Hex(bytes);
    const cacheKey = `extract:v1:${hash}`;

    const cached = await cacheGetJson<ExtractionResult>(cacheKey);
    // Only reuse a previous *AI* success — never replay rules-ocr fallback.
    if (cached?.raw && isAiSuccess(cached)) {
      return {
        ...cached,
        extractedAt: new Date().toISOString(),
        warnings: [],
        providerId: cached.providerId ?? this.id,
      };
    }
    if (cached && !isAiSuccess(cached)) {
      // Stale fallback from an earlier AI outage — drop it and try AI again.
      await cacheDel(cacheKey);
    }

    if (this.opts.rulesOnly) {
      return rulesExtractFromBytes({
        name: file.name,
        mimeType: file.mimeType,
        bytes,
      });
    }

    try {
      const aiResult = await withTimeout(
        this.primary.extract({ ...file, bytes }),
        this.opts.aiTimeoutMs,
        "AI extraction timed out",
      );
      if (hasUsefulFields(aiResult)) {
        await cacheSetJson(cacheKey, aiResult, this.opts.cacheTtlSeconds);
      }
      return {
        ...aiResult,
        // Clear any leftover fallback messaging — this was a real AI read.
        warnings: (aiResult.warnings ?? []).filter(
          (w) => !/backup ocr|ai unavailable|loaded from cache/i.test(w),
        ),
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn("[extraction] AI failed:", reason);

      if (this.opts.disableFallback) {
        throw err instanceof Error ? err : new Error(reason);
      }

      const fallback = rulesExtractFromBytes({
        name: file.name,
        mimeType: file.mimeType,
        bytes,
      });
      fallback.warnings = [
        `AI unavailable (${shortReason(reason)}). Using backup field reader — please check every detail.`,
        ...fallback.warnings.filter((w) => !/backup ocr/i.test(w)),
      ];
      // Do NOT cache fallback — next upload must retry AI.
      return fallback;
    }
  }
}

function isAiSuccess(r: ExtractionResult): boolean {
  const id = (r.providerId ?? "").toLowerCase();
  if (id.includes("rules-ocr") || id === "none") return false;
  return id.includes("openai") || id.startsWith("resilient:openai");
}

function hasUsefulFields(r: ExtractionResult): boolean {
  const x = r.raw;
  return Boolean(x.pcn_number || x.vrm || x.operator_name || x.parking_location);
}

function shortReason(msg: string): string {
  const s = msg.replace(/\s+/g, " ").trim();
  return s.length > 80 ? `${s.slice(0, 77)}…` : s || "error";
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
