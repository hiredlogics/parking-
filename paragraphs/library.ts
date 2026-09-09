import type { Paragraph } from "@/types";

/**
 * COMPLETE APPROVED PARAGRAPH LIBRARY — Master Developer Pack, Part 8.
 *
 * Text is treated as canonical output from the pack. The system MUST NOT
 * rewrite the wording; it may only:
 *   - select paragraphs by trigger id via the rules engine,
 *   - substitute the supported {{variables}}, and
 *   - deduplicate by paragraph ID (Set semantics).
 *
 * Priority values place primary factual grounds before secondary
 * signage / authority grounds and put intro paragraphs at the top and
 * closing paragraphs at the very end (Part 9 rule 3).
 */
export const PARAGRAPH_LIBRARY: Paragraph[] = [
  // ---------- INTRO ----------
  {
    id: "PP-INTRO-001",
    title: "Registered Keeper Appeal",
    trigger: "registered_keeper = YES",
    category: "intro",
    priority: 10,
    active: true,
    text:
      "I write as the registered keeper of vehicle {{vrm}} in respect of Parking Charge Notice {{pcn_number}}. I dispute liability for this parking charge and require the operator to consider this appeal on the grounds set out below.",
  },
  {
    id: "PP-INTRO-002",
    title: "Driver Not Identified",
    trigger: "registered_keeper = YES AND driver_identified = NO",
    category: "intro",
    priority: 12,
    active: true,
    text:
      "This appeal is submitted by the registered keeper. No admission is made as to the identity of the driver, and nothing contained within this appeal should be interpreted as identifying or inferring the identity of the driver.",
  },

  // ---------- PoFA ----------
  {
    id: "PP-POFA-001",
    title: "Keeper Liability Must Be Established",
    trigger: "KEEPER_ROUTE active",
    category: "pofa",
    priority: 50,
    active: true,
    text:
      "Where the operator seeks to recover the parking charge from the registered keeper rather than the driver, it must establish that the statutory conditions for keeper liability under Schedule 4 of the Protection of Freedoms Act 2012 have been satisfied. Keeper liability does not arise merely because an individual is the registered keeper of a vehicle. The operator is therefore required to demonstrate compliance with the applicable requirements of Schedule 4 before seeking recovery of the charge from the keeper.",
  },
  {
    id: "PP-POFA-002",
    title: "No Notice to Keeper Received",
    trigger: "keeper + driver not identified + no NTK",
    category: "pofa",
    priority: 52,
    active: true,
    text:
      "The registered keeper has not received a Notice to Keeper capable of establishing keeper liability under Schedule 4 of the Protection of Freedoms Act 2012. In the absence of compliance with the statutory procedure required to transfer liability from the driver to the keeper, the operator has no basis upon which to pursue the registered keeper for this charge.",
  },
  {
    id: "PP-POFA-003",
    title: "Postal Notice Timing Failure",
    trigger: "confirmed applicable postal timing failure",
    category: "pofa",
    priority: 54,
    active: true,
    text:
      "The Notice to Keeper was not delivered within the relevant statutory period prescribed by Schedule 4 of the Protection of Freedoms Act 2012 for a case where no Notice to Driver was issued. The operator has therefore failed to satisfy a condition required to transfer liability for the parking charge from the driver to the registered keeper. Accordingly, the registered keeper cannot be held liable under Schedule 4.",
  },
  {
    id: "PP-POFA-004",
    title: "Notice Following Notice to Driver Timing Failure",
    trigger: "confirmed applicable timing failure after windscreen notice",
    category: "pofa",
    priority: 56,
    active: true,
    text:
      "A Notice to Driver was issued in relation to the alleged parking event. Where an operator subsequently seeks to transfer liability to the registered keeper, the subsequent Notice to Keeper must comply with the applicable timing requirements contained within Schedule 4 of the Protection of Freedoms Act 2012. The Notice to Keeper in this case was not given within the applicable statutory period. The conditions necessary to establish keeper liability have therefore not been satisfied.",
  },
  {
    id: "PP-POFA-005A",
    title: "Vehicle / Relevant Land / Period of Parking",
    trigger: "specific applicable information defect confirmed",
    category: "pofa",
    priority: 58,
    active: true,
    text:
      "The Notice to Keeper fails to provide the information required by Schedule 4 concerning the alleged parking event. Compliance with the statutory requirements governing the identification of the vehicle, the relevant land and the period of parking is a condition of relying upon Schedule 4 to pursue the registered keeper. The operator has failed to establish the required compliance.",
  },
  {
    id: "PP-POFA-005B",
    title: "Keeper Liability Warning Defective or Missing",
    trigger: "applicable warning defect confirmed",
    category: "pofa",
    priority: 60,
    active: true,
    text:
      "The Notice to Keeper does not contain a compliant warning explaining the circumstances in which the operator would acquire a right to recover the unpaid parking charge from the registered keeper following the relevant statutory period. This warning forms part of the requirements of Schedule 4. The operator cannot rely upon keeper liability where the applicable statutory conditions have not been met.",
  },
  {
    id: "PP-POFA-005C",
    title: "Creditor Not Properly Identified",
    trigger: "applicable creditor-identification defect confirmed",
    category: "pofa",
    priority: 62,
    active: true,
    text:
      "The Notice to Keeper fails to comply with the applicable requirement to identify the creditor seeking payment of the parking charge. Where an operator seeks to rely upon the statutory keeper-liability provisions, the notice must satisfy the applicable requirements of Schedule 4. The operator is put to strict proof that the notice relied upon is compliant.",
  },
  {
    id: "PP-POFA-005D",
    title: "Amount / Unpaid Parking Charge Defect",
    trigger: "applicable amount requirement defect confirmed",
    category: "pofa",
    priority: 64,
    active: true,
    text:
      "The Notice to Keeper does not properly comply with the applicable Schedule 4 requirements concerning the unpaid parking charge said to be outstanding. The operator is required to establish compliance with the statutory conditions before liability can be transferred to the keeper. It has failed to do so.",
  },
  {
    id: "PP-POFA-005E",
    title: "Driver/Keeper Invitation Requirement",
    trigger: "applicable statutory invitation defect confirmed",
    category: "pofa",
    priority: 66,
    active: true,
    text:
      "The Notice to Keeper does not contain the required statutory invitation concerning payment of the unpaid parking charge or, where the keeper was not the driver, notification of the driver's name and current address for service. The operator has therefore failed to comply with an applicable condition of Schedule 4 upon which keeper liability depends.",
  },
  {
    id: "PP-POFA-006",
    title: "Driver Has Not Been Established",
    trigger: "valid PoFA failure + driver not identified",
    category: "pofa",
    priority: 68,
    active: true,
    text:
      "The operator has not established the identity of the driver. As the operator has also failed to satisfy the applicable requirements necessary to transfer liability under Schedule 4 of the Protection of Freedoms Act 2012, there is no basis upon which liability for this parking charge can be transferred to the registered keeper.",
  },
  {
    id: "PP-POFA-007",
    title: "Keeper Liability Conclusion",
    trigger: "one or more confirmed PoFA failures",
    category: "pofa",
    priority: 70,
    active: true,
    text:
      "For the reasons set out above, the operator has failed to establish keeper liability under Schedule 4 of the Protection of Freedoms Act 2012. The registered keeper is therefore not liable for the parking charge on that basis, and the charge should be cancelled.",
  },

  // ---------- PAYMENT ----------
  {
    id: "PP-PAY-001",
    title: "Parking Was Paid For",
    trigger: "parking_payment_made = YES",
    category: "payment",
    priority: 100,
    active: true,
    text:
      "The allegation that the applicable parking tariff was not paid is disputed. Payment was made in connection with the vehicle's use of the site. In those circumstances, the operator is required to properly review its payment records against the parking event before continuing to pursue the charge.",
  },
  {
    id: "PP-PAY-002",
    title: "Evidence of Payment Supplied",
    trigger: "payment made + evidence uploaded",
    category: "payment",
    priority: 102,
    active: true,
    text:
      "Evidence confirming payment is supplied with this appeal. The operator is requested to consider that evidence alongside its own transaction records and the details of the alleged parking event. The evidence demonstrates that a payment was made in connection with the parking period and must be properly considered before any further enforcement action is taken.",
  },
  {
    id: "PP-PAY-003",
    title: "Payment Machine Failure",
    trigger: "machine problem",
    category: "payment",
    priority: 104,
    active: true,
    text:
      "There was a problem with the payment facilities available at the location. A genuine attempt was made to comply with the parking terms, but the payment machine did not operate as expected and prevented the parking transaction from being completed in the normal manner. The operator is requested to review its machine maintenance, fault and transaction records for the relevant date and time and to take those circumstances into account when considering this appeal.",
  },
  {
    id: "PP-PAY-003A",
    title: "Machine Failure Evidence",
    trigger: "machine problem + evidence",
    category: "payment",
    priority: 106,
    active: true,
    text:
      "Supporting evidence concerning the payment-machine problem is supplied with this appeal. The operator is requested to consider this evidence alongside its own maintenance, fault and transaction records for the relevant machine and period.",
  },
  {
    id: "PP-PAY-004",
    title: "Parking App or Digital Payment Failure",
    trigger: "app/online problem",
    category: "payment",
    priority: 108,
    active: true,
    text:
      "A genuine attempt was made to use the digital payment facility provided for the location, but the payment process could not be completed because of a problem encountered with the payment system. The operator is requested to review the relevant transaction and system records and consider whether a genuine attempt to comply with the advertised payment requirements was made before deciding whether the parking charge should be maintained.",
  },
  {
    id: "PP-PAY-004A",
    title: "Digital Payment Failure Evidence",
    trigger: "digital payment problem + evidence",
    category: "payment",
    priority: 110,
    active: true,
    text:
      "Evidence of the attempted payment and/or difficulty encountered with the digital payment process is enclosed. This should be considered together with the operator's own system and transaction records for the relevant period.",
  },
  {
    id: "PP-PAY-005",
    title: "Genuine Attempt to Make Payment",
    trigger: "genuine attempt + failed completion + factual reason",
    category: "payment",
    priority: 112,
    active: true,
    text:
      "The circumstances demonstrate a genuine attempt to comply with the payment requirements at the location. The parking charge should not be considered in isolation from the steps taken to make payment and the circumstances that prevented the transaction from being successfully completed. The operator is requested to consider those circumstances fairly and to cancel the parking charge.",
  },
  {
    id: "PP-PAY-006",
    title: "Review Payment Records",
    trigger: "payment dispute where records may establish event",
    category: "payment",
    priority: 114,
    active: true,
    text:
      "The operator is requested to conduct a reasonable search of its payment records for the relevant location and period, including transactions capable of being matched to the vehicle or parking event. The appeal should not be rejected solely because an automated system has failed to immediately match a transaction to the vehicle registration.",
  },

  // ---------- KEYING ERROR ----------
  {
    id: "PP-KEY-001",
    title: "Parking Paid but Registration Entered Incorrectly",
    trigger: "payment made + VRM error",
    category: "keying",
    priority: 120,
    active: true,
    text:
      "A parking payment was made, but an error occurred when the vehicle registration details were entered. The existence of a keying error does not alter the fact that a payment was made in connection with the parking event. The operator is requested to search its payment records for the relevant period and identify the corresponding transaction rather than treating the matter as though no payment was made.",
  },
  {
    id: "PP-KEY-002",
    title: "Minor Keying Error",
    trigger: "vrm_error_type = MINOR",
    category: "keying",
    priority: 122,
    active: true,
    text:
      "The discrepancy concerns a minor error in the vehicle registration details entered during the payment process. A payment was nevertheless made in connection with the parking event. The operator is requested to match the payment against its transaction records and deal with the matter in accordance with the applicable requirements concerning keying errors rather than pursuing the matter as an unpaid parking event.",
  },
  {
    id: "PP-KEY-003",
    title: "Different Vehicle Registration Entered",
    trigger: "vrm_error_type = OTHER_VEHICLE",
    category: "keying",
    priority: 124,
    active: true,
    text:
      "A parking payment was made, but registration details relating to a different vehicle were entered during the transaction. The operator is requested to examine its records for the relevant payment and parking period. The underlying parking tariff was paid, and the transaction should be considered when determining whether continued enforcement of the parking charge is appropriate.",
  },
  {
    id: "PP-KEY-004",
    title: "Tariff Was Paid",
    trigger: "VRM error + payment confirmed",
    category: "keying",
    priority: 126,
    active: true,
    text:
      "Notwithstanding the registration-entry error, the applicable parking tariff was paid. This is therefore not a case in which the parking facility was used without any payment being made. The operator is requested to take the payment into account and cancel the parking charge in light of the circumstances.",
  },

  // ---------- CONSIDERATION ----------
  {
    id: "PP-CON-001",
    title: "Consideration Period Required",
    trigger: "CONSIDERATION_ROUTE",
    category: "consideration",
    priority: 140,
    active: true,
    text:
      "The recorded presence of the vehicle at the location must be considered in the context of the applicable consideration period. The applicable private parking sector requirements recognise that a motorist must be allowed time to enter the controlled land, consider the applicable terms and conditions and decide whether to accept those terms and remain or reject them and leave. The mere recording of a vehicle entering and subsequently exiting controlled land does not, without more, establish that the entirety of that period constituted an accepted period of parking.",
  },
  {
    id: "PP-CON-002",
    title: "Time Required to Locate and Read Terms",
    trigger: "short stay + reading terms",
    category: "consideration",
    priority: 142,
    active: true,
    text:
      "The vehicle was present while the applicable parking terms were being located and considered. A motorist cannot reasonably decide whether to accept contractual parking terms before having had a reasonable opportunity to locate, read and understand them. The time spent undertaking that process falls to be considered as part of the applicable consideration period.",
  },
  {
    id: "PP-CON-003",
    title: "Terms Not Accepted and Vehicle Left",
    trigger: "terms rejected + vehicle left",
    category: "consideration",
    priority: 144,
    active: true,
    text:
      "Having considered the applicable terms and conditions, those terms were not accepted and the vehicle left the controlled land. The vehicle's presence during that process should not be treated automatically as evidence that a parking contract had been accepted. The operator is therefore requested to consider the recorded duration against the applicable consideration-period requirements and cancel the parking charge.",
  },
  {
    id: "PP-CON-004",
    title: "Time Spent Attempting Payment",
    trigger: "attempting payment at beginning",
    category: "consideration",
    priority: 146,
    active: true,
    text:
      "Part of the recorded period was spent attempting to comply with the payment arrangements at the location. The operator should not treat the vehicle's entry time as though it automatically represents the commencement of a paid parking period without considering the time reasonably required to understand and attempt to comply with the payment arrangements. The operator is requested to review the circumstances together with its payment and system records.",
  },
  {
    id: "PP-CON-005",
    title: "Searching for a Parking Space",
    trigger: "reason = FINDING_SPACE",
    category: "consideration",
    priority: 148,
    active: true,
    text:
      "Part of the recorded presence at the location was spent entering the site and attempting to locate a suitable parking space. Entry onto controlled land does not necessarily establish that parking commenced at the precise moment recorded by an entrance camera. The operator is required to consider the actual circumstances and the applicable consideration period rather than simply treating the entire entry-to-exit duration as a period of parking.",
  },
  {
    id: "PP-CON-006",
    title: "Within Applicable Minimum Consideration Period",
    trigger: "system confirms applicable minimum test",
    category: "consideration",
    priority: 150,
    active: true,
    text:
      "The recorded duration falls within the applicable minimum consideration period. On the information available, there is no proper basis for treating the vehicle's presence during that period as a chargeable breach of the parking terms. The parking charge should therefore be cancelled.",
  },

  // ---------- GRACE / EXIT ----------
  {
    id: "PP-GRACE-001",
    title: "Applicable Grace Period",
    trigger: "GRACE_ROUTE",
    category: "grace",
    priority: 160,
    active: true,
    text:
      "The applicable private parking sector requirements provide for a grace period in relevant circumstances in addition to the parking period. A parking charge should not be issued merely because the vehicle remained on the controlled land during an applicable grace period following the end of the permitted parking period. The operator is therefore required to assess the alleged overstay against the applicable grace-period requirements.",
  },
  {
    id: "PP-GRACE-002",
    title: "Time Required to Return to Vehicle and Leave",
    trigger: "returning/leaving",
    category: "grace",
    priority: 162,
    active: true,
    text:
      "The period following the end of the permitted parking session included the time reasonably required to return to the vehicle, prepare to leave and exit the controlled land. The permitted parking period should not simply be compared with an ANPR exit timestamp without applying the applicable grace period.",
  },
  {
    id: "PP-GRACE-003",
    title: "Congestion or Delay Exiting",
    trigger: "exit_delay = CONGESTION",
    category: "grace",
    priority: 164,
    active: true,
    text:
      "The vehicle's departure from the controlled land was affected by circumstances involved in exiting the location, including delay and/or congestion. An ANPR exit timestamp records the point at which the vehicle passed the camera; it does not necessarily establish that the vehicle remained parked until that moment. The operator is requested to consider the actual circumstances together with the applicable grace period.",
  },
  {
    id: "PP-GRACE-004",
    title: "Additional Time Required Due to Circumstances",
    trigger: "additional exit time fact established",
    category: "grace",
    priority: 166,
    active: true,
    text:
      "Additional time was reasonably required before the vehicle could leave the controlled land. The operator is required to consider the particular circumstances rather than treating the difference between the end of the permitted parking period and the recorded exit time as automatically establishing a contractual breach. Those circumstances should be considered together with the applicable grace-period requirements.",
  },
  {
    id: "PP-GRACE-005",
    title: "Recorded Overstay Within Applicable Grace Period",
    trigger: "overstay <= applicable grace",
    category: "grace",
    priority: 168,
    active: true,
    text:
      "The alleged additional period falls within the applicable grace period following the end of the permitted parking session. The applicable grace period must be allowed in addition to the parking period. Accordingly, the parking charge should be cancelled.",
  },
  {
    id: "PP-GRACE-006",
    title: "Standard 10-Minute End Grace Period",
    trigger: "system confirms 10-minute rule applies + <=10",
    category: "grace",
    priority: 170,
    active: true,
    text:
      "The alleged additional period does not exceed the applicable 10-minute grace period following the permitted parking session. The parking charge has therefore been issued in circumstances where the applicable grace period had not expired and should be cancelled.",
  },
  {
    id: "PP-GRACE-008",
    title: "Additional Time / Accessibility Circumstances",
    trigger: "additional time circumstance established",
    category: "grace",
    priority: 172,
    active: true,
    text:
      "The circumstances required additional time to enter, use and/or leave the parking location. The operator is required to consider the individual circumstances and whether additional time beyond the standard period was reasonably required. The parking charge should not be determined solely by an automated comparison of entry and exit timestamps without proper consideration of those circumstances and the operator's applicable obligations.",
  },

  // ---------- ANPR ----------
  {
    id: "PP-ANPR-001",
    title: "Entry and Exit Times Do Not Necessarily Establish Parking Time",
    trigger: "ANPR + duration relevant",
    category: "anpr",
    priority: 180,
    active: true,
    text:
      "The ANPR images relied upon record the vehicle at particular points on the controlled land. Those timestamps do not necessarily establish the precise period during which the vehicle was actually parked. Time spent entering the site, locating a parking space, considering the applicable terms, manoeuvring and subsequently leaving the site may form part of the overall recorded presence without forming part of the actual period of parking. The operator is therefore required to distinguish between the vehicle's total presence on the controlled land and the period during which it alleges the vehicle was actually parked.",
  },
  {
    id: "PP-ANPR-002",
    title: "Alleged Parking Duration Disputed",
    trigger: "customer_disputes_duration = YES",
    category: "anpr",
    priority: 182,
    active: true,
    text:
      "The alleged duration of parking is disputed. The operator is put to proof of the actual parking period relied upon rather than merely the elapsed period between two camera timestamps. Where the operator relies upon ANPR entry and exit images, it should explain how those images establish the alleged period of parking in the particular circumstances of this case.",
  },
  {
    id: "PP-ANPR-003",
    title: "Multiple Separate Visits",
    trigger: "multiple_visits_same_day = YES",
    category: "anpr",
    priority: 184,
    active: true,
    text:
      "The vehicle attended the location on more than one separate occasion. The first recorded entry and final recorded exit must not therefore be treated as though they represent one continuous parking event. The operator is required to review the complete ANPR record for the vehicle and the relevant period, including all intervening entry and exit captures, before concluding that a single continuous stay occurred.",
  },
  {
    id: "PP-ANPR-004",
    title: "Evidence Vehicle Left Between Visits",
    trigger: "multiple visits + elsewhere evidence",
    category: "anpr",
    priority: 186,
    active: true,
    text:
      "Supporting evidence demonstrates that the vehicle was not continuously present at the location for the period alleged. The evidence is inconsistent with the operator's apparent treatment of the first entry and final exit as a single continuous visit. The operator is required to reconsider the ANPR sequence in light of that evidence and cancel the parking charge where the alleged continuous parking event cannot be established.",
  },
  {
    id: "PP-ANPR-005",
    title: "Full ANPR Record Requested",
    trigger: "multiple visits / missing capture suspected",
    category: "anpr",
    priority: 188,
    active: true,
    text:
      "The operator is requested to review the complete sequence of ANPR captures associated with the vehicle for the relevant date, rather than relying solely upon the two images reproduced on the Parking Charge Notice. That review should include any intermediate entry and exit records capable of demonstrating that more than one visit occurred.",
  },
  {
    id: "PP-ANPR-006",
    title: "Camera Evidence Compliance",
    trigger: "specific camera-evidence issue",
    category: "anpr",
    priority: 190,
    active: true,
    text:
      "Where photographic evidence is relied upon as the basis for issuing a parking charge, the operator is required to ensure that its camera equipment and systems are fit for purpose, properly maintained and capable of accurately recording the evidence relied upon. The operator is requested to demonstrate that the photographic evidence relied upon in this case accurately relates to the alleged parking event.",
  },
  {
    id: "PP-ANPR-007",
    title: "Timestamp Discrepancy",
    trigger: "timestamp discrepancy",
    category: "anpr",
    priority: 192,
    active: true,
    text:
      "There is an apparent discrepancy concerning the timestamps relied upon by the operator. As the alleged duration is calculated from those timestamps, their accuracy is directly relevant to whether the parking charge was properly issued. The operator is requested to verify the accuracy and synchronisation of the equipment and systems responsible for the relevant images and explain the discrepancy identified.",
  },
  {
    id: "PP-ANPR-008",
    title: "Image / VRM Issue",
    trigger: "VRM image/reading disputed",
    category: "anpr",
    priority: 194,
    active: true,
    text:
      "The photographic evidence does not clearly establish the vehicle registration details relied upon by the operator. Where camera evidence forms the basis of a parking charge, the vehicle registration mark relied upon must be capable of being properly identified from the evidence. The operator is requested to review the original images and confirm the basis upon which the vehicle registration was identified.",
  },
  {
    id: "PP-ANPR-009",
    title: "Manual Quality-Control Check",
    trigger: "credible ANPR discrepancy",
    category: "anpr",
    priority: 196,
    active: true,
    text:
      "Given the discrepancy identified in this case, the operator is requested to confirm that the applicable manual quality-control checks were undertaken and to reconsider the charge against the complete photographic record.",
  },
  {
    id: "PP-ANPR-010",
    title: "Possible Missing Entry or Exit Capture",
    trigger: "incomplete multi-visit sequence",
    category: "anpr",
    priority: 198,
    active: true,
    text:
      "The ANPR sequence relied upon appears incomplete. The absence of an intermediate entry or exit image should not automatically be treated as evidence that the vehicle remained continuously on the controlled land. The operator is requested to review its complete records and determine whether an entry or exit movement was not captured, read or correctly matched by the ANPR system.",
  },
  {
    id: "PP-ANPR-011",
    title: "Incorrect Pairing of Captures",
    trigger: "separate visits may be paired",
    category: "anpr",
    priority: 200,
    active: true,
    text:
      "The evidence indicates that separate visits may have been incorrectly combined into a single parking event by pairing an earlier entry with a later exit. The operator is required to examine all ANPR captures for the vehicle on the relevant date and establish that the two images relied upon genuinely relate to one continuous visit before continuing to pursue the parking charge.",
  },
  {
    id: "PP-ANPR-012",
    title: "Independent Evidence Contradicts Alleged Stay",
    trigger: "external evidence contradicts ANPR",
    category: "anpr",
    priority: 202,
    active: true,
    text:
      "Independent evidence supplied with this appeal is inconsistent with the allegation that the vehicle remained at the location continuously for the period stated on the Parking Charge Notice. The operator is requested to consider that evidence alongside the complete ANPR record rather than relying solely upon the entry and exit images reproduced on the notice.",
  },

  // ---------- AUTHORISATION ----------
  {
    id: "PP-AUTH-001",
    title: "Vehicle Was Authorised to Park",
    trigger: "parking_authorised = YES",
    category: "authorisation",
    priority: 220,
    active: true,
    text:
      "The vehicle was authorised to park at the location at the material time. The allegation that the vehicle was parked without authority is therefore disputed. The operator is requested to review the relevant authorisation records and the supporting evidence provided with this appeal before continuing to pursue the parking charge.",
  },
  {
    id: "PP-AUTH-002",
    title: "Valid Permit Held",
    trigger: "permit_held = YES",
    category: "authorisation",
    priority: 222,
    active: true,
    text:
      "A valid parking permit was held in connection with the vehicle's use of the location. The operator is requested to verify the permit against its records and consider the circumstances in which the Parking Charge Notice was issued. The existence of the permit and the underlying authority to park must be taken into account when determining whether the charge should be maintained.",
  },
  {
    id: "PP-AUTH-003",
    title: "Permission Granted",
    trigger: "permission granted + source",
    category: "authorisation",
    priority: 224,
    active: true,
    text:
      "Permission for the vehicle to park at the location had been granted by {{permission_source}}. The vehicle was therefore present with authorisation rather than as an unauthorised user of the parking facility. The operator is requested to verify that permission with the relevant party and cancel the parking charge where the authorisation is confirmed.",
  },
  {
    id: "PP-AUTH-004",
    title: "Permit Existed but Display/Registration Issue",
    trigger: "permit + admin/display issue",
    category: "authorisation",
    priority: 226,
    active: true,
    text:
      "Although there appears to have been an issue concerning the display or registration of the permit, a valid underlying entitlement to park existed. The operator is requested to consider the permit and supporting evidence and distinguish the circumstances from a case involving a vehicle with no authority to use the parking facility.",
  },
  {
    id: "PP-AUTH-005",
    title: "Digital Permit / Vehicle Registration",
    trigger: "digital permit issue",
    category: "authorisation",
    priority: 228,
    active: true,
    text:
      "The parking authorisation operated through a digital permit or vehicle-registration system. The operator is requested to review the relevant electronic records for the vehicle and parking period and establish whether the vehicle was authorised at the material time. A failure to immediately match the vehicle against an automated record should not prevent the operator from properly investigating the underlying authorisation.",
  },
  {
    id: "PP-AUTH-006",
    title: "Visitor Authorisation",
    trigger: "visitor permission",
    category: "authorisation",
    priority: 230,
    active: true,
    text:
      "The vehicle was present as an authorised visitor. Permission to use the parking facility had been granted in connection with that visit. The operator is requested to review the visitor-parking records and the supporting evidence supplied and to cancel the charge where the vehicle's authority to park is confirmed.",
  },
  {
    id: "PP-AUTH-007",
    title: "Visitor Registration Error",
    trigger: "visitor permission + registration problem",
    category: "authorisation",
    priority: 232,
    active: true,
    text:
      "The vehicle had permission to park as a visitor, but an issue occurred with the process used to record or register that authorisation. The underlying permission to park nevertheless existed. The operator is requested to verify the visit and consider the evidence of authorisation rather than treating the vehicle as though no permission had been granted.",
  },
  {
    id: "PP-AUTH-008",
    title: "Genuine Customer",
    trigger: "customer-only location + genuine customer",
    category: "authorisation",
    priority: 234,
    active: true,
    text:
      "The vehicle's presence at the location was connected with a genuine visit to the premises for which the parking facility was provided. Evidence of that visit is supplied where available. The operator is requested to consider the genuine use of the premises and verify the circumstances with the relevant business or occupier before continuing enforcement.",
  },
  {
    id: "PP-AUTH-009",
    title: "Customer Evidence",
    trigger: "customer evidence uploaded",
    category: "authorisation",
    priority: 236,
    active: true,
    text:
      "Supporting evidence confirming the relevant visit to the premises is supplied with this appeal. The operator is requested to take that evidence into account and, where necessary, verify the visit with the business or occupier.",
  },
  {
    id: "PP-AUTH-010",
    title: "Evidence of Permission Supplied",
    trigger: "authorisation evidence uploaded",
    category: "authorisation",
    priority: 238,
    active: true,
    text:
      "Evidence supporting the vehicle's authority to park is enclosed with this appeal. The operator is required to consider that evidence when determining whether the alleged breach occurred. The charge should not be maintained on the basis that the vehicle was unauthorised without properly addressing the evidence demonstrating the underlying permission to park.",
  },
  {
    id: "PP-AUTH-011",
    title: "Operator Requested to Check Records",
    trigger: "authorised + operator likely holds records",
    category: "authorisation",
    priority: 240,
    active: true,
    text:
      "The operator is requested to check all relevant permit, whitelist, visitor and vehicle-registration records for the location and material period before determining this appeal. The absence of an immediately visible match should not substitute for a proper review of the records capable of confirming the vehicle's authorisation.",
  },

  // ---------- SIGNAGE ----------
  {
    id: "PP-SIGN-001",
    title: "Signage Inadequate",
    trigger: "credible signage issue",
    category: "signage",
    priority: 260,
    active: true,
    text:
      "The adequacy of the signage at the location is disputed. The parking operator is required to ensure that the applicable parking terms are communicated sufficiently clearly to motorists using the site. In the circumstances described in this appeal, the signage did not adequately bring the relevant parking terms to the attention of the motorist. The operator is requested to review the positioning, visibility and content of the signs in place at the material time.",
  },
  {
    id: "PP-SIGN-002",
    title: "Entrance Sign Not Sufficiently Visible",
    trigger: "entrance sign not visible/issue",
    category: "signage",
    priority: 262,
    active: true,
    text:
      "The parking terms were not adequately communicated on entry to the controlled land. No sufficiently prominent entrance signage was visible in the circumstances described. The operator is requested to demonstrate the signage that was actually in place at the entrance on the date of the alleged parking event, including its position, size and visibility from the approach used by the vehicle.",
  },
  {
    id: "PP-SIGN-003",
    title: "Entrance Sign Evidence Requested",
    trigger: "entrance sign disputed + operator evidence inadequate",
    category: "signage",
    priority: 264,
    active: true,
    text:
      "The operator is requested to provide contemporaneous evidence showing the entrance signage in place at the material time. Generic photographs or images taken on a different date do not, without further evidence, establish what signage was visible to a motorist entering the location on the date concerned.",
  },
  {
    id: "PP-SIGN-004",
    title: "Relevant Term Insufficiently Prominent",
    trigger: "relevant term unclear",
    category: "signage",
    priority: 266,
    active: true,
    text:
      "The particular term said to have been breached was not displayed with sufficient prominence or clarity to bring it adequately to the attention of a motorist using the location. The operator is requested to identify the precise contractual term relied upon and demonstrate where and how that term was communicated on the signage in place at the material time.",
  },
  {
    id: "PP-SIGN-005",
    title: "Parking Charge Insufficiently Prominent",
    trigger: "parking charge not prominent",
    category: "signage",
    priority: 268,
    active: true,
    text:
      "The amount of the parking charge was not displayed with sufficient prominence on the signage relied upon. Where an operator seeks to enforce a substantial parking charge as a contractual term, that charge must be brought adequately to the attention of the motorist. The operator is requested to provide clear evidence demonstrating the prominence of the parking charge on the relevant signage.",
  },
  {
    id: "PP-SIGN-006",
    title: "Signage Difficult to Read",
    trigger: "sign difficult to read",
    category: "signage",
    priority: 270,
    active: true,
    text:
      "The relevant signage was not reasonably legible in the circumstances. The positioning, size and/or presentation of the terms made them difficult to read before the alleged parking contract was said to have been formed. The operator is requested to demonstrate that the relevant terms were presented in a manner capable of being reasonably read and understood at the location.",
  },
  {
    id: "PP-SIGN-007",
    title: "Excessive or Dense Wording",
    trigger: "dense wording + evidence",
    category: "signage",
    priority: 272,
    active: true,
    text:
      "The signage contains a substantial amount of information presented in a manner that does not sufficiently highlight the term said to have been breached or the parking charge now sought. The operator is requested to demonstrate how the relevant contractual terms were sufficiently prominent within the overall presentation of the sign.",
  },
  {
    id: "PP-SIGN-008",
    title: "Sign Obscured",
    trigger: "sign obscured",
    category: "signage",
    priority: 274,
    active: true,
    text:
      "The relevant signage was obscured and was therefore not adequately visible in the circumstances of the parking event. The operator cannot simply rely upon the existence of a sign somewhere on the site without addressing whether that sign was actually capable of communicating the relevant terms to a motorist.",
  },
  {
    id: "PP-SIGN-009",
    title: "Sign Damaged or Deteriorated",
    trigger: "sign damaged",
    category: "signage",
    priority: 276,
    active: true,
    text:
      "The relevant signage was damaged, deteriorated or otherwise affected in a manner that reduced its legibility and ability to communicate the parking terms. The operator is requested to provide contemporaneous evidence showing the condition of the signage on the date of the alleged parking event.",
  },
  {
    id: "PP-SIGN-010",
    title: "Signage Not Adequately Visible in Lighting Conditions",
    trigger: "dark + poorly illuminated",
    category: "signage",
    priority: 278,
    active: true,
    text:
      "The parking event occurred during conditions in which adequate visibility of the signage depended upon appropriate positioning, illumination and/or reflective characteristics. The relevant terms were not sufficiently visible in those conditions. The operator is requested to provide evidence demonstrating how the signage appeared under substantially the same lighting conditions at the material time.",
  },
  {
    id: "PP-SIGN-011",
    title: "Conflicting or Inconsistent Terms",
    trigger: "conflicting signage",
    category: "signage",
    priority: 280,
    active: true,
    text:
      "The signage at the location communicated inconsistent or conflicting information concerning the applicable parking terms. In those circumstances, the terms relied upon by the operator were not communicated with sufficient clarity. The operator is requested to address the conflicting signage and explain which terms it alleges applied to the vehicle and why.",
  },
  {
    id: "PP-SIGN-012",
    title: "Alleged Breach Not Clearly Communicated",
    trigger: "specific alleged term unclear",
    category: "signage",
    priority: 282,
    active: true,
    text:
      "The operator relies upon an alleged breach of the following term: {{alleged_term}}. That particular restriction was not adequately communicated by the signage in the circumstances of the parking event. The operator is requested to identify the sign containing that restriction and demonstrate that it was positioned and presented sufficiently clearly to bring the term to the attention of motorists before the alleged breach occurred.",
  },
  {
    id: "PP-SIGN-013",
    title: "Customer Signage Evidence",
    trigger: "signage photos uploaded",
    category: "signage",
    priority: 284,
    active: true,
    text:
      "Photographic evidence concerning the signage at the location is supplied with this appeal. The operator is requested to consider that evidence when assessing whether the relevant parking terms were sufficiently visible and clearly communicated.",
  },

  // ---------- LANDOWNER ----------
  {
    id: "PP-LAND-001",
    title: "Operator's Authority to Operate",
    trigger: "initial authority challenge relevant",
    category: "landowner",
    priority: 300,
    active: true,
    text:
      "The operator is requested to establish that it had sufficient authority from the landowner or other party entitled to grant such authority to operate and enforce the parking scheme at the location on the date of the alleged parking event. The existence and scope of the operator's authority are relevant to its entitlement to issue and pursue the parking charge.",
  },
  {
    id: "PP-LAND-002",
    title: "Evidence of Current Authority Requested",
    trigger: "authority challenged",
    category: "landowner",
    priority: 302,
    active: true,
    text:
      "The operator is requested to provide evidence demonstrating that its authority was in force at the material time and applied to the location at which the Parking Charge Notice was issued. Evidence relating to a different location or a period that does not include the date of the alleged parking event would not establish the required authority for this particular charge.",
  },
  {
    id: "PP-LAND-003",
    title: "Scope of Enforcement Authority",
    trigger: "scope relevant",
    category: "landowner",
    priority: 304,
    active: true,
    text:
      "The operator is requested to establish the scope of the authority granted to it, including its entitlement to operate the parking scheme, issue Parking Charge Notices and pursue unpaid charges in the manner relied upon. The operator should demonstrate that the enforcement action taken in this case falls within the authority granted for the relevant land.",
  },
  {
    id: "PP-LAND-004",
    title: "Restrictions or Conditions on Authority",
    trigger: "relevant limitation indicated",
    category: "landowner",
    priority: 306,
    active: true,
    text:
      "Where the operator's authority is subject to restrictions, conditions or limitations, it is requested to demonstrate that the circumstances of this parking charge fall within the scope of the authority actually granted. The existence of a parking-management arrangement does not, without examining its scope, establish that every form of enforcement is authorised in every circumstance.",
  },
  {
    id: "PP-LAND-005",
    title: "Relevant Land / Location Must Match",
    trigger: "location discrepancy",
    category: "landowner",
    priority: 308,
    active: true,
    text:
      "The operator must establish that any authority relied upon relates to the specific land on which the alleged parking event occurred. The operator is requested to identify the land covered by its authority and demonstrate that the location stated on Parking Charge Notice {{pcn_number}} falls within that area.",
  },
  {
    id: "PP-LAND-006",
    title: "Authority at Material Date",
    trigger: "contract date issue",
    category: "landowner",
    priority: 310,
    active: true,
    text:
      "Any evidence of authority relied upon must demonstrate that the operator's authority was in force on {{parking_event_date}}. A document establishing authority during an earlier or later period does not, without evidence of continuation or renewal, establish that the operator had the necessary authority at the material time.",
  },
  {
    id: "PP-LAND-007",
    title: "Expired Agreement",
    trigger: "expiry established + no continuation evidence",
    category: "landowner",
    priority: 312,
    active: true,
    text:
      "The evidence provided does not establish that the operator's authority remained in force on the date of the alleged parking event. The agreement relied upon appears to have expired before the material date, and no evidence of a valid renewal, extension or replacement authority has been provided. The operator is therefore required to establish the contractual basis upon which it says it remained authorised to operate and enforce at the location.",
  },
  {
    id: "PP-LAND-008",
    title: "Redacted Authority Evidence",
    trigger: "redactions prevent material verification",
    category: "landowner",
    priority: 314,
    active: true,
    text:
      "The evidence of authority supplied is redacted to an extent that prevents proper verification of material matters relevant to this case. In particular, the evidence must be sufficient to establish the relevant parties, land, period of authority and scope of the operator's enforcement powers. The operator is requested to provide sufficient evidence to establish those matters.",
  },
  {
    id: "PP-LAND-009",
    title: "Authority of Contracting Party",
    trigger: "grantor authority reasonably questioned",
    category: "landowner",
    priority: 316,
    active: true,
    text:
      "The operator is requested to establish that the party from whom it obtained authority was entitled to grant the parking-management and enforcement rights relied upon. Where the operator does not contract directly with the landowner, it should establish the chain of authority upon which it relies.",
  },

  // ---------- EVIDENCE ----------
  {
    id: "PP-EV-001",
    title: "Supporting Evidence Enclosed",
    trigger: "evidence uploaded",
    category: "evidence",
    priority: 400,
    active: true,
    text:
      "Supporting evidence is enclosed with this appeal and should be considered together with the factual circumstances and the operator's own records before a decision is made.",
  },

  // ---------- CLOSING ----------
  {
    id: "PP-END-001",
    title: "Cancellation Requested",
    trigger: "final assembly",
    category: "closing",
    priority: 900,
    active: true,
    text:
      "For the reasons set out above, the parking charge is disputed and the operator is requested to cancel Parking Charge Notice {{pcn_number}}.",
  },
  {
    id: "PP-END-002",
    title: "Reasons and Evidence if Rejected",
    trigger: "configured rejection request",
    category: "closing",
    priority: 902,
    active: true,
    text:
      "If the operator is not prepared to cancel the charge, it is requested to provide a clear response addressing the specific grounds raised and the evidence relied upon in reaching its decision.",
  },
  {
    id: "PP-END-003",
    title: "Independent Appeal Details",
    trigger: "independent route available",
    category: "closing",
    priority: 904,
    active: true,
    text:
      "If the appeal is rejected, please provide the appropriate information and reference required to pursue the matter through the applicable independent appeal process.",
  },
];

export function findParagraph(id: string): Paragraph | undefined {
  return PARAGRAPH_LIBRARY.find((p) => p.id === id && p.active);
}

export function findParagraphsByTrigger(trigger: string): Paragraph[] {
  return PARAGRAPH_LIBRARY.filter((p) => p.active && p.trigger === trigger);
}
