/**
 * Parking Appeals Group Terms and Conditions — TERMS_2026_09.
 *
 * Reproduced verbatim from the client's supplied Terms and Conditions
 * (last updated September 2026). Sections 1–29 only: the "DEVELOPER
 * CHECKOUT WORDING" appendix in the source document is implementation
 * guidance, not customer-facing terms, and is implemented in the
 * checkout consent component rather than shown here.
 *
 * This file is immutable once ACTIVE. A change to the wording is a new
 * version module, never an edit here — historical purchases record this
 * identifier and must keep rendering the text that was actually agreed.
 */
import type { LegalDocumentVersion } from "@/lib/legal/types";

export const TERMS_2026_09: LegalDocumentVersion = {
  documentId: "TERMS",
  version: "TERMS_2026_09",
  status: "ACTIVE",
  effectiveFrom: "2026-09-01",
  effectiveTo: null,
  title: "Terms and Conditions",
  lastUpdatedLabel: "September 2026",
  preamble: [
    {
      kind: "p",
      text: "These Terms and Conditions govern the purchase and use of services provided through the Parking Appeals Group website. Please read them carefully before purchasing a service. By placing an order, you confirm that you have read and agreed to these Terms and Conditions.",
    },
  ],
  sections: [
    {
      number: 1,
      heading: "ABOUT US",
      blocks: [
        {
          kind: "p",
          text: "Parking Appeals Group is operated by The Parking Appeals Group Limited.",
        },
        {
          kind: "lines",
          label: "Business address:",
          lines: [
            "Office 1275",
            "12 Farwig Lane",
            "Bromley",
            "BR1 3RB",
            "United Kingdom",
          ],
        },
        {
          kind: "lines",
          lines: [
            "Email: info@parkingappealsgroup.co.uk",
            "Website: parkingappealsgroup.co.uk",
          ],
        },
        {
          kind: "p",
          text: "We provide parking appeal assistance, document preparation, procedural assistance and related support services. Our services are divided into three main categories: Self-Service Services (Council PCN Appeal, Private Parking Charge Appeal and Charge Certificate Challenge); Order for Recovery Assistance; and Expert Help, including assistance with certain County Court claims, CCJs, enforcement matters and other agreed casework.",
        },
      ],
    },
    {
      number: 2,
      heading: "OUR SERVICES",
      blocks: [
        {
          kind: "p",
          text: "The exact service provided depends upon the product purchased. Customers must carefully read the description of the relevant service before making payment.",
        },
        {
          kind: "p",
          text: "Purchasing one service does not automatically include assistance with later stages of the same matter. For example, purchasing a Self-Service Appeal does not automatically include tribunal representation, assistance with an Order for Recovery, enforcement proceedings, a County Court claim or a subsequent CCJ. Where additional assistance is required, a separate service and fee may apply.",
        },
      ],
    },
    {
      number: 3,
      heading: "SELF-SERVICE SERVICES",
      blocks: [
        {
          kind: "p",
          text: "Parking Appeals Group provides automated Self-Service Services that allow customers to provide information and documents relating to their case and receive a document generated for their circumstances.",
        },
        {
          kind: "products",
          items: [
            {
              title: "Council PCN Appeal - £11.99",
              detail: "For eligible council-issued Penalty Charge Notices.",
            },
            {
              title: "Private Parking Charge Appeal - £11.99",
              detail: "For eligible private parking charges.",
            },
            {
              title: "Charge Certificate Challenge - £4.99",
              detail:
                "For customers who have received a Charge Certificate and whose circumstances are suitable for this service.",
            },
          ],
        },
        {
          kind: "p",
          text: "The customer will be asked to upload the relevant notice and provide information about their circumstances. Our system may analyse the documents provided, identify the type and stage of the case, identify potentially relevant grounds and ask further questions before generating the appropriate document.",
        },
        {
          kind: "p",
          text: "The document generated will be based upon the documents and information supplied by the customer.",
        },
        {
          kind: "p",
          text: "Unless expressly stated otherwise, a Self-Service Service provides the customer with the completed document only. The customer is responsible for submitting the document to the relevant council, private parking operator or other appropriate recipient.",
        },
        {
          kind: "p",
          text: "Purchasing or generating a Self-Service document does not itself place a PCN, parking charge or enforcement process on hold and does not extend any applicable deadline.",
        },
      ],
    },
    {
      number: 4,
      heading: "DOCUMENTS AND INFORMATION",
      blocks: [
        {
          kind: "p",
          text: "Customers must provide complete, accurate and truthful information. Where requested, customers must upload both the front and back of the parking notice.",
        },
        {
          kind: "p",
          text: "Customers must disclose relevant information requested during the process, including previous appeals or representations, correspondence received, relevant dates and other notices received.",
        },
        {
          kind: "p",
          text: "The accuracy and suitability of the generated document depends upon the information and documents supplied by the customer. Parking Appeals Group is not responsible for an error or omission in a generated document to the extent that it results from materially inaccurate, misleading or incomplete information supplied by the customer.",
        },
        {
          kind: "p",
          text: "Customers should review their generated document, including names, addresses, vehicle details and factual information, before submitting it.",
        },
      ],
    },
    {
      number: 5,
      heading: "PRIVATE PARKING APPEALS",
      blocks: [
        {
          kind: "p",
          text: "Private parking charges are different from council-issued Penalty Charge Notices and are subject to different procedures. Customers must answer the questions presented during the Self-Service process accurately.",
        },
        {
          kind: "p",
          text: "Where the service asks questions concerning the registered keeper, driver, vehicle hire or other relevant circumstances, the customer must provide accurate information. Customers should not volunteer the identity of the driver unless specifically required or advised to do so.",
        },
        {
          kind: "p",
          text: "The system may determine that a notice is unsuitable for the standard Self-Service Appeal process. Where this occurs, the process may be stopped and the customer may be directed towards another service or informed that the ordinary appeal stage has passed.",
        },
      ],
    },
    {
      number: 6,
      heading: "CHARGE CERTIFICATE CHALLENGE",
      blocks: [
        {
          kind: "p",
          text: "The Charge Certificate Challenge is a Self-Service Service costing £4.99.",
        },
        {
          kind: "p",
          text: "A Charge Certificate generally indicates that a council enforcement case has progressed beyond the ordinary appeal or representation stage. The Charge Certificate Challenge does not represent that a Charge Certificate carries an ordinary statutory right of appeal.",
        },
        {
          kind: "p",
          text: "The service is designed to assist customers whose circumstances may justify an appropriate request or challenge. This may include circumstances where the customer states that the original PCN or relevant notice was not received; representations or an appeal were made but no response was received; or another relevant procedural issue applies.",
        },
        {
          kind: "p",
          text: "Depending upon the stage reached, the customer may need to wait for an Order for Recovery or use another statutory procedure. The system may therefore identify that an immediate challenge is not appropriate and provide information about the appropriate next stage.",
        },
      ],
    },
    {
      number: 7,
      heading: "DOCUMENTS OUTSIDE THE APPEAL STAGE",
      blocks: [
        {
          kind: "p",
          text: "Our Self-Service system is intended to identify, where reasonably possible, whether the document uploaded is suitable for the service selected. For example, a private parking debt recovery letter may indicate that the ordinary appeal stage has already passed.",
        },
        {
          kind: "p",
          text: "Where the system identifies that the uploaded document is outside the scope of the selected Self-Service Service, the process may be stopped. The customer may instead be directed towards another service or provided with information about the appropriate next stage.",
        },
        {
          kind: "p",
          text: "Parking Appeals Group will not knowingly generate an inappropriate appeal merely because a customer initially selected an appeal product.",
        },
      ],
    },
    {
      number: 8,
      heading: "ORDER FOR RECOVERY SERVICE",
      blocks: [
        {
          kind: "p",
          text: "Our Order for Recovery service costs £30 and assists customers who have reached the Order for Recovery stage of an eligible traffic enforcement matter.",
        },
        {
          kind: "p",
          text: "Depending upon the type of case and the customer's circumstances, the applicable procedure may involve forms including TE7 and TE9 or PE2 and PE3. Eligibility depends upon the circumstances and procedural stage of the individual case.",
        },
        {
          kind: "p",
          text: "Customers must provide all requested information and documentation and must answer all questions truthfully.",
        },
        {
          kind: "p",
          text: "Where an application involves a witness statement, statutory declaration, statement of truth or other formal declaration, the customer is responsible for ensuring that the facts stated are true.",
        },
        {
          kind: "p",
          text: "Parking Appeals Group will not knowingly prepare or submit information which we believe to be false or misleading.",
        },
        {
          kind: "p",
          text: "The service does not guarantee that an application will be accepted by the Traffic Enforcement Centre, relevant authority or court.",
        },
        {
          kind: "p",
          text: "Where the applicable deadline has expired or the matter has progressed beyond the scope of the service purchased, an additional procedure or different service may be required.",
        },
      ],
    },
    {
      number: 9,
      heading: "DEADLINES",
      blocks: [
        {
          kind: "p",
          text: "Parking, enforcement and court matters can be subject to strict deadlines. Customers are responsible for providing documents promptly and accurately identifying any known deadline.",
        },
        {
          kind: "p",
          text: "Purchasing a service from Parking Appeals Group does not, by itself, stop, suspend or extend any statutory, court, enforcement or appeal deadline.",
        },
        {
          kind: "p",
          text: "Where a service is Self-Service, the customer remains responsible for submitting the completed document within the applicable deadline. We may decline to accept or continue a service where insufficient time remains for us reasonably to provide it.",
        },
      ],
    },
    {
      number: 10,
      heading: "EXPERT HELP",
      blocks: [
        {
          kind: "p",
          text: "Parking Appeals Group provides Expert Help for selected matters. These may include private parking County Court claims; CCJ and set-aside assistance; bailiff and enforcement matters; complex parking matters; and other casework expressly agreed with the customer.",
        },
        {
          kind: "p",
          text: "Expert Help is separate from our Self-Service Services and Order for Recovery service. The scope of the work and applicable fee will be communicated to the customer before the service is purchased or work begins. Additional work outside the agreed scope may require a further fee.",
        },
      ],
    },
    {
      number: 11,
      heading: "COUNTY COURT CLAIM ASSISTANCE",
      blocks: [
        {
          kind: "p",
          text: "Where specifically agreed, County Court claim assistance may include some or all of the following: Acknowledgment of Service; preparation and filing of a defence; assistance with the N180 Directions Questionnaire; preparation of a witness statement; preparation of a skeleton argument; and arranging court attendance or representation where required and agreed.",
        },
        {
          kind: "p",
          text: "The exact scope of the service will be confirmed with the customer. A claim may be discontinued, settled, struck out or otherwise concluded before a final hearing. No particular outcome can be guaranteed.",
        },
        {
          kind: "p",
          text: "Court fees, hearing fees, advocate or barrister fees, expert fees and other third-party costs are not included unless expressly confirmed otherwise.",
        },
      ],
    },
    {
      number: 12,
      heading: "CCJ AND SET-ASIDE ASSISTANCE",
      blocks: [
        {
          kind: "p",
          text: "Where Parking Appeals Group agrees to assist with a County Court Judgment or set-aside application, the customer must provide accurate information and all relevant documents, including the correct claim number and court documentation where required.",
        },
        {
          kind: "p",
          text: "Parking Appeals Group service fees are separate from court application fees unless expressly stated otherwise. Eligibility for Help with Fees is determined under the applicable court scheme.",
        },
        {
          kind: "p",
          text: "Parking Appeals Group cannot guarantee that a judgment will be set aside or removed from a customer's credit record. The final decision rests with the court.",
        },
      ],
    },
    {
      number: 13,
      heading: "BAILIFF AND ENFORCEMENT ASSISTANCE",
      blocks: [
        {
          kind: "p",
          text: "Where Expert Help relates to bailiff or enforcement action, the exact scope of our involvement will be confirmed with the customer. Purchasing assistance does not itself suspend enforcement.",
        },
        {
          kind: "p",
          text: "Only the relevant authority, court, enforcement body or other person with the necessary authority can formally suspend enforcement. Customers should continue to treat enforcement correspondence and deadlines as urgent unless they receive confirmation that enforcement has been placed on hold.",
        },
      ],
    },
    {
      number: 14,
      heading: "NO GUARANTEE OF OUTCOME",
      blocks: [
        {
          kind: "p",
          text: "Parking Appeals Group cannot guarantee cancellation of a PCN or private parking charge; acceptance of an appeal or representation; acceptance of an Order for Recovery application; suspension of enforcement; cancellation of bailiff action; removal or setting aside of a CCJ; discontinuance or strike-out of a County Court claim; or any particular decision by a council, private parking operator, tribunal, Traffic Enforcement Centre or court.",
        },
        {
          kind: "p",
          text: "Decisions made by third parties are outside our control.",
        },
      ],
    },
    {
      number: 15,
      heading: "PRICES AND PAYMENT",
      blocks: [
        {
          kind: "p",
          text: "The applicable price will be displayed before payment.",
        },
        {
          kind: "lines",
          lines: [
            "Council PCN Appeal - £11.99",
            "Private Parking Charge Appeal - £11.99",
            "Charge Certificate Challenge - £4.99",
            "Order for Recovery - £30",
          ],
        },
        {
          kind: "p",
          text: "Expert Help prices vary depending upon the service required and will be displayed or communicated before purchase. Where additional work is required beyond the scope of the service originally purchased, the customer will be informed of the additional service and fee before chargeable additional work is undertaken.",
        },
      ],
    },
    {
      number: 16,
      heading: "SELF-SERVICE SERVICES - IMMEDIATE SUPPLY AND CANCELLATION",
      blocks: [
        {
          kind: "p",
          text: "Our Self-Service Services are the Council PCN Appeal, Private Parking Charge Appeal and Charge Certificate Challenge. These products are designed to provide the customer with a personalised digital document promptly following completion of the online process and payment.",
        },
        {
          kind: "p",
          text: "Before purchasing a Self-Service Service, the customer will be required to confirm that the information and documents provided are complete and accurate; confirm agreement to these Terms and Conditions and the Privacy Policy; expressly consent to immediate supply of the personalised digital content before the end of the usual 14-day cancellation period; and acknowledge that once supply of the digital content has begun following that consent, the statutory right to cancel the contract will be lost.",
        },
        {
          kind: "p",
          text: "The customer will not be permitted to complete the Self-Service purchase unless the required confirmations and consent have been actively provided. The relevant checkboxes will not be pre-selected.",
        },
        {
          kind: "p",
          text: "Once the customer has provided the required consent and acknowledgement, completed payment and supply of the personalised digital content has begun, the customer will lose the statutory right to cancel that Self-Service purchase in accordance with applicable consumer law.",
        },
        {
          kind: "p",
          text: "This does not affect the customer's rights where the digital content is faulty, does not conform to the contract or where the customer otherwise has a statutory remedy.",
        },
      ],
    },
    {
      number: 17,
      heading: "SELF-SERVICE REFUNDS",
      blocks: [
        {
          kind: "p",
          text: "Because our Self-Service Services are designed to generate and supply personalised digital content promptly after payment, a customer who has expressly consented to immediate supply and acknowledged the loss of their cancellation right will not ordinarily be entitled to cancel simply because they have changed their mind after supply has begun.",
        },
        {
          kind: "p",
          text: "A customer is not entitled to a refund solely because a council rejects an appeal or representation; a private parking operator rejects an appeal; a Charge Certificate challenge does not produce the outcome sought; the customer subsequently decides not to submit the generated document; or the customer disagrees with a decision subsequently made by a council, parking operator or other third party.",
        },
        {
          kind: "p",
          text: "Nothing in these Terms excludes the customer's statutory rights. If the digital content is faulty, materially different from what was described or otherwise does not meet applicable statutory requirements, the customer should contact info@parkingappealsgroup.co.uk.",
        },
      ],
    },
    {
      number: 18,
      heading: "ORDER FOR RECOVERY AND EXPERT HELP - CANCELLATION",
      blocks: [
        {
          kind: "p",
          text: "Order for Recovery and Expert Help involve services which may require work to begin shortly after purchase or instruction, particularly where a statutory or court deadline applies.",
        },
        {
          kind: "p",
          text: "Where a customer asks us to begin providing a service during the statutory cancellation period, we may require the customer to expressly request immediate commencement of the service.",
        },
        {
          kind: "p",
          text: "If the customer subsequently exercises a statutory right to cancel before the service has been fully performed, the customer may be required, where permitted by law, to pay an amount proportionate to the work properly carried out up to the point of cancellation.",
        },
        {
          kind: "p",
          text: "Where the service has been fully performed during the cancellation period following the customer's express request for immediate performance and the customer has provided any acknowledgement required by law, the statutory right to cancel may be lost.",
        },
        {
          kind: "p",
          text: "Nothing in these Terms affects cancellation or refund rights which cannot legally be excluded.",
        },
      ],
    },
    {
      number: 19,
      heading: "OUTCOMES AND REFUNDS",
      blocks: [
        {
          kind: "p",
          text: "Payment is for the service purchased and not for a guaranteed result. An unsuccessful outcome does not, by itself, mean that the service was defective.",
        },
        {
          kind: "p",
          text: "A customer will not automatically be entitled to a refund merely because a PCN or parking charge is not cancelled; an appeal or representation is rejected; an Order for Recovery application is unsuccessful; enforcement continues; a CCJ is not set aside; a claim is not discontinued or struck out; proceedings continue to a hearing; or a court, tribunal, authority or other third party reaches a decision with which the customer disagrees.",
        },
        {
          kind: "p",
          text: "This does not affect any statutory remedy available where Parking Appeals Group has failed to provide the purchased service with reasonable care and skill or has otherwise breached the customer's statutory rights.",
        },
      ],
    },
    {
      number: 20,
      heading: "CUSTOMER RESPONSIBILITIES",
      blocks: [
        {
          kind: "p",
          text: "Customers are responsible for supplying truthful and accurate information; providing complete and legible documents; providing both sides of a notice where requested; checking personal and factual information within generated documents; informing us of relevant deadlines; disclosing previous appeals, representations and correspondence when requested; reading subsequent correspondence; responding promptly to requests for additional information; and submitting Self-Service documents where submission is not included.",
        },
        {
          kind: "p",
          text: "Customers must not use our services to submit information which they know to be false or misleading.",
        },
      ],
    },
    {
      number: 21,
      heading: "OUR RESPONSIBILITIES",
      blocks: [
        {
          kind: "p",
          text: "We will provide our services with reasonable care and skill. Nothing in these Terms seeks to exclude or restrict liability or consumer rights where doing so would be unlawful.",
        },
      ],
    },
    {
      number: 22,
      heading: "THIRD-PARTY DECISIONS AND DELAYS",
      blocks: [
        {
          kind: "p",
          text: "Parking Appeals Group does not control the decisions or processing times of councils, private parking operators, debt recovery companies, enforcement agents, the Traffic Enforcement Centre, HM Courts & Tribunals Service, tribunals or other third parties. Any third-party timescale provided by us is an estimate unless expressly stated otherwise.",
        },
      ],
    },
    {
      number: 23,
      heading: "WEBSITE AND TECHNOLOGY",
      blocks: [
        {
          kind: "p",
          text: "We take reasonable steps to maintain the operation and availability of our website and online services. We cannot guarantee uninterrupted availability at all times.",
        },
        {
          kind: "p",
          text: "Customers experiencing a technical issue affecting an imminent deadline should contact us promptly and should not assume that a deadline has been extended because of a website, payment or technical issue.",
        },
      ],
    },
    {
      number: 24,
      heading: "INTELLECTUAL PROPERTY",
      blocks: [
        {
          kind: "p",
          text: "Our website content, templates, written materials, branding and proprietary processes belong to Parking Appeals Group or the applicable rights holder.",
        },
        {
          kind: "p",
          text: "Documents generated specifically for a customer's case may be used by that customer for the purpose for which they were supplied. Customers must not reproduce, resell, commercially distribute or systematically copy our templates, systems or website content without permission.",
        },
      ],
    },
    {
      number: 25,
      heading: "PERSONAL DATA",
      blocks: [
        {
          kind: "p",
          text: "We process personal information in accordance with our Privacy Policy. Customers may provide information including names, addresses, vehicle registration details, parking notices, correspondence and court or enforcement documents. Customers should review our Privacy Policy before providing personal information.",
        },
      ],
    },
    {
      number: 26,
      heading: "COMPLAINTS",
      blocks: [
        {
          kind: "p",
          text: "Customers who are dissatisfied with a service should contact us at info@parkingappealsgroup.co.uk, providing their name, relevant reference number and sufficient information for us to identify and investigate the matter. We will consider complaints fairly and respond within a reasonable period.",
        },
      ],
    },
    {
      number: 27,
      heading: "CHANGES TO THESE TERMS",
      blocks: [
        {
          kind: "p",
          text: "We may update these Terms and Conditions from time to time, including where our services, website or applicable legal requirements change. The Terms applicable to an order will normally be those in force when the customer placed the order.",
        },
      ],
    },
    {
      number: 28,
      heading: "GOVERNING LAW",
      blocks: [
        {
          kind: "p",
          text: "These Terms and Conditions are governed by the laws of England and Wales. Nothing in these Terms affects any mandatory rights a consumer may have to bring proceedings elsewhere in the United Kingdom where applicable.",
        },
      ],
    },
    {
      number: 29,
      heading: "CONTACT US",
      blocks: [
        {
          kind: "lines",
          lines: [
            "The Parking Appeals Group Limited",
            "Office 1275, 12 Farwig Lane, Bromley, BR1 3RB, United Kingdom",
            "Email: info@parkingappealsgroup.co.uk",
            "Website: parkingappealsgroup.co.uk",
          ],
        },
      ],
    },
  ],
};
