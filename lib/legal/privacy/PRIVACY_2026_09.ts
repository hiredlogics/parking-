/**
 * Privacy Policy — PRIVACY_2026_09.
 *
 * Every factual statement below is grounded in what this codebase
 * actually does, not in a template:
 *
 *   account fields          `clients` (lib/db/schema.ts)
 *   case and notice data    `appeal_cases`, `case_facts`, `case_documents_meta`
 *   document storage        private S3-compatible bucket (services/storage)
 *   database                Neon Postgres (lib/db/pool.ts)
 *   AI processing           OpenAI, for reading/classifying/drafting only —
 *                           never for the legal decision (rules/engine.ts)
 *   payments                Stripe (lib/payments/providers/stripe.ts)
 *   email                   SMTP via nodemailer (lib/email)
 *   session                 encrypted cookie via iron-session
 *   passwords               hashed with bcryptjs (`clients.password_hash`)
 *   consent record          `purchase_consents` (lib/db/consentSchema.ts)
 *
 * Two things are deliberately principle-based rather than specific,
 * because they are business decisions this codebase cannot observe and
 * inventing them would be worse than stating the principle: the concrete
 * retention schedule (section 7) and the transfer safeguard actually
 * relied on (section 6). Both are flagged in HANDOVER notes.
 *
 * Immutable once served. New wording is a new PRIVACY_<date> module.
 */
import type { LegalDocumentVersion } from "@/lib/legal/types";

