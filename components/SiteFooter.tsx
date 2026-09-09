export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-white/10 bg-ink-950">
      <div className="container-page flex flex-col items-start justify-between gap-4 py-10 text-xs text-white/50 sm:flex-row sm:items-center">
        <p>
          © {new Date().getFullYear()} Parking Appeals Group — demo build.
          Not legal advice. Uses deterministic rules; AI is used only for
          document extraction.
        </p>
        <p className="text-white/40">
          Prepared without admission of driver identity.
        </p>
      </div>
    </footer>
  );
}
