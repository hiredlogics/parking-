import type { Rule } from "@/types";

/**
 * MASTER TRIGGER / DECISION RULE TABLE — Master Developer Pack, Part 6.
 *
 * Every rule is a pure boolean predicate over confirmed PCN values and
 * customer answers. No AI. No mutation of inputs. No cross-rule side
 * effects. The engine (rules/engine.ts) simply evaluates every rule and
 * aggregates the paragraph IDs.
 *
 * IDs and paragraph mappings match the pack exactly.
 */
export const RULES: Rule[] = [
  // ---------- KEEPER / PoFA ----------
  {
    id: "PP-R001",
    route: "KEEPER_ROUTE",
    paragraphIds: ["PP-INTRO-001", "PP-INTRO-002"],
    description:
      "registered_keeper = YES AND driver_identified = NO — activate KEEPER_ROUTE and add PP-INTRO-001 + PP-INTRO-002.",
    test: (input) =>
      isYes(input.answers.core.registered_keeper) &&
      isNo(input.answers.core.driver_identified)
        ? { matched: true, reason: "Registered keeper appealing; driver not identified." }
        : { matched: false, reason: "Not a keeper appeal with unidentified driver." },
  },
  {
    id: "PP-R002",
    route: "KEEPER_ROUTE",
    paragraphIds: ["PP-POFA-001"],
    description:
      "KEEPER_ROUTE active — assess applicable Schedule 4 requirements before selecting any PoFA defect. Adds PP-POFA-001.",
    test: (input) =>
      isYes(input.answers.core.registered_keeper) && isNo(input.answers.core.driver_identified)
        ? { matched: true, reason: "KEEPER_ROUTE active — general PoFA paragraph." }
        : { matched: false, reason: "KEEPER_ROUTE not active." },
  },
  {
    id: "PP-R003",
    route: "KEEPER_ROUTE",
    paragraphIds: ["PP-POFA-002"],
    description:
      "registered_keeper = YES AND driver_identified = NO AND notice_to_keeper_received = NO — select PP-POFA-002.",
    test: (input) => {
      const ok =
        isYes(input.answers.core.registered_keeper) &&
        isNo(input.answers.core.driver_identified) &&
        isNo(input.answers.branch.keeper?.notice_to_keeper_received);
      return ok
        ? { matched: true, reason: "No NTK received." }
        : { matched: false, reason: "NTK either not marked absent or preconditions unmet." };
    },
  },
  {
    id: "PP-R004",
    route: "KEEPER_ROUTE",
    paragraphIds: ["PP-POFA-003"],
    description:
      "notice_route = POSTAL AND statutory timing failure confirmed — select PP-POFA-003.",
    test: (input) => {
      const route = input.answers.core.notice_route ?? input.pcn.notice_route;
      const ok = route === "POSTAL" && input.answers.branch.keeper?.pofa_postal_timing_failure === true;
      return ok
        ? { matched: true, reason: "Postal NTK timing failure confirmed." }
        : { matched: false, reason: "Postal timing failure not confirmed." };
    },
  },
  {
    id: "PP-R005",
    route: "KEEPER_ROUTE",
    paragraphIds: ["PP-POFA-004"],
    description:
      "notice_route = WINDSCREEN AND subsequent NTK timing failure confirmed — select PP-POFA-004.",
    test: (input) => {
      const route = input.answers.core.notice_route ?? input.pcn.notice_route;
      const ok =
        route === "WINDSCREEN" &&
        input.answers.branch.keeper?.pofa_windscreen_ntk_timing_failure === true;
      return ok
        ? { matched: true, reason: "Windscreen-followed-by-NTK timing failure confirmed." }
        : { matched: false, reason: "Not applicable." };
    },
  },
  {
    id: "PP-R005A",
    route: "KEEPER_ROUTE",
    paragraphIds: [],
    description:
      "Specific Schedule 4 content defect confirmed — select only the matching PP-POFA-005A/005B/005C/005D/005E.",
    test: (input) => {
      const defect = input.answers.branch.keeper?.pofa_content_defect;
      if (!defect || defect === "NONE") {
        return { matched: false, reason: "No content defect confirmed." };
      }
      return { matched: true, reason: `Content defect confirmed: ${defect}.` };
    },
  },
  {
    id: "PP-R005A-VEHICLE_LAND_PERIOD",
    route: "KEEPER_ROUTE",
    paragraphIds: ["PP-POFA-005A"],
    description: "PP-R005A branch: VEHICLE_LAND_PERIOD defect.",
    test: (input) =>
      input.answers.branch.keeper?.pofa_content_defect === "VEHICLE_LAND_PERIOD"
        ? { matched: true, reason: "Vehicle / relevant land / period defect." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R005A-WARNING",
    route: "KEEPER_ROUTE",
    paragraphIds: ["PP-POFA-005B"],
    description: "PP-R005A branch: WARNING defect.",
    test: (input) =>
      input.answers.branch.keeper?.pofa_content_defect === "WARNING"
        ? { matched: true, reason: "Warning defect." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R005A-CREDITOR",
    route: "KEEPER_ROUTE",
    paragraphIds: ["PP-POFA-005C"],
    description: "PP-R005A branch: CREDITOR defect.",
    test: (input) =>
      input.answers.branch.keeper?.pofa_content_defect === "CREDITOR"
        ? { matched: true, reason: "Creditor identification defect." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R005A-AMOUNT",
    route: "KEEPER_ROUTE",
    paragraphIds: ["PP-POFA-005D"],
    description: "PP-R005A branch: AMOUNT defect.",
    test: (input) =>
      input.answers.branch.keeper?.pofa_content_defect === "AMOUNT"
        ? { matched: true, reason: "Unpaid amount defect." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R005A-INVITATION",
    route: "KEEPER_ROUTE",
    paragraphIds: ["PP-POFA-005E"],
    description: "PP-R005A branch: INVITATION defect.",
    test: (input) =>
      input.answers.branch.keeper?.pofa_content_defect === "INVITATION"
        ? { matched: true, reason: "Statutory invitation defect." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R005B",
    route: "KEEPER_ROUTE",
    paragraphIds: ["PP-POFA-006", "PP-POFA-007"],
    description:
      "One or more valid PoFA failures AND driver not identified — add PP-POFA-006 + PP-POFA-007.",
    test: (input) => {
      const k = input.answers.branch.keeper;
      const anyFailure =
        (k?.notice_to_keeper_received === "NO") ||
        k?.pofa_postal_timing_failure === true ||
        k?.pofa_windscreen_ntk_timing_failure === true ||
        (k?.pofa_content_defect && k.pofa_content_defect !== "NONE");
      const driverNotIdentified = isNo(input.answers.core.driver_identified);
      return anyFailure && driverNotIdentified
        ? { matched: true, reason: "Confirmed PoFA failure + unidentified driver." }
        : { matched: false, reason: "PP-R005B preconditions unmet." };
    },
  },

  // ---------- PAYMENT ----------
  {
    id: "PP-R006",
    route: "PAYMENT_ROUTE",
    paragraphIds: ["PP-PAY-001"],
    description:
      "parking_payment_made = YES — activate PAYMENT_ROUTE and add PP-PAY-001; add PP-PAY-002 if evidence.",
    test: (input) =>
      isYes(input.answers.branch.payment?.parking_payment_made)
        ? { matched: true, reason: "Payment made." }
        : { matched: false, reason: "No payment made." },
  },
  {
    id: "PP-R006-EVIDENCE",
    route: "PAYMENT_ROUTE",
    paragraphIds: ["PP-PAY-002"],
    description: "Payment made + payment_evidence_uploaded = YES — add PP-PAY-002.",
    test: (input) => {
      const p = input.answers.branch.payment;
      return isYes(p?.parking_payment_made) && isYes(p?.payment_evidence_uploaded)
        ? { matched: true, reason: "Payment evidence supplied." }
        : { matched: false, reason: "No payment evidence." };
    },
  },
  {
    id: "PP-R007A",
    route: "PAYMENT_ROUTE",
    paragraphIds: ["PP-PAY-003"],
    description: "payment_attempted = YES AND machine_problem = YES — PP-PAY-003.",
    test: (input) => {
      const p = input.answers.branch.payment;
      return isYes(p?.payment_attempted) && isYes(p?.machine_problem)
        ? { matched: true, reason: "Machine problem reported." }
        : { matched: false, reason: "Machine-problem preconditions unmet." };
    },
  },
  {
    id: "PP-R007A-EVIDENCE",
    route: "PAYMENT_ROUTE",
    paragraphIds: ["PP-PAY-003A"],
    description: "Machine problem + payment_evidence_uploaded = YES — add PP-PAY-003A.",
    test: (input) => {
      const p = input.answers.branch.payment;
      return isYes(p?.payment_attempted) &&
        isYes(p?.machine_problem) &&
        isYes(p?.payment_evidence_uploaded)
        ? { matched: true, reason: "Machine failure evidence supplied." }
        : { matched: false, reason: "Not applicable." };
    },
  },
  {
    id: "PP-R007B",
    route: "PAYMENT_ROUTE",
    paragraphIds: ["PP-PAY-004"],
    description: "payment_attempted = YES AND payment_system_problem = YES — PP-PAY-004.",
    test: (input) => {
      const p = input.answers.branch.payment;
      return isYes(p?.payment_attempted) && isYes(p?.payment_system_problem)
        ? { matched: true, reason: "Digital payment system problem." }
        : { matched: false, reason: "Not applicable." };
    },
  },
  {
    id: "PP-R007B-EVIDENCE",
    route: "PAYMENT_ROUTE",
    paragraphIds: ["PP-PAY-004A"],
    description:
      "Digital-payment problem + payment_evidence_uploaded = YES — add PP-PAY-004A.",
    test: (input) => {
      const p = input.answers.branch.payment;
      return isYes(p?.payment_attempted) &&
        isYes(p?.payment_system_problem) &&
        isYes(p?.payment_evidence_uploaded)
        ? { matched: true, reason: "Digital payment failure evidence supplied." }
        : { matched: false, reason: "Not applicable." };
    },
  },
  {
    id: "PP-R007C",
    route: "PAYMENT_ROUTE",
    paragraphIds: ["PP-PAY-005"],
    description:
      "payment_attempted = YES AND payment_completed = NO AND factual reason established — consider PP-PAY-005.",
    test: (input) => {
      const p = input.answers.branch.payment;
      const factualReason = isYes(p?.machine_problem) || isYes(p?.payment_system_problem);
      return isYes(p?.payment_attempted) && isNo(p?.payment_completed) && factualReason
        ? { matched: true, reason: "Genuine attempt + factual reason established." }
        : { matched: false, reason: "Not applicable." };
    },
  },

  // ---------- KEYING ERROR ----------
  {
    id: "PP-R008",
    route: "KEYING_ERROR_ROUTE",
    paragraphIds: ["PP-KEY-001"],
    description:
      "parking_payment_made = YES AND vrm_error = YES — activate KEYING_ERROR_ROUTE and add PP-KEY-001; specific keying paragraph and PP-KEY-004 follow.",
    test: (input) => {
      const paid = isYes(input.answers.branch.payment?.parking_payment_made);
      const vrmErr = isYes(input.answers.branch.keying?.vrm_error);
      return paid && vrmErr
        ? { matched: true, reason: "Payment made and VRM error reported." }
        : { matched: false, reason: "Keying-error preconditions unmet." };
    },
  },
  {
    id: "PP-R008-MINOR",
    route: "KEYING_ERROR_ROUTE",
    paragraphIds: ["PP-KEY-002"],
    description: "vrm_error_type = MINOR — add PP-KEY-002.",
    test: (input) =>
      input.answers.branch.keying?.vrm_error_type === "MINOR"
        ? { matched: true, reason: "Minor keying error." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R008-OTHER_VEHICLE",
    route: "KEYING_ERROR_ROUTE",
    paragraphIds: ["PP-KEY-003"],
    description: "vrm_error_type = OTHER_VEHICLE — add PP-KEY-003.",
    test: (input) =>
      input.answers.branch.keying?.vrm_error_type === "OTHER_VEHICLE"
        ? { matched: true, reason: "Different vehicle registration entered." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R008-CONFIRMED",
    route: "KEYING_ERROR_ROUTE",
    paragraphIds: ["PP-KEY-004"],
    description: "VRM error + payment_confirmed = YES — add PP-KEY-004.",
    test: (input) => {
      const k = input.answers.branch.keying;
      return isYes(k?.vrm_error) && isYes(k?.payment_confirmed)
        ? { matched: true, reason: "Keying error and payment confirmed." }
        : { matched: false, reason: "Not applicable." };
    },
  },

  // ---------- CONSIDERATION ----------
  {
    id: "PP-R009",
    route: "CONSIDERATION_ROUTE",
    paragraphIds: ["PP-CON-001"],
    description:
      "short_stay = YES AND reading/finding-space/payment-attempt/terms-rejected fact established — activate CONSIDERATION_ROUTE.",
    test: (input) => {
      const c = input.answers.branch.consideration;
      const shortStay = isYes(c?.short_stay);
      const factEstablished =
        c?.consideration_reason === "READING_TERMS" ||
        c?.consideration_reason === "FINDING_SPACE" ||
        c?.consideration_reason === "ATTEMPTING_PAYMENT" ||
        isYes(c?.terms_rejected);
      return shortStay && factEstablished
        ? { matched: true, reason: "Short stay + factual consideration reason." }
        : { matched: false, reason: "Consideration-route preconditions unmet." };
    },
  },
  {
    id: "PP-R009-READING",
    route: "CONSIDERATION_ROUTE",
    paragraphIds: ["PP-CON-002"],
    description: "reason = READING_TERMS — add PP-CON-002.",
    test: (input) =>
      input.answers.branch.consideration?.consideration_reason === "READING_TERMS"
        ? { matched: true, reason: "Reading terms." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R009-PAYMENT",
    route: "CONSIDERATION_ROUTE",
    paragraphIds: ["PP-CON-004"],
    description: "reason = ATTEMPTING_PAYMENT — add PP-CON-004.",
    test: (input) =>
      input.answers.branch.consideration?.consideration_reason === "ATTEMPTING_PAYMENT"
        ? { matched: true, reason: "Attempting payment at start." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R009-FINDING",
    route: "CONSIDERATION_ROUTE",
    paragraphIds: ["PP-CON-005"],
    description: "reason = FINDING_SPACE — add PP-CON-005.",
    test: (input) =>
      input.answers.branch.consideration?.consideration_reason === "FINDING_SPACE"
        ? { matched: true, reason: "Finding a parking space." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R010",
    route: "CONSIDERATION_ROUTE",
    paragraphIds: ["PP-CON-003"],
    description:
      "terms_rejected = YES AND vehicle_left = YES AND no earlier acceptance established — PP-CON-003; PP-CON-006 only if applicable minimum test met.",
    test: (input) => {
      const c = input.answers.branch.consideration;
      const ok = isYes(c?.terms_rejected) && isYes(c?.vehicle_left) && !isYes(c?.parking_took_place);
      return ok
        ? { matched: true, reason: "Terms rejected and vehicle left; no acceptance." }
        : { matched: false, reason: "Not applicable." };
    },
  },
  {
    id: "PP-R010-MIN",
    route: "CONSIDERATION_ROUTE",
    paragraphIds: ["PP-CON-006"],
    description:
      "PP-R010 satisfied AND applicable minimum consideration-period test met — PP-CON-006.",
    test: (input) => {
      const c = input.answers.branch.consideration;
      const base = isYes(c?.terms_rejected) && isYes(c?.vehicle_left) && !isYes(c?.parking_took_place);
      // We rely on an explicit answer that parking did not take place as the
      // system's confirmation of the applicable minimum test.
      const minTestMet = base && isNo(c?.parking_took_place);
      return minTestMet
        ? { matched: true, reason: "Applicable minimum consideration test met." }
        : { matched: false, reason: "Minimum test not confirmed." };
    },
  },

  // ---------- GRACE ----------
  {
    id: "PP-R011",
    route: "GRACE_ROUTE",
    paragraphIds: ["PP-GRACE-001"],
    description:
      "Permitted parking ended AND grace rule applicable — activate GRACE_ROUTE.",
    test: (input) => {
      const g = input.answers.branch.grace;
      const ok = isYes(g?.parking_period_completed) && isYes(g?.grace_period_applicable);
      return ok
        ? { matched: true, reason: "Permitted period ended and grace rule applicable." }
        : { matched: false, reason: "GRACE_ROUTE preconditions unmet." };
    },
  },
  {
    id: "PP-R011-RETURN",
    route: "GRACE_ROUTE",
    paragraphIds: ["PP-GRACE-002"],
    description: "additional_exit_time_required = YES OR exit_reason indicates returning/leaving — PP-GRACE-002.",
    test: (input) => {
      const g = input.answers.branch.grace;
      const ok = isYes(g?.additional_exit_time_required) || g?.exit_reason === "RETURN_TO_VEHICLE";
      return ok
        ? { matched: true, reason: "Time required to return to and leave the vehicle." }
        : { matched: false, reason: "Not applicable." };
    },
  },
  {
    id: "PP-R011-CONGESTION",
    route: "GRACE_ROUTE",
    paragraphIds: ["PP-GRACE-003"],
    description: "exit_delay = CONGESTION — PP-GRACE-003.",
    test: (input) =>
      input.answers.branch.grace?.exit_delay === "CONGESTION"
        ? { matched: true, reason: "Exit delay: congestion." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R011-ADDITIONAL",
    route: "GRACE_ROUTE",
    paragraphIds: ["PP-GRACE-004"],
    description: "Additional exit time fact established — PP-GRACE-004.",
    test: (input) =>
      isYes(input.answers.branch.grace?.additional_exit_time_required)
        ? { matched: true, reason: "Additional exit time reasonably required." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R011-WITHIN",
    route: "GRACE_ROUTE",
    paragraphIds: ["PP-GRACE-005"],
    description:
      "GRACE_ROUTE + overstay within applicable grace period — PP-GRACE-005.",
    test: (input) => {
      const g = input.answers.branch.grace;
      if (!isYes(g?.parking_period_completed) || !isYes(g?.grace_period_applicable)) {
        return { matched: false, reason: "Grace route not active." };
      }
      const overstay = g?.alleged_overstay_minutes;
      if (typeof overstay !== "number") {
        return { matched: false, reason: "No overstay figure recorded." };
      }
      // Applicable grace is treated as at least the standard 10 minutes;
      // conservative test used by the pack for PP-GRACE-005.
      return overstay <= 10
        ? { matched: true, reason: `Overstay ${overstay} min within grace.` }
        : { matched: false, reason: `Overstay ${overstay} min exceeds standard grace.` };
    },
  },
  {
    id: "PP-R011A",
    route: "GRACE_ROUTE",
    paragraphIds: ["PP-GRACE-006"],
    description:
      "System confirms standard 10-minute end grace applies AND overstay <= 10 — PP-GRACE-006.",
    test: (input) => {
      const g = input.answers.branch.grace;
      const overstay = g?.alleged_overstay_minutes;
      const applicable = g?.standard_10_minute_grace === "APPLICABLE";
      return applicable && typeof overstay === "number" && overstay <= 10
        ? { matched: true, reason: `10-minute rule applies; overstay ${overstay} min.` }
        : { matched: false, reason: "10-minute rule not confirmed applicable." };
    },
  },

  // ---------- ANPR ----------
  {
    id: "PP-R012",
    route: "ANPR_DOUBLE_VISIT",
    paragraphIds: ["PP-ANPR-003", "PP-ANPR-005"],
    description:
      "multiple_visits_same_day = YES — activate ANPR_DOUBLE_VISIT; add PP-ANPR-003 + PP-ANPR-005.",
    test: (input) =>
      isYes(input.answers.branch.anpr?.multiple_visits_same_day)
        ? { matched: true, reason: "Multiple visits reported." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R012-ELSEWHERE",
    route: "ANPR_DOUBLE_VISIT",
    paragraphIds: ["PP-ANPR-004"],
    description:
      "Multiple visits + evidence vehicle was elsewhere — add PP-ANPR-004.",
    test: (input) => {
      const a = input.answers.branch.anpr;
      return isYes(a?.multiple_visits_same_day) && isYes(a?.evidence_vehicle_elsewhere)
        ? { matched: true, reason: "Evidence vehicle was elsewhere between visits." }
        : { matched: false, reason: "Not applicable." };
    },
  },
  {
    id: "PP-R013",
    route: "ANPR_ROUTE",
    paragraphIds: ["PP-ANPR-001", "PP-ANPR-002"],
    description:
      "customer_disputes_duration = YES AND evidence_type = ANPR — add PP-ANPR-001 + PP-ANPR-002; consideration/grace/multiple visits assessed separately.",
    test: (input) => {
      const a = input.answers.branch.anpr;
      return isYes(a?.customer_disputes_duration) && a?.evidence_type === "ANPR"
        ? { matched: true, reason: "Duration disputed against ANPR evidence." }
        : { matched: false, reason: "Not applicable." };
    },
  },
  {
    id: "PP-R014",
    route: "ANPR_ROUTE",
    paragraphIds: ["PP-ANPR-012"],
    description:
      "external_evidence_contradicts_anpr = YES — PP-ANPR-012 + evidence paragraph.",
    test: (input) =>
      isYes(input.answers.branch.anpr?.external_evidence_contradicts_anpr)
        ? { matched: true, reason: "Independent evidence contradicts ANPR." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R015",
    route: "ANPR_ROUTE",
    paragraphIds: ["PP-ANPR-010", "PP-ANPR-011"],
    description:
      "Multiple visits + incomplete sequence / first-entry-final-exit pairing suspected — PP-ANPR-010 and/or PP-ANPR-011.",
    test: (input) => {
      const a = input.answers.branch.anpr;
      const missing = isYes(a?.missing_capture_suspected);
      const pairing = isYes(a?.incorrect_pairing_suspected);
      return missing || pairing
        ? { matched: true, reason: "Incomplete sequence or pairing suspected." }
        : { matched: false, reason: "Not applicable." };
    },
  },
  {
    id: "PP-R016",
    route: "ANPR_ROUTE",
    paragraphIds: ["PP-ANPR-007", "PP-ANPR-009"],
    description:
      "timestamp_discrepancy_detected = YES — PP-ANPR-007 + PP-ANPR-009.",
    test: (input) =>
      isYes(input.answers.branch.anpr?.timestamp_discrepancy_detected)
        ? { matched: true, reason: "Timestamp discrepancy detected." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R017",
    route: "ANPR_ROUTE",
    paragraphIds: ["PP-ANPR-008"],
    description:
      "vrm_image_unclear = YES OR vrm_reading_disputed = YES — PP-ANPR-008; consider PP-ANPR-009 if credible camera discrepancy.",
    test: (input) => {
      const a = input.answers.branch.anpr;
      return isYes(a?.vrm_image_unclear) || isYes(a?.vrm_reading_disputed)
        ? { matched: true, reason: "VRM image or reading disputed." }
        : { matched: false, reason: "Not applicable." };
    },
  },

  // ---------- AUTHORISATION ----------
  {
    id: "PP-R018",
    route: "AUTHORISATION_ROUTE",
    paragraphIds: ["PP-AUTH-001"],
    description:
      "parking_authorised = YES — activate AUTHORISATION_ROUTE and add PP-AUTH-001.",
    test: (input) =>
      isYes(input.answers.branch.authorisation?.parking_authorised)
        ? { matched: true, reason: "Parking was authorised." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R019",
    route: "AUTHORISATION_ROUTE",
    paragraphIds: ["PP-AUTH-002"],
    description:
      "permit_held = YES — PP-AUTH-002; add PP-AUTH-004 if display/registration issue.",
    test: (input) =>
      isYes(input.answers.branch.authorisation?.permit_held)
        ? { matched: true, reason: "Valid permit held." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R019-DISPLAY",
    route: "AUTHORISATION_ROUTE",
    paragraphIds: ["PP-AUTH-004"],
    description: "Permit + display/registration issue — add PP-AUTH-004.",
    test: (input) => {
      const a = input.answers.branch.authorisation;
      return isYes(a?.permit_held) && isYes(a?.permit_display_or_registration_issue)
        ? { matched: true, reason: "Permit + display/registration issue." }
        : { matched: false, reason: "Not applicable." };
    },
  },
  {
    id: "PP-R019-DIGITAL",
    route: "AUTHORISATION_ROUTE",
    paragraphIds: ["PP-AUTH-005"],
    description: "Digital permit issue — PP-AUTH-005.",
    test: (input) =>
      isYes(input.answers.branch.authorisation?.digital_permit_issue)
        ? { matched: true, reason: "Digital permit issue reported." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R020",
    route: "AUTHORISATION_ROUTE",
    paragraphIds: ["PP-AUTH-003"],
    description:
      "permission_granted = YES AND permission_source exists — PP-AUTH-003; add PP-AUTH-010 if evidence.",
    test: (input) => {
      const a = input.answers.branch.authorisation;
      const src = a?.permission_source && a.permission_source.trim().length > 0;
      return isYes(a?.permission_granted) && src
        ? { matched: true, reason: "Permission granted; source recorded." }
        : { matched: false, reason: "Not applicable." };
    },
  },
  {
    id: "PP-R020-EVIDENCE",
    route: "AUTHORISATION_ROUTE",
    paragraphIds: ["PP-AUTH-010"],
    description:
      "Authorisation evidence uploaded — add PP-AUTH-010.",
    test: (input) =>
      isYes(input.answers.branch.authorisation?.authorisation_evidence_uploaded)
        ? { matched: true, reason: "Authorisation evidence supplied." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R021",
    route: "AUTHORISATION_ROUTE",
    paragraphIds: ["PP-AUTH-006"],
    description:
      "visitor_permission = YES — PP-AUTH-006; add PP-AUTH-007 if registration problem.",
    test: (input) =>
      isYes(input.answers.branch.authorisation?.visitor_permission)
        ? { matched: true, reason: "Visitor permission." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R021-REG",
    route: "AUTHORISATION_ROUTE",
    paragraphIds: ["PP-AUTH-007"],
    description: "Visitor + registration problem — add PP-AUTH-007.",
    test: (input) => {
      const a = input.answers.branch.authorisation;
      return isYes(a?.visitor_permission) && isYes(a?.visitor_registration_error)
        ? { matched: true, reason: "Visitor + registration problem." }
        : { matched: false, reason: "Not applicable." };
    },
  },
  {
    id: "PP-R022",
    route: "AUTHORISATION_ROUTE",
    paragraphIds: ["PP-AUTH-008"],
    description:
      "customer_only_location = YES AND genuine_customer = YES — PP-AUTH-008; add PP-AUTH-009 if customer evidence.",
    test: (input) => {
      const a = input.answers.branch.authorisation;
      return isYes(a?.customer_only_location) && isYes(a?.genuine_customer)
        ? { matched: true, reason: "Customer-only location + genuine customer." }
        : { matched: false, reason: "Not applicable." };
    },
  },
  {
    id: "PP-R022-EVIDENCE",
    route: "AUTHORISATION_ROUTE",
    paragraphIds: ["PP-AUTH-009"],
    description: "Customer evidence uploaded — add PP-AUTH-009.",
    test: (input) => {
      const a = input.answers.branch.authorisation;
      return isYes(a?.customer_only_location) &&
        isYes(a?.genuine_customer) &&
        isYes(a?.customer_evidence_uploaded)
        ? { matched: true, reason: "Customer evidence supplied." }
        : { matched: false, reason: "Not applicable." };
    },
  },

  // ---------- SIGNAGE ----------
  {
    id: "PP-R023",
    route: "SIGNAGE_ROUTE",
    paragraphIds: ["PP-SIGN-001"],
    description:
      "Credible signage issue established — activate SIGNAGE_ROUTE + PP-SIGN-001; only specific supported signage IDs added.",
    test: (input) => {
      const s = input.answers.branch.signage;
      const credible =
        isNo(s?.entrance_sign_visible) ||
        isYes(s?.sign_difficult_to_read) ||
        isYes(s?.relevant_term_unclear) ||
        isYes(s?.parking_charge_not_prominent) ||
        isYes(s?.dense_wording) ||
        isYes(s?.sign_obscured) ||
        isYes(s?.sign_damaged) ||
        isYes(s?.poor_lighting) ||
        isYes(s?.conflicting_signage);
      return credible
        ? { matched: true, reason: "Credible signage issue reported." }
        : { matched: false, reason: "No credible signage issue." };
    },
  },
  {
    id: "PP-R024",
    route: "SIGNAGE_ROUTE",
    paragraphIds: ["PP-SIGN-002"],
    description: "entrance_sign_visible = NO — PP-SIGN-002.",
    test: (input) =>
      isNo(input.answers.branch.signage?.entrance_sign_visible)
        ? { matched: true, reason: "Entrance sign not visible." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R024-EVIDENCE",
    route: "SIGNAGE_ROUTE",
    paragraphIds: ["PP-SIGN-003"],
    description:
      "entrance_sign disputed + operator evidence inadequate — add PP-SIGN-003.",
    test: (input) =>
      isNo(input.answers.branch.signage?.entrance_sign_visible)
        ? { matched: true, reason: "Entrance-sign evidence request appropriate." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R025",
    route: "SIGNAGE_ROUTE",
    paragraphIds: ["PP-SIGN-004"],
    description:
      "relevant_term_unclear = YES — PP-SIGN-004; add PP-SIGN-012 for specific alleged term.",
    test: (input) =>
      isYes(input.answers.branch.signage?.relevant_term_unclear)
        ? { matched: true, reason: "Relevant term unclear." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R025-ALLEGED_TERM",
    route: "SIGNAGE_ROUTE",
    paragraphIds: ["PP-SIGN-012"],
    description:
      "relevant_term_unclear = YES AND alleged term recorded — add PP-SIGN-012.",
    test: (input) => {
      const s = input.answers.branch.signage;
      const alleged =
        (input.answers.core.alleged_breach && input.answers.core.alleged_breach.trim().length > 0) ||
        (input.pcn.alleged_breach && input.pcn.alleged_breach.trim().length > 0);
      return isYes(s?.relevant_term_unclear) && !!alleged
        ? { matched: true, reason: "Specific alleged term supplied for insertion." }
        : { matched: false, reason: "Not applicable." };
    },
  },
  {
    id: "PP-R026",
    route: "SIGNAGE_ROUTE",
    paragraphIds: ["PP-SIGN-005"],
    description: "parking_charge_not_prominent = YES — PP-SIGN-005.",
    test: (input) =>
      isYes(input.answers.branch.signage?.parking_charge_not_prominent)
        ? { matched: true, reason: "Parking charge not prominent." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R027",
    route: "SIGNAGE_ROUTE",
    paragraphIds: ["PP-SIGN-006"],
    description:
      "sign_difficult_to_read = YES — PP-SIGN-006 + applicable PP-SIGN-007/008/009/010.",
    test: (input) =>
      isYes(input.answers.branch.signage?.sign_difficult_to_read)
        ? { matched: true, reason: "Signage difficult to read." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R027-DENSE",
    route: "SIGNAGE_ROUTE",
    paragraphIds: ["PP-SIGN-007"],
    description: "Dense wording indicated — PP-SIGN-007.",
    test: (input) =>
      isYes(input.answers.branch.signage?.dense_wording)
        ? { matched: true, reason: "Dense wording." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R027-OBSCURED",
    route: "SIGNAGE_ROUTE",
    paragraphIds: ["PP-SIGN-008"],
    description: "Sign obscured — PP-SIGN-008.",
    test: (input) =>
      isYes(input.answers.branch.signage?.sign_obscured)
        ? { matched: true, reason: "Sign obscured." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R027-DAMAGED",
    route: "SIGNAGE_ROUTE",
    paragraphIds: ["PP-SIGN-009"],
    description: "Sign damaged — PP-SIGN-009.",
    test: (input) =>
      isYes(input.answers.branch.signage?.sign_damaged)
        ? { matched: true, reason: "Sign damaged." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R027-LIGHTING",
    route: "SIGNAGE_ROUTE",
    paragraphIds: ["PP-SIGN-010"],
    description: "Poor lighting — PP-SIGN-010.",
    test: (input) =>
      isYes(input.answers.branch.signage?.poor_lighting)
        ? { matched: true, reason: "Poor lighting." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R028",
    route: "SIGNAGE_ROUTE",
    paragraphIds: ["PP-SIGN-011"],
    description: "conflicting_signage = YES — PP-SIGN-011.",
    test: (input) =>
      isYes(input.answers.branch.signage?.conflicting_signage)
        ? { matched: true, reason: "Conflicting signage." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R028-PHOTOS",
    route: "SIGNAGE_ROUTE",
    paragraphIds: ["PP-SIGN-013"],
    description: "signage_photos_uploaded = YES — PP-SIGN-013.",
    test: (input) =>
      isYes(input.answers.branch.signage?.signage_photos_uploaded)
        ? { matched: true, reason: "Customer signage photos supplied." }
        : { matched: false, reason: "Not applicable." },
  },

  // ---------- LANDOWNER ----------
  {
    id: "PP-R029",
    route: "LANDOWNER",
    paragraphIds: ["PP-LAND-001", "PP-LAND-002"],
    description:
      "operator_landowner != YES AND landowner challenge configured/relevant at initial stage — PP-LAND-001; optionally PP-LAND-002.",
    test: (input) => {
      const l = input.answers.branch.landowner;
      const notOwner = l?.operator_landowner === "NO" || l?.operator_landowner === "UNSURE";
      // Concise initial proof request (Part 9 rule 11).
      return notOwner
        ? { matched: true, reason: "Operator is not the landowner — concise proof request." }
        : { matched: false, reason: "Operator asserted as landowner or not indicated." };
    },
  },
  {
    id: "PP-R030",
    route: "LANDOWNER",
    paragraphIds: ["PP-LAND-005"],
    description: "contract_location_discrepancy = YES — PP-LAND-005.",
    test: (input) =>
      isYes(input.answers.branch.landowner?.contract_location_discrepancy)
        ? { matched: true, reason: "Contract location discrepancy." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R031",
    route: "LANDOWNER",
    paragraphIds: ["PP-LAND-006"],
    description:
      "contract_does_not_cover_event_date = YES — PP-LAND-006; PP-LAND-007 if expiry established and no continuation evidence.",
    test: (input) =>
      isYes(input.answers.branch.landowner?.contract_does_not_cover_event_date)
        ? { matched: true, reason: "Contract does not cover event date." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R031-EXPIRED",
    route: "LANDOWNER",
    paragraphIds: ["PP-LAND-007"],
    description: "Expiry established + no continuation evidence — PP-LAND-007.",
    test: (input) => {
      const l = input.answers.branch.landowner;
      return isYes(l?.contract_does_not_cover_event_date) && isYes(l?.contract_expiry_established)
        ? { matched: true, reason: "Contract expired without continuation." }
        : { matched: false, reason: "Not applicable." };
    },
  },
  {
    id: "PP-R032",
    route: "LANDOWNER",
    paragraphIds: ["PP-LAND-008"],
    description: "contract_redactions_prevent_verification = YES — PP-LAND-008.",
    test: (input) =>
      isYes(input.answers.branch.landowner?.contract_redactions_prevent_verification)
        ? { matched: true, reason: "Redactions prevent verification." }
        : { matched: false, reason: "Not applicable." },
  },
  {
    id: "PP-R033",
    route: "LANDOWNER",
    paragraphIds: ["PP-LAND-009"],
    description: "granting_party_authority_questioned = YES — PP-LAND-009.",
    test: (input) =>
      isYes(input.answers.branch.landowner?.granting_party_authority_questioned)
        ? { matched: true, reason: "Granting party's authority questioned." }
        : { matched: false, reason: "Not applicable." },
  },
];

// ------------------------------------------------------------------
// Predicates
// ------------------------------------------------------------------

function isYes(v: string | undefined | null): boolean {
  return v === "YES";
}
function isNo(v: string | undefined | null): boolean {
  return v === "NO";
}