export const PRIVACY_2026_09: LegalDocumentVersion = {
  documentId: "PRIVACY",
  version: "PRIVACY_2026_09",
  status: "ACTIVE",
  effectiveFrom: "2026-09-01",
  effectiveTo: null,
  title: "Privacy Policy",
  lastUpdatedLabel: "September 2026",
  preamble: [
    {
      kind: "p",
      text: "This Privacy Policy explains what personal information The Parking Appeals Group Limited collects when you use the Parking Appeals Group website, why we collect it, who we share it with and what rights you have. It should be read alongside our Terms and Conditions.",
    },
  ],
  sections: [
    {
      number: 1,
      heading: "WHO WE ARE",
      blocks: [
        {
          kind: "p",
          text: "Parking Appeals Group is operated by The Parking Appeals Group Limited, which is the data controller for the personal information described in this policy.",
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
      ],
    },
    {
      number: 2,
      heading: "INFORMATION WE COLLECT",
      blocks: [
        {
          kind: "p",
          text: "We collect the following categories of personal information.",
        },
        {
          kind: "products",
          items: [
            {
              title: "Account information",
              detail:
                "Your name, email address and password. Your password is stored only as a cryptographic hash and is never stored or transmitted in readable form. You may also provide a telephone number and postal address.",
            },
            {
              title: "Parking notice information",
              detail:
                "The parking charge notice or penalty charge notice you upload, together with the details read from it, including the operator or council name, the notice reference, the vehicle registration mark, the date and location of the parking event and the amount charged.",
            },
            {
              title: "Case information you provide",
              detail:
                "Your answers about the circumstances of the parking event, the registered keeper's name and address, and any supporting evidence you choose to upload, such as payment receipts, permits, tenancy or lease documents and photographs.",
            },
            {
              title: "Documents we generate",
              detail:
                "The appeal or challenge document produced for your case, the accompanying submission instructions and the record of which grounds were argued.",
            },
            {
              title: "Purchase and consent records",
              detail:
                "The service purchased, the payment reference, and a record of the confirmations you gave before payment, including the version of these policies you agreed to and the date and time you agreed.",
            },
            {
              title: "Technical information",
              detail:
                "Your IP address and browser user agent at the point of purchase, recorded as part of the consent record, and the information needed to keep you signed in.",
            },
          ],
        },
        {
          kind: "p",
          text: "You should only upload documents and information that are relevant to your case. Please do not upload medical records or other special category information unless it is genuinely necessary to the circumstances you are relying on.",
        },
      ],
    },
    {
      number: 3,
      heading: "WHY WE USE IT, AND OUR LEGAL BASIS",
      blocks: [
        {
          kind: "products",
          items: [
            {
              title: "To provide the service you bought — performance of a contract",
              detail:
                "Reading your notice, identifying the grounds that may apply, generating your document, making it available to you and emailing it to you.",
            },
            {
              title: "To create and operate your account — performance of a contract",
              detail:
                "Signing you in, showing you your cases and documents, and allowing you to reset your password.",
            },
            {
              title: "To take payment — performance of a contract",
              detail:
                "Processing your purchase through our payment provider and keeping a record of it.",
            },
            {
              title: "To keep a record of your consent — legal obligation and our legitimate interests",
              detail:
                "Consumer law requires us to be able to show that you consented to immediate supply of your document and acknowledged the effect on your cancellation rights. We keep that record so we can demonstrate it.",
            },
            {
              title: "To keep the service secure and prevent misuse — legitimate interests",
              detail:
                "Rate limiting, checking that a case belongs to the account requesting it, and investigating suspected fraud or abuse.",
            },
            {
              title: "To handle complaints and enquiries — legitimate interests",
              detail:
                "Identifying your case and responding to you.",
            },
          ],
        },
      ],
    },
    {
      number: 4,
      heading: "AUTOMATED PROCESSING AND ARTIFICIAL INTELLIGENCE",
      blocks: [
        {
          kind: "p",
          text: "We use automated processing, including artificial intelligence, in three specific places: to read the notice you upload and extract its details; to classify the type and stage of the document so we can tell whether the service you selected is suitable; and to draft the wording of your document from a controlled library of approved legal material.",
        },
        {
          kind: "p",
          text: "Which legal grounds apply to your case is decided by a fixed set of rules, not by the artificial intelligence. The AI may only draw on legal material that those rules have already approved for your circumstances, and it is not permitted to invent facts, evidence, law or dates.",
        },
        {
          kind: "p",
          text: "You are shown the details read from your notice and asked to confirm or correct them before they are used. Automated processing may stop the process where the document you uploaded is not suitable for the service selected, in which case you will be told and directed to the appropriate next stage. No automated decision is taken that has a legal effect on you comparable to a decision by a council, parking operator, tribunal or court; those decisions are taken by those third parties, not by us.",
        },
        {
          kind: "p",
          text: "If you would like a human to review how your case was handled, contact us at info@parkingappealsgroup.co.uk.",
        },
      ],
    },
    {
      number: 5,
      heading: "WHO WE SHARE IT WITH",
      blocks: [
        {
          kind: "p",
          text: "We do not sell your personal information. We share it only with the service providers we need in order to run the service, and only to the extent necessary.",
        },
        {
          kind: "products",
          items: [
            {
              title: "Artificial intelligence provider",
              detail:
                "OpenAI, to read the notice you upload, classify the document and draft your document. Your uploaded notice and the case details relevant to drafting are sent for this purpose.",
            },
            {
              title: "Database and hosting providers",
              detail:
                "Our managed Postgres database provider and our application hosting provider, which store and serve your account and case data.",
            },
            {
              title: "Document storage provider",
              detail:
                "An S3-compatible object storage provider, which holds your uploaded notice, your evidence and your generated documents in a private bucket that is not publicly accessible.",
            },
            {
              title: "Payment provider",
              detail:
                "Stripe, which processes your payment. Your card details are entered with Stripe and are not stored by us.",
            },
            {
              title: "Email provider",
              detail:
                "Our email delivery provider, which sends your document and service emails to you.",
            },
          ],
        },
        {
          kind: "p",
          text: "We may also disclose personal information where we are required to do so by law, or where it is necessary to establish, exercise or defend legal claims.",
        },
        {
          kind: "p",
          text: "We do not send your appeal to the council, parking operator or other recipient on your behalf unless the service you purchased expressly says so. Where a Self-Service document is supplied to you, you submit it yourself.",
        },
      ],
    },
    {
      number: 6,
      heading: "INTERNATIONAL TRANSFERS",
      blocks: [
        {
          kind: "p",
          text: "Some of our service providers, including our payment provider and our artificial intelligence provider, are based outside the United Kingdom or process data outside the United Kingdom. Where personal information is transferred outside the UK, we rely on a transfer mechanism recognised under UK data protection law, such as UK adequacy regulations or the International Data Transfer Agreement or Addendum, together with appropriate additional safeguards.",
        },
        {
          kind: "p",
          text: "You may ask us for further information about the safeguards applying to a particular transfer by writing to info@parkingappealsgroup.co.uk.",
        },
      ],
    },
    {
      number: 7,
      heading: "HOW LONG WE KEEP IT",
      blocks: [
        {
          kind: "p",
          text: "We keep personal information only for as long as we need it for the purposes described in this policy, and then for as long as we are required to keep it by law or need it to establish, exercise or defend legal claims.",
        },
        {
          kind: "p",
          text: "In practice this means your account information is kept while your account remains open; your case information and generated documents are kept so that you can access them from your account and so that we can answer any query or complaint about the service we provided; records of your purchase and the consent you gave are kept for as long as we may need to demonstrate them; and financial records are kept for the period required by tax and accounting law.",
        },
        {
          kind: "p",
          text: "You may ask us to delete your account and the information associated with it. Where we are required to retain certain records, we will tell you what we must keep and why. You can request details of the retention periods we apply by writing to info@parkingappealsgroup.co.uk.",
        },
      ],
    },
    {
      number: 8,
      heading: "SECURITY",
      blocks: [
        {
          kind: "p",
          text: "We take reasonable technical and organisational measures to protect your personal information. Passwords are stored only as cryptographic hashes. Your documents are held in private object storage that is not publicly accessible, and are served only through requests that first verify the case belongs to your account. Your sign-in session is held in an encrypted cookie. Requests that could be abused are rate limited.",
        },
        {
          kind: "p",
          text: "No online service can be completely secure. If you believe your account has been accessed without your permission, contact us immediately at info@parkingappealsgroup.co.uk.",
        },
      ],
    },
    {
      number: 9,
      heading: "COOKIES AND SIMILAR TECHNOLOGIES",
      blocks: [
        {
          kind: "p",
          text: "We use a strictly necessary cookie to keep you signed in and to protect your session. This cookie is required for the service to work and cannot be turned off through the site. We do not use advertising cookies.",
        },
      ],
    },
    {
      number: 10,
      heading: "YOUR RIGHTS",
      blocks: [
        {
          kind: "p",
          text: "Under UK data protection law you have the right to be informed about how your personal information is used; to request a copy of it; to have inaccurate information corrected; to request erasure in certain circumstances; to restrict or object to certain processing; to receive information you provided to us in a portable format; and, where processing is based on consent, to withdraw that consent at any time.",
        },
        {
          kind: "p",
          text: "Withdrawing the consent you gave at checkout does not undo a document that has already been supplied to you, and does not by itself entitle you to a refund. Your statutory rights in respect of faulty digital content are unaffected, as explained in our Terms and Conditions.",
        },
        {
          kind: "p",
          text: "To exercise any of these rights, write to info@parkingappealsgroup.co.uk. We will respond within the period required by law. We may need to verify your identity before acting on a request.",
        },
      ],
    },
    {
      number: 11,
      heading: "COMPLAINTS",
      blocks: [
        {
          kind: "p",
          text: "If you are unhappy with how we have handled your personal information, please contact us first at info@parkingappealsgroup.co.uk so that we can try to put it right.",
        },
        {
          kind: "p",
          text: "You also have the right to complain to the Information Commissioner's Office, the UK supervisory authority for data protection, at ico.org.uk.",
        },
      ],
    },
    {
      number: 12,
      heading: "CHANGES TO THIS POLICY",
      blocks: [
        {
          kind: "p",
          text: "We may update this Privacy Policy from time to time. Each version carries its own version identifier and date, and the version that applied when you made a purchase is recorded with that purchase. A later version does not change the version you agreed to.",
        },
      ],
    },
    {
      number: 13,
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
