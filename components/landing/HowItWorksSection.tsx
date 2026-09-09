import { DocumentIcon } from "./Icons";
import { HowItWorksStep } from "./HowItWorksStep";
import { TrustpilotCard } from "./TrustpilotCard";

/** Inline SVG "arrow" (dashed line + arrowhead) used between steps. */
function DottedArrow({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 80 12"
      aria-hidden="true"
      fill="none"
    >
      <line
        x1="2"
        y1="6"
        x2="72"
        y2="6"
        stroke="#EC1573"
        strokeWidth="1.5"
        strokeDasharray="3 4"
      />
      <path d="M70 2l6 4-6 4" stroke="#EC1573" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

/**
 * Upload → Answer → Generate → Download icon glyphs, hand-picked so
 * each step reads instantly. All render in currentColor (pink outline).
 */
function UploadGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 15V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" />
    </svg>
  );
}
function ClipboardGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4h6l-1 3H10L9 4z" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}
function GenerateGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M15 3v4h4" />
      <path d="M9 13l2 2 4-4" />
    </svg>
  );
}
function DownloadGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4v11" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="bg-white py-14 sm:py-16 lg:py-20">
      <div className="container-page">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
          {/* Steps */}
          <div>
            <h2 className="mb-8 text-center text-[13px] font-bold uppercase tracking-widest text-brand-text lg:text-left">
              How It Works
              <span className="ml-2 hidden text-brand-pink lg:inline-block">
                <DocumentIcon className="inline h-4 w-4" />
              </span>
            </h2>

            {/* Desktop: horizontal row with arrows */}
            <div className="hidden items-start gap-2 lg:flex">
              <HowItWorksStep
                number={1}
                icon={<UploadGlyph />}
                title="Upload Your Notice"
                description="Upload a photo or file of your parking notice."
              />
              <div className="mt-8 flex-1">
                <DottedArrow className="mx-auto w-full max-w-[100px]" />
              </div>
              <HowItWorksStep
                number={2}
                icon={<ClipboardGlyph />}
                title="Answer Questions"
                description="We'll ask a few simple questions about your case."
              />
              <div className="mt-8 flex-1">
                <DottedArrow className="mx-auto w-full max-w-[100px]" />
              </div>
              <HowItWorksStep
                number={3}
                icon={<GenerateGlyph />}
                title="We Generate Your Appeal"
                description="We create your professional appeal or representation."
              />
              <div className="mt-8 flex-1">
                <DottedArrow className="mx-auto w-full max-w-[100px]" />
              </div>
              <HowItWorksStep
                number={4}
                icon={<DownloadGlyph />}
                title="Download & Submit"
                description="Download instantly and submit with confidence."
              />
            </div>

            {/* Mobile / tablet: vertical stack */}
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:hidden">
              <HowItWorksStep
                number={1}
                icon={<UploadGlyph />}
                title="Upload Your Notice"
                description="Upload a photo or file of your parking notice."
              />
              <HowItWorksStep
                number={2}
                icon={<ClipboardGlyph />}
                title="Answer Questions"
                description="We'll ask a few simple questions about your case."
              />
              <HowItWorksStep
                number={3}
                icon={<GenerateGlyph />}
                title="We Generate Your Appeal"
                description="We create your professional appeal or representation."
              />
              <HowItWorksStep
                number={4}
                icon={<DownloadGlyph />}
                title="Download & Submit"
                description="Download instantly and submit with confidence."
              />
            </div>
          </div>

          {/* Trustpilot */}
          <div className="mx-auto w-full max-w-[280px] lg:max-w-none">
            <TrustpilotCard />
          </div>
        </div>
      </div>
    </section>
  );
}
