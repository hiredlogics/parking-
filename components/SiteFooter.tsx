export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-white/10 bg-ink-950">
      <div className="container-page flex flex-col items-start justify-between gap-4 py-10 text-xs text-white/50 sm:flex-row sm:items-center">
        <p>
          © {new Date().getFullYear()} Parking Appeals Group — demo build.
          Not legal advice. Uses deterministic rules; AI is used only for
          document extraction.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-white/40">
          <a href="/terms" className="hover:text-white/80">
            Terms &amp; Conditions
          </a>
          <a href="/privacy" className="hover:text-white/80">
            Privacy Policy
          </a>
          <span>Prepared without admission of driver identity.</span>
        </div>
      </div>
    </footer>
  );
}
