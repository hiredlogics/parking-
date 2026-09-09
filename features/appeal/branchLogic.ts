import type { AllAnswers } from "@/types";

/**
 * Which branch questions to render, given the current core answers.
 * Branch identifiers align 1:1 with the pack's Part 5 branches.
 */
export interface ActiveBranches {
  keeper: boolean;
  payment: boolean;
  keying: boolean;
  consideration: boolean;
  grace: boolean;
  anpr: boolean;
  authorisation: boolean;
  signage: boolean;
  landowner: boolean;
}

export function activeBranches(answers: AllAnswers): ActiveBranches {
  const s = new Set(answers.core.scenarios);
  const isKeeper = answers.core.registered_keeper === "YES";
  const driverUnidentified = answers.core.driver_identified === "NO";
  const postal = answers.core.notice_route === "POSTAL";

  return {
    keeper:
      isKeeper && driverUnidentified ||
      s.has("postal_ntk_timing_issue") ||
      s.has("no_ntk_received") ||
      postal,
    payment: s.has("payment_made") || s.has("payment_attempted_failed"),
    keying: s.has("vrm_error") || s.has("payment_made"),
    consideration: s.has("short_stay_consideration"),
    grace: s.has("grace_or_exit"),
    anpr: s.has("anpr_disputed") || s.has("multiple_visits_same_day"),
    authorisation: s.has("authorised_or_permit"),
    signage: s.has("signage_issue"),
    landowner: s.has("landowner_authority_challenge"),
  };
}
