import Link from "next/link";
import { Train } from "lucide-react";
import HeaderUserSection from "./HeaderUserSection";

const MAP = "/map";

/**
 * Three links, not six.
 *
 * The old row flattened three different kinds of destination into one list:
 * page anchors (Product, Use Cases, Data), a deep link into one app mode
 * (Simulation), a separate page (Community) and an external issue tracker
 * (Roadmap) — all styled identically, so none of them told you where you were
 * about to end up.
 *
 * What is left is one anchor per section a reader would look for, plus the one
 * page that is not this page. "Data" pointed at #capabilities, which the
 * Product story already walks you through; Roadmap moved to the footer beside
 * the GitHub link, where the other off-site links live; and Simulation is
 * replaced by the primary action below — it was the only route into the app
 * from here, dressed as a content link, and it promoted one of the four modes
 * for no reason.
 */
const NAV = [
  { label: "Product",   href: "#product"   },
  { label: "Use Cases", href: "#use-cases" },
  { label: "Community", href: "/community" },
];

export default function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--landing-border)] bg-white/90 backdrop-blur-md supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 lg:px-8">

        {/* Logo */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 font-semibold text-[var(--landing-fg)] outline-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)]"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--landing-accent)] text-white shadow-sm">
            <Train className="h-3.5 w-3.5" aria-hidden />
          </span>
          TransitFlow
        </Link>

        {/* Nav */}
        <nav className="hidden items-center gap-0.5 md:flex" aria-label="Primary">
          {NAV.map(({ label, href }) => {
            const external = href.startsWith("http");
            return (
              <Link
                key={label}
                href={href}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="rounded-md px-3 py-2 text-sm text-[var(--landing-muted)] transition-colors hover:bg-gray-50 hover:text-[var(--landing-fg)] outline-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)]"
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Right side — HeaderUserSection carries the primary action in both
            the signed-in and signed-out states. */}
        <div className="flex shrink-0 items-center gap-3">
          <HeaderUserSection />
        </div>

      </div>
    </header>
  );
}
