import Link from "next/link";
import { Train } from "lucide-react";
import HeaderUserSection from "./HeaderUserSection";
import BugReportButton from "@/components/BugReportButton";

const NAV = [
  { label: "Service alerts", href: "/service-updates" },
  { label: "Map", href: "/map" },
  { label: "Blog", href: "/blog" },
] as const;

const navLink =
  "font-[family-name:var(--landing-mono)] text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--landing-muted)] transition-colors hover:text-[var(--landing-ink)]";

export default function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--landing-border)] bg-[color-mix(in_oklab,var(--landing-bg)_90%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-[family-name:var(--landing-mono)] text-[0.8125rem] uppercase tracking-[0.08em] text-[var(--landing-ink)] outline-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)]"
        >
          <span className="flex h-6 w-6 items-center justify-center bg-[var(--landing-accent)] text-white">
            <Train className="h-3.5 w-3.5" aria-hidden />
          </span>
          TransitFlow
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
          {NAV.map(({ label, href }) => (
            <Link key={label} href={href} className={navLink}>
              {label}
            </Link>
          ))}
          <BugReportButton variant="nav" />
        </nav>

        <HeaderUserSection />
      </div>
    </header>
  );
}
