import Link from "next/link";
import { Train, Bug } from "lucide-react";
import HeaderUserSection from "./HeaderUserSection";

const MAP = "/map";

const REPORT_BUG_URL =
  "https://github.com/faizm10/transit-flow/issues/new?template=bug_report.md";

const NAV = [
  { label: "Explore", href: MAP },
  { label: "Community", href: "/community" },
  { label: "About", href: "/about" },
] as const;

export default function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--landing-border)] bg-[color-mix(in_oklab,var(--landing-bg)_88%,transparent)] backdrop-blur-md supports-[backdrop-filter]:bg-[color-mix(in_oklab,var(--landing-bg)_78%,transparent)]">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md font-semibold text-[var(--landing-fg)] outline-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-bg)]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--landing-accent)] text-white shadow-sm">
            <Train className="h-4 w-4" aria-hidden />
          </span>
          TransitFlow
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex" aria-label="Primary">
          {NAV.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className="rounded-md px-3 py-2 text-sm text-[var(--landing-muted)] transition-colors hover:bg-[color-mix(in_oklab,var(--landing-fg)_5%,var(--landing-bg))] hover:text-[var(--landing-fg)] outline-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-bg)]"
            >
              {label}
            </Link>
          ))}

          <a
            href={REPORT_BUG_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-[var(--landing-muted)] transition-colors hover:bg-[color-mix(in_oklab,var(--landing-fg)_5%,var(--landing-bg))] hover:text-[var(--landing-fg)] outline-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-bg)]"
          >
            <Bug className="h-3.5 w-3.5" aria-hidden />
            Report a bug
          </a>
        </nav>

        {/* Renders sign-in + "Open map" when signed out, avatar chip when signed in */}
        <HeaderUserSection />
      </div>
    </header>
  );
}
