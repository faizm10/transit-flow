import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { LogOut, MapPin, ArrowRight, LayoutGrid } from "lucide-react";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import AccountPostCard from "@/components/community/AccountPostCard";
import type { AccountPost } from "@/components/community/AccountPostCard";
import { auth, signOut } from "@/lib/auth";
import { db, posts } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { buildStaticMapUrl } from "@/lib/mapboxStaticImage";
import type { CustomRoute } from "@/lib/gtfs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account — TransitFlow",
};

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/community");

  const userId = session.user.id!;
  const userPosts = await db
    .select()
    .from(posts)
    .where(eq(posts.userId, userId))
    .orderBy(desc(posts.createdAt));

  const accountPosts: AccountPost[] = userPosts.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    routeType: p.routeType,
    color: p.color,
    stopCount: p.stopCount,
    likesCount: p.likesCount,
    createdAt: p.createdAt,
    previewUrl: buildStaticMapUrl(p.routeData as unknown as CustomRoute),
  }));

  const totalLikes = userPosts.reduce((s, p) => s + p.likesCount, 0);

  return (
    <MarketingShell>
      <MarketingHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-12 lg:px-8 lg:py-16">

        {/* ── Profile card ─────────────────────────────────────────────────── */}
        <div className="mb-10 flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {session.user.image ? (
              <Image
                src={session.user.image}
                alt={session.user.name ?? "Avatar"}
                width={64}
                height={64}
                className="h-16 w-16 rounded-full object-cover ring-2 ring-slate-100"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#007A33] text-xl font-bold text-white">
                {(session.user.name ?? "U").charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{session.user.name}</h1>
              <p className="text-sm text-slate-500">{session.user.email}</p>
            </div>
          </div>

          {/* Stats + sign-out */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex gap-6 text-center">
              <div>
                <p className="text-xl font-bold text-slate-900">{userPosts.length}</p>
                <p className="text-xs text-slate-500">Routes</p>
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900">{totalLikes}</p>
                <p className="text-xs text-slate-500">Likes received</p>
              </div>
            </div>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </form>
          </div>
        </div>

        {/* ── My routes ─────────────────────────────────────────────────────── */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-[#007A33]" />
            <h2 className="text-lg font-semibold text-slate-900">My routes</h2>
          </div>
          <Link
            href="/map"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#007A33] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#005f28]"
          >
            Design a route
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {accountPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-slate-300 py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50">
              <MapPin className="h-6 w-6 text-slate-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">No routes shared yet</p>
              <p className="mt-1 text-sm text-slate-400">Design a custom route and share it to the community.</p>
            </div>
            <Link
              href="/map"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#007A33] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#005f28]"
            >
              Open the map
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accountPosts.map((p) => (
              <AccountPostCard key={p.id} post={p} />
            ))}
          </div>
        )}
      </main>

      <MarketingFooter />
    </MarketingShell>
  );
}
