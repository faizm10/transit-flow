"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { UserCircle } from "lucide-react";
import { CornerButton } from "@/components/marketing/spec";

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
    return <div style={{ width: 132, height: 38 }} aria-hidden />;
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <CornerButton href={MAP} solid>
          Open map →
        </CornerButton>
        <Link
          href="/account"
          aria-label={`Account — ${user.name ?? "signed in"}`}
          className="flex items-center gap-2 border border-[var(--landing-border)] px-2.5 py-[0.55rem] font-[family-name:var(--landing-mono)] text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--landing-fg)] transition-colors hover:border-[var(--landing-border-2)]"
        >
          {user.image ? (
            <Image
              src={user.image}
              alt=""
              width={20}
              height={20}
              className="h-5 w-5 object-cover"
            />
          ) : (
            <UserCircle className="h-4 w-4 text-[var(--landing-faint)]" />
          )}
          <span className="hidden max-w-[110px] truncate sm:inline">{user.name}</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <CornerButton href="/auth/signin">Sign in</CornerButton>
      <CornerButton href={MAP} solid>
        Open map →
      </CornerButton>
    </div>
  );
}
