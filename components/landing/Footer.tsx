import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "./BrandLogo";
import { ClockIcon } from "./Icons";

const QUICK_LINKS = [
  { label: "Home", href: "/" },
  { label: "Services", href: "/services" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "About Us", href: "/about" },
  { label: "Resources", href: "/#resources" },
  { label: "Contact Us", href: "/#contact" },
];

export function Footer() {
  return (
    <footer className="bg-brand-navy text-white">
      <div className="container-page grid grid-cols-1 gap-10 py-12 sm:grid-cols-2 lg:grid-cols-3 lg:gap-12 lg:py-14">
        <div>
          <BrandLogo invert />
          <p className="mt-4 max-w-sm text-[13.5px] leading-relaxed text-white/70">
            Helping you challenge unfair parking tickets, court claims and
            enforcement action with clear guidance and effective documents.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <SocialCircle label="Instagram" href="#">
              <rect x="4" y="4" width="16" height="16" rx="4" />
              <circle cx="12" cy="12" r="3.5" />
              <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
            </SocialCircle>
            <SocialCircle label="Facebook" href="#">
              <path d="M14 9h3V6h-3c-1.7 0-3 1.3-3 3v2H9v3h2v7h3v-7h2.5l.5-3H14V9z" />
            </SocialCircle>
            <SocialCircle label="YouTube" href="#">
              <path d="M22 8.5s-.2-1.5-.8-2.1c-.8-.8-1.7-.8-2.1-.9C16.5 5.2 12 5.2 12 5.2h0s-4.5 0-7.1.3c-.4 0-1.3.1-2.1.9C2.2 7 2 8.5 2 8.5S1.8 10.2 1.8 12v1.5c0 1.8.2 3.5.2 3.5s.2 1.5.8 2.1c.8.8 1.9.8 2.4.9 1.7.2 7 .3 7 .3s4.5 0 7.1-.3c.4 0 1.3-.1 2.1-.9.6-.6.8-2.1.8-2.1s.2-1.7.2-3.5V12c0-1.8-.2-3.5-.2-3.5z" />
              <path d="M10 9.5v6l5.5-3z" fill="currentColor" stroke="none" />
            </SocialCircle>
            <SocialCircle label="Telegram" href="#">
              <path d="M21 4L3 11.5l6 2 2 6.5 2.5-3.5L18 18l3-14z" />
            </SocialCircle>
          </div>
          <div className="mt-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">
              As featured in
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-5 text-white/70">
              <span className="font-display text-[18px] font-bold tracking-tight">
                BBC
              </span>
              <span className="font-display text-[15px] font-semibold italic tracking-wide">
                The Telegraph
              </span>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-[14px] font-bold uppercase tracking-wide">Quick Links</h3>
          <ul className="mt-4 space-y-2.5">
            {QUICK_LINKS.map((l) => (
              <li key={l.label}>
                <Link
                  href={l.href}
                  className="inline-flex items-center gap-2 text-[14px] text-white/75 transition hover:text-white"
                >
                  <span className="text-brand-pink" aria-hidden>
                    ›
                  </span>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div id="resources">
          <h3 className="text-[14px] font-bold uppercase tracking-wide">Get in Touch</h3>
          <ul className="mt-4 space-y-4 text-[14px] text-white/75">
            <li className="flex items-start gap-3">
              <MailGlyph />
              <a
                href="mailto:info@parkingappealsgroup.co.uk"
                className="hover:text-white"
              >
                info@parkingappealsgroup.co.uk
              </a>
            </li>
            <li className="flex items-start gap-3">
              <WhatsAppGlyph />
              <span>
                Chat on WhatsApp (Automated)
                <br />
                <span className="text-white/55">Available 24/7</span>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <ClockIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-pink" />
              <span>We aim to respond within 2 working days.</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-3 py-4 text-[12.5px] text-white/55 sm:flex-row sm:items-center sm:justify-between">
          <p>© Parking Appeals Group. All rights reserved.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/#about" className="hover:text-white">
              Terms &amp; Conditions
            </Link>
            <Link href="/#about" className="hover:text-white">
              Privacy Policy
            </Link>
            <Link href="/#about" className="hover:text-white">
              Disclaimer
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function SocialCircle({
  label,
  href,
  children,
}: {
  label: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/25 text-white/85 transition hover:border-brand-pink hover:text-brand-pink"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        {children}
      </svg>
    </a>
  );
}

function MailGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-brand-pink" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 7 9-7" />
    </svg>
  );
}

function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-brand-pink" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.7 14.9L2 22l5.3-1.4A10 10 0 1 0 12 2zm0 2a8 8 0 0 1 6.8 12.2l-.3.4.2 1.3-1.3-.2-.4.3A8 8 0 0 1 12 4zm4.4 9.7c-.2-.1-1.3-.6-1.5-.7-.2-.1-.4-.1-.5.1-.2.2-.6.7-.7.8-.1.1-.3.2-.5.1-.2-.1-.9-.3-1.7-1.1-.6-.6-1.1-1.3-1.2-1.5-.1-.2 0-.4.1-.5l.4-.5c.1-.1.1-.3.2-.4 0-.1 0-.3 0-.4s-.5-1.2-.7-1.6c-.2-.4-.4-.4-.5-.4h-.4c-.1 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.3c.1.2 1.6 2.5 3.9 3.4 2.3.9 2.3.6 2.7.6.4 0 1.3-.5 1.5-1 .2-.5.2-.9.1-1z" />
    </svg>
  );
}
