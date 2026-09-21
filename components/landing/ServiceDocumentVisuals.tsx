/**
 * Accurate CSS document mockups for Services page — matched to client photos.
 */

function FormRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-black/10 py-1">
      <span className="w-[55%] shrink-0 text-[7px] font-semibold leading-tight text-brand-text sm:text-[8px]">
        {label}
      </span>
      <span className="h-3.5 flex-1 rounded-[2px] border border-black/15 bg-white" />
    </div>
  );
}

/** Yellow PCN with checker border + DO NOT IGNORE */
export function DocPenaltyChargeNotice({ className = "" }: { className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-sm bg-[#FFE01B] shadow-pop ring-1 ring-black/20 ${className}`}
    >
      {/* Fake checker frame */}
      <div
        className="p-[3px]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg,#111 0 5px,#FFE01B 5px 10px), repeating-linear-gradient(0deg,#111 0 5px,#FFE01B 5px 10px)",
          backgroundSize: "100% 3px, 3px 100%",
          backgroundPosition: "0 0, 0 0",
          backgroundRepeat: "repeat-x, repeat-y",
        }}
      >
        <div className="border border-black bg-[#FFE01B] px-2.5 py-2.5 sm:px-3 sm:py-3">
          <p className="text-center text-[11px] font-black uppercase leading-tight tracking-wide text-brand-text sm:text-[12px]">
            Penalty Charge
            <br />
            Notice
          </p>
          <div className="mx-auto my-1.5 h-px w-4/5 bg-black/50" />
          <p className="text-center text-[9px] font-black uppercase tracking-wide text-brand-text sm:text-[10px]">
            Do not ignore
          </p>
          <p className="mt-2 text-center text-[6px] leading-snug text-brand-text/70 sm:text-[7px]">
            If you do not pay or appeal, the charge may increase.
          </p>
        </div>
      </div>
    </div>
  );
}

/** White Parking Charge Notice with black P square */
export function DocParkingChargeNotice({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-sm border border-black/10 bg-white p-3 shadow-card sm:p-3.5 ${className}`}
    >
      <div className="mb-2 flex justify-center">
        <span className="flex h-9 w-9 items-center justify-center bg-brand-text text-[16px] font-black text-white sm:h-10 sm:w-10 sm:text-[18px]">
          P
        </span>
      </div>
      <p className="text-center text-[10px] font-black uppercase tracking-wide text-brand-text sm:text-[11px]">
        Parking Charge Notice
      </p>
      <div className="mt-3 space-y-1.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-1.5 rounded-sm bg-black/10"
            style={{ width: `${90 - ((i * 6) % 30)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Lambeth Charge Certificate with form fields */
export function DocChargeCertificate({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-sm border border-black/10 bg-white p-3 shadow-pop sm:p-3.5 ${className}`}
    >
      <div className="mb-2 flex items-start gap-2">
        <LambethCrest className="h-8 w-8 shrink-0 text-brand-text" />
        <div>
          <p className="font-serif text-[8px] font-semibold leading-tight text-brand-text sm:text-[9px]">
            London Borough of
            <br />
            Lambeth
          </p>
        </div>
      </div>
      <p className="text-[12px] font-black tracking-tight text-brand-text sm:text-[13px]">
        Charge Certificate
      </p>
      <div className="mt-2.5 space-y-0.5">
        <FormRow label="Penalty Charge Notice (PCN) Number:" />
        <FormRow label="Vehicle Registration Mark:" />
        <FormRow label="Date of this Certificate:" />
        <FormRow label="Amount due:" />
      </div>
    </div>
  );
}

/** Stack: PCN + Parking Charge Notice + Charge Certificate (pink desk) */
export function AppealDocsCollage() {
  return (
    <div className="relative mx-auto aspect-[5/6] w-full max-w-[360px] select-none">
      <div
        aria-hidden
        className="absolute inset-0 rounded-2xl bg-brand-pinkPale/80"
      />
      {/* Charge Certificate — front bottom */}
      <div className="absolute bottom-[6%] left-[8%] z-[3] w-[78%] rotate-[-2deg]">
        <DocChargeCertificate />
      </div>
      {/* Parking Charge Notice — mid right */}
      <div className="absolute right-[2%] top-[10%] z-[2] w-[58%] rotate-[6deg]">
        <DocParkingChargeNotice />
      </div>
      {/* Yellow PCN — top left */}
      <div className="absolute left-[2%] top-[2%] z-[1] w-[48%] rotate-[-8deg]">
        <DocPenaltyChargeNotice />
      </div>
    </div>
  );
}

/** Order for Recovery on brown envelope — TEC / HMCTS */
export function OrderEnvelopeVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[340px] select-none">
      <div className="rounded-lg bg-[#C9A978] p-3 shadow-pop ring-1 ring-black/10 sm:p-4">
        <div className="rounded-[3px] bg-white px-3.5 py-4 sm:px-4 sm:py-5">
          <div className="mb-3 flex items-start gap-2.5">
            <RoyalCrest className="h-9 w-9 shrink-0 text-brand-text sm:h-10 sm:w-10" />
            <div className="pt-0.5">
              <p className="text-[10px] font-bold leading-tight text-brand-text sm:text-[11px]">
                Traffic Enforcement Centre
              </p>
              <p className="text-[9px] font-medium leading-tight text-brand-mute sm:text-[10px]">
                HM Courts &amp; Tribunals Service
              </p>
            </div>
          </div>
          <p className="text-[16px] font-black tracking-tight text-brand-text sm:text-[18px]">
            Order for Recovery
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-brand-text sm:text-[12px]">
            Recovery of unpaid penalty charge
          </p>
          <div className="mt-3 space-y-0.5 border-t border-black/10 pt-2">
            <FormRow label="To:" />
            <FormRow label="Penalty Charge Notice number:" />
            <FormRow label="Vehicle registration mark:" />
            <FormRow label="Date of Order for Recovery:" />
          </div>
        </div>
      </div>
    </div>
  );
}

function LambethCrest({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M20 8l2.5 6h6.5l-5.2 4 2 6.5L20 21l-5.8 3.5 2-6.5-5.2-4h6.5L20 8z"
        fill="currentColor"
      />
      <path d="M12 28h16v1.5H12zm0 3h16v1.5H12z" fill="currentColor" opacity=".5" />
    </svg>
  );
}

function RoyalCrest({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <g fill="currentColor">
        <path d="M24 4l3 7h7l-5.5 4.2 2.2 7L24 18.5 17.3 22.2l2.2-7L14 11h7L24 4z" />
        <path d="M10 26c2-4 6-6 14-6s12 2 14 6v2H10v-2z" opacity=".85" />
        <path d="M8 30h32v2H8zm2 4h28v2H10zm2 4h24v2H12z" opacity=".45" />
        <circle cx="14" cy="24" r="3" opacity=".7" />
        <circle cx="34" cy="24" r="3" opacity=".7" />
      </g>
    </svg>
  );
}
