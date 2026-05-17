"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, UserCircle } from "lucide-react";

const MAP = "/map";

interface SessionUser {
  name?: string | null;
  image?: string | null;
}

/**
 * Client component — fetches /api/auth/session after hydration so the header
 * works on both static (map, about, landing) and dynamic (community, account) pages.
 */
export default function HeaderUserSection() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data: { user?: SessionUser }) => {
        setUser(data?.user ?? null);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  // Invisible placeholder prevents layout shift while loading
  if (!ready) {
    return <div style={{ width: 120, height: 36 }} aria-hidden />;
  }

  if (user) {
    return (
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
    );
  }

  return (
    <Link
      href={MAP}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--landing-accent)] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-[color,background-color,box-shadow] hover:bg-[#006b2d] outline-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-bg)]"
    >
      Open map
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}
