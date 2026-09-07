import Link from "next/link";
import Image from "next/image";
import { UserCircle } from "lucide-react";

import { SidebarNav } from "@/components/workspace/SidebarNav";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface WorkspaceUser {
  name?: string | null;
  image?: string | null;
  email?: string | null;
}

/**
 * The workspace frame.
 *
 * A fixed 15rem rail on desktop, collapsing to a top bar below `lg`. Chrome
 * sits on --surface and content on the page background, so the boundary is
 * carried by a single border rather than a shadow.
 *
 * This is a server component: the session is resolved by the layout above and
 * passed down, so the sidebar does not flash an empty user slot after
 * hydration the way the marketing header does.
 */
export function WorkspaceShell({
  user,
  isOwner,
  children,
}: {
  user: WorkspaceUser | null;
  isOwner: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-surface lg:flex-row">
      {/* ── Rail ──────────────────────────────────────────────────────────── */}
      <aside
        className={cn(
          "shrink-0 border-border-strong bg-surface",
          "lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:border-r",
          "border-b lg:border-b-0"
        )}
      >
        <div className="flex h-full flex-col gap-3 px-3 py-3 lg:gap-4 lg:py-4">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span
              aria-hidden
              className="size-5 rounded-[5px] bg-brand ring-1 ring-brand/20 ring-inset"
            />
            <span className="text-sm font-semibold tracking-tight">
              TransitFlow
            </span>
          </Link>

          <div className="lg:flex-1">
            <SidebarNav isOwner={isOwner} />
          </div>

          <div className="hidden lg:block">
            <Separator className="mb-3" />
            <UserSlot user={user} />
          </div>
        </div>
      </aside>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
          {children}
        </div>
      </main>
    </div>
  );
}

function UserSlot({ user }: { user: WorkspaceUser | null }) {
  if (!user) {
    return (
      <Link
        href="/auth/signin"
        className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-surface-sunken hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <UserCircle className="size-4 shrink-0" />
        Sign in
      </Link>
    );
  }

  return (
    <Link
      href="/account"
      className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 transition-colors hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {user.image ? (
        <Image
          src={user.image}
          alt=""
          width={20}
          height={20}
          className="size-5 shrink-0 rounded-full object-cover"
        />
      ) : (
        <UserCircle className="size-5 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {user.name ?? user.email ?? "Account"}
      </span>
    </Link>
  );
}
