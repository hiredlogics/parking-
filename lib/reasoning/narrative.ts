/**
 * The customer's own account of what happened, read for circumstances.
 *
 * WHY THIS EXISTS
 * ---------------
 * Some issues can never be opened by the notice. A notice says
 * "unauthorised parking"; it cannot say the car had broken down, that
 * the customer holds a lease over the bay, or that a disability meant
 * loading took longer. Those are circumstances only the customer knows.
 *
 * They used to arrive through `scenarios` — a checklist of appeal
 * grounds the customer ticked. That has been retired, because asking a
 * customer which legal ground applies asks them to do the one job the
 * product exists to do, and they pick wrong.
 *
 * So the customer says what happened, in their own words, and this
 * reads circumstances out of it. The distinction that matters: they
 * describe events, the system decides issues.
 *
 * WHAT IT MAY AND MAY NOT DO
 * --------------------------
 * Exactly the standing of `classifyAllegation` next door, and the same
 * sentence applies: it opens a line of enquiry, it never establishes a
 * fact. A tag here makes an issue active, which makes that issue's
 * required facts material, which means they get asked and answered
 * with real provenance. Nothing this file returns is ever assertable in
 * the letter, and it cannot satisfy a required fact — so a wrong tag
 * costs a question, never a false statement.
 *
 * It is deliberately keyword-based rather than a model call. It runs on
 * every fact evaluation, it must not add latency or cost, and a
 * misfire has to be inspectable: `matched` names the phrase that did
 * it. A model here would also be a third fact-shaped AI decision in a
 * pipeline that already has an extractor and a grounds judge, which is
 * the opposite of what the fact lifecycle needed.
 */
import type { ScenarioTag } from "@/lib/facts/facts";

export interface NarrativeClassification {
  /** Circumstance tags the account puts in play. */
  tags: ScenarioTag[];
  /** Phrase that matched each tag, for audit and admin display. */
  matched: { tag: ScenarioTag; phrase: string }[];
}

/**
 * Circumstance patterns.
 *
 * Unlike the allegation classifier these are NOT first-match-wins: one
 * account routinely describes several circumstances at once ("I'd
 * broken down outside my own flat"), and dropping the second would
 * silently close an issue the customer had raised.
 */
