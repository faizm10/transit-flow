import Link from "next/link";
import { Train } from "lucide-react";
import HeaderUserSection from "./HeaderUserSection";

const MAP = "/map";

const NAV = [
  { label: "Product",   href: "#product"       },
  { label: "Use Cases", href: "#use-cases"      },
  { label: "Simulation",href: `${MAP}?mode=simulate` },
  { label: "Data",      href: "#capabilities"   },
  { label: "Community", href: "/community"      },
  { label: "Roadmap",   href: "https://github.com/faizm10/transit-flow/issues" },
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

        {/* Right side */}
        <div className="flex shrink-0 items-center gap-3">
          <HeaderUserSection />
        </div>

      </div>
    </header>
  );
}
