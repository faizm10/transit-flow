import Link from "next/link";
import { Train } from "lucide-react";

const MAP = "/map";

const PRODUCT = [
  { label: "Explore", href: MAP },
  { label: "Design", href: MAP },
  { label: "Schedules", href: MAP },
  { label: "Simulate", href: MAP },
] as const;

const COMPANY = [
  { label: "About", href: "/about" },
  { label: "How it works", href: "/#how-it-works" },
] as const;

export default function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-[var(--landing-border)] bg-[var(--landing-band)]">
      <div className="mx-auto max-w-6xl px-5 py-12 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-12">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--landing-accent)] text-white shadow-sm">
                <Train className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-sm font-semibold text-[var(--landing-fg)]">TransitFlow</span>
            </div>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--landing-muted)]">
              GO Transit design and simulation in the browser — live GTFS, one map, four modes.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--landing-muted)]">
              Product
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {PRODUCT.map(({ label, href }) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="text-[var(--landing-fg)] transition-colors hover:text-[var(--landing-accent)] outline-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-band)]"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--landing-muted)]">
              Company
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {COMPANY.map(({ label, href }) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="text-[var(--landing-fg)] transition-colors hover:text-[var(--landing-accent)] outline-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-band)]"
                  >
                    {label}
                  </Link>
                </li>
              ))}
              <li>
                <a
                  href="https://github.com/faizm10/transit-flow"
                  className="text-[var(--landing-fg)] transition-colors hover:text-[var(--landing-accent)] outline-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-band)]"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-[var(--landing-border)] pt-8 text-xs text-[var(--landing-muted)] sm:flex-row sm:items-center">
          <span>© {year} TransitFlow</span>
          <span className="text-[color-mix(in_oklab,var(--landing-muted)_85%,var(--landing-bg))]">
            Independent project — not affiliated with Metrolinx or GO Transit.
          </span>
        </div>
      </div>
    </footer>
  );
}
