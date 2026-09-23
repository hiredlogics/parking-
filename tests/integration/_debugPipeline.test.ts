import { describe, it } from "vitest";
import { draftAppeal } from "@/lib/drafting/engine";
import { byUatId } from "../fixtures/uatCases";

function sentences(body: string): string[] {
  return body.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 40);
}
function similarity(a: string, b: string): number {
  const norm = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 3));
  const sa = norm(a), sb = norm(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let shared = 0;
  for (const w of sa) if (sb.has(w)) shared += 1;
  return shared / Math.min(sa.size, sb.size);
}

describe("debug", () => {
  it("find colliding sentence pair", async () => {
    const f = byUatId("UAT-1");
    const draft = await draftAppeal({ confirmed: f.confirmed, answers: f.answers, evidenceTypes: f.evidenceTypes });
    console.log("BODY:\n", draft.body);
    const ss = sentences(draft.body ?? "");
    for (let i = 0; i < ss.length; i++) {
      for (let j = i + 1; j < ss.length; j++) {
        const score = similarity(ss[i], ss[j]);
        if (score >= 0.65) {
          console.log(score.toFixed(2), "\n  A:", ss[i], "\n  B:", ss[j]);
        }
      }
    }
  });
});