const PATTERNS: Array<{ tag: ScenarioTag; re: RegExp }> = [
  {
    tag: "breakdown_immobilised",
    re: /\bbroke\s*down\b|\bbreakdown\b|\bwould\s*n[o']?t\s+start\b|\bflat\s+(?:tyre|battery)\b|\bpunctur\w*\b|\bimmobilis\w+\b|\bengine\s+(?:failed|died|cut\s+out)\b|\brecovery\s+(?:truck|service|vehicle)\b|\b(?:aa|rac|green\s*flag)\b|\btowed?\b|\bcould\s*n[o']?t\s+(?:be\s+)?(?:driven|moved?|drive)\b/i,
  },
  {
    tag: "resident_parking_rights",
    re: /\bi\s+live\b|\bmy\s+(?:flat|home|house|building|block)\b|\bresident\b|\btenan\w+\b|\bleaseholder?\b|\blease\b|\bmy\s+(?:allocated|own)\s+(?:bay|space|parking)\b|\blandlord\b/i,
  },
  {
    tag: "payment_made",
    re: /\bi\s+(?:did\s+)?paid?\b|\bi\s+have\s+(?:the\s+)?(?:receipt|proof\s+of\s+payment)\b|\bpayment\s+went\s+through\b|\bpaid\s+(?:by|with|for)\b/i,
  },
  {
    tag: "payment_attempted_failed",
    re: /\bmachine\s+(?:was\s+)?(?:broken|out\s+of\s+order|not\s+working|faulty)\b|\bapp\s+(?:would\s*n[o']?t|did\s*n[o']?t)\s+\w+/i,
  },
  {
    tag: "vrm_error",
    re: /\b(?:typed|entered|keyed|put)\s+(?:in\s+)?(?:the\s+)?wrong\b|\bmistyped\b|\btypo\b|\bwrong\s+(?:registration|reg|number\s*plate|vrm)\b|\bone\s+(?:digit|letter|character)\b/i,
  },
  {
    tag: "accessibility_additional_time",
    re: /\bdisab\w+\b|\bblue\s+badge\b|\bwheelchair\b|\bmobility\b|\bcarer\b|\bmedical\s+condition\b|\bneeded\s+(?:more|extra)\s+time\b/i,
  },
  {
    tag: "hospital_attendance",
    re: /\bhospital\b|\ba\s*&\s*e\b|\bemergency\s+department\b|\bappointment\s+(?:ran|over)\w*\b|\bgp\s+surgery\b|\bclinic\b/i,
  },
  {
    tag: "loading_or_dropoff",
    re: /\bloading\b|\bunloading\b|\bdropp?(?:ing|ed)\s+(?:off|someone)\b|\bpick(?:ing|ed)?\s+up\b|\bdeliver\w*\b/i,
  },
  {
    tag: "ev_charging",
    re: /\bcharg(?:ing|e[dr]?)\b.{0,20}\b(?:car|vehicle|point|bay)\b|\belectric\s+(?:car|vehicle)\b|\bev\s+charg\w*\b/i,
  },
  {
    tag: "barrier_or_access_failure",
    re: /\bbarrier\b|\bgate\s+(?:was\s+)?(?:stuck|closed|broken|would\s*n[o']?t)\b|\bcould\s*n[o']?t\s+(?:get\s+)?(?:out|exit|leave)\b|\bqueue\s+to\s+(?:exit|leave)\b|\blocked\s+in\b/i,
  },
  {
    tag: "signage_issue",
    re: /\bno\s+sign\w*\b|\bsign\w*\s+(?:were|was)\s+(?:not|hidden|obscured|unclear|missing|faded)\b|\bcould\s*n[o']?t\s+see\s+(?:any\s+)?sign\w*\b|\bnothing\s+(?:said|told\s+me)\b|\bunclear\s+sign\w*\b/i,
  },
  {
    tag: "grace_or_exit",
    re: /\bjust\s+(?:a\s+)?(?:few|couple\s+of)\s+minutes?\b|\ba\s+few\s+minutes?\s+(?:late|over)\b|\bqueue\b|\bwaiting\s+to\s+(?:exit|leave|get\s+out)\b|\btraffic\s+(?:in|at)\s+the\s+car\s*park\b/i,
  },
  {
    tag: "short_stay_consideration",
    re: /\bonly\s+(?:there|stayed|stopped)\s+(?:for\s+)?(?:a\s+)?(?:few|\d+)\s*(?:minutes?|mins?)\b|\bread(?:ing)?\s+the\s+sign\w*\b|\blooked?\s+(?:for|around)\b.{0,15}\bspace\b|\bdrove\s+(?:straight\s+)?(?:out|off)\b|\bchanged\s+my\s+mind\b/i,
  },
  {
    tag: "multiple_visits_same_day",
    re: /\b(?:two|2|three|3|twice|three\s+times)\s+(?:separate\s+)?(?:visits?|trips?)\b|\bcame\s+back\s+(?:later|again)\b|\bleft\s+and\s+returned\b|\bsame\s+day\b/i,
  },
  {
    tag: "authorised_or_permit",
    re: /\bi\s+(?:had|have)\s+(?:a\s+)?permit\b|\bpermit\s+(?:was\s+)?(?:displayed|on\s+the)\b|\bstaff\s+(?:said|told)\b|\bmy\s+employer\b|\bi\s+work\s+(?:there|here)\b|\bwas\s+allowed\s+to\s+park\b|\bpermission\b/i,
  },
  {
    tag: "no_ntk_received",
    re: /\bnever\s+(?:got|received)\b|\bdid\s*n[o']?t\s+(?:get|receive)\b.{0,25}\b(?:notice|letter)\b|\bfirst\s+i\s+(?:knew|heard)\b/i,
  },
];

/**
 * Read circumstances out of the customer's account.
 *
 * Short inputs are ignored: a one-word answer carries no reliable
 * circumstance and matching on it produces noise.
 */
export function classifyNarrative(
  text: string | null | undefined,
): NarrativeClassification {
  const input = (text ?? "").trim();
  if (input.length < 8) return { tags: [], matched: [] };

  const matched: { tag: ScenarioTag; phrase: string }[] = [];
  const seen = new Set<ScenarioTag>();
  for (const { tag, re } of PATTERNS) {
    if (seen.has(tag)) continue;
    const m = re.exec(input);
    if (m) {
      seen.add(tag);
      matched.push({ tag, phrase: m[0] });
    }
  }
  return { tags: matched.map((m) => m.tag), matched };
}
