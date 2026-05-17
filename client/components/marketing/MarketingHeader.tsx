import Link from "next/link";
import Image from "next/image";
import { Train, ArrowRight, UserCircle } from "lucide-react";
import { auth } from "@/lib/auth";

const MAP = "/map";

const NAV = [
  { label: "Explore", href: MAP },
  { label: "Community", href: "/community" },
  { label: "About", href: "/about" },
] as const;

export default async function MarketingHeader() {
  const session = await auth();
  const user = session?.user;

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
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            /* Signed-in: avatar chip → /account */
            <Link
              href="/account"
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              {user.image ? (
                <Image
                  src={user.image}
                  alt={user.name ?? "Avatar"}
                  width={24}
                  height={24}
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <UserCircle className="h-5 w-5 text-slate-500" />
              )}
              <span className="hidden sm:inline max-w-[120px] truncate">{user.name}</span>
            </Link>
          ) : (
            /* Signed-out: open map CTA */
            <Link
              href={MAP}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--landing-accent)] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-[color,background-color,box-shadow] hover:bg-[#006b2d] outline-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-bg)]"
            >
              Open map
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
