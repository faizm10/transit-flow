import Link from "next/link";
import { Train } from "lucide-react";

const MAP = "/map";

export default function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-[var(--landing-border)] bg-[var(--landing-band)]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-5 py-10 sm:flex-row sm:items-start lg:px-8">
        <div className="flex flex-col items-center gap-1.5 text-center sm:items-start sm:text-left">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--landing-accent)] text-white">
              <Train className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="text-sm font-semibold text-[var(--landing-fg)]">TransitFlow</span>
          </div>
          <p className="max-w-xs text-xs text-[var(--landing-muted)]">
            GO Transit design and simulation in the browser.
          </p>
        </div>
        <nav
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-[var(--landing-muted)]"
          aria-label="Footer"
        >
          <Link
            href={MAP}
            className="rounded-sm transition-colors hover:text-[var(--landing-fg)] outline-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-band)]"
          >
            Explore
          </Link>
          <Link
            href={MAP}
            className="rounded-sm transition-colors hover:text-[var(--landing-fg)] outline-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-band)]"
          >
            Design
          </Link>
          <Link
            href={MAP}
            className="rounded-sm transition-colors hover:text-[var(--landing-fg)] outline-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-band)]"
          >
            Schedules
          </Link>
          <Link
            href={MAP}
            className="rounded-sm transition-colors hover:text-[var(--landing-fg)] outline-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-band)]"
          >
            Simulate
          </Link>
          <Link
            href="/about"
            className="rounded-sm transition-colors hover:text-[var(--landing-fg)] outline-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-band)]"
          >
            About
          </Link>
          <a
            href="https://github.com/faizm10/transit-flow"
            className="rounded-sm transition-colors hover:text-[var(--landing-fg)] outline-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-band)]"
          >
            GitHub
          </a>
          <span className="text-[color-mix(in_oklab,var(--landing-muted)_70%,var(--landing-bg))]">© {year}</span>
        </nav>
      </div>
    </footer>
  );
}
