import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { FileText, Users, Heart, MessageSquare, ExternalLink, BarChart2 } from "lucide-react";
import { auth } from "@/lib/auth";
import {
  getOverviewStats,
  getPostsOverTime,
  getUsersOverTime,
  getTopPosts,
  getRouteBreakdown,
  getRecentUsers,
} from "@/lib/dashboardStats";
import { StatCard }       from "@/components/dashboard/StatCard";
import { Sparkline }      from "@/components/dashboard/Sparkline";
import { TopPostsTable }  from "@/components/dashboard/TopPostsTable";
import { RouteBreakdown } from "@/components/dashboard/RouteBreakdown";
import { RecentUsers }    from "@/components/dashboard/RecentUsers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard — TransitFlow",
  robots: { index: false, follow: false },
};

const OWNER_GITHUB = "faizm10";
const OWNER_EMAIL  = "faizmustansar10@gmail.com";

export default async function DashboardPage() {
  const session = await auth();
  const login = (session?.user as { login?: string } | undefined)?.login;
  const email = session?.user?.email;
  if (login !== OWNER_GITHUB && email !== OWNER_EMAIL) notFound();

  const [overview, postsOverTime, usersOverTime, topPosts, breakdown, recentUsers] =
    await Promise.all([
      getOverviewStats(),
      getPostsOverTime(30),
      getUsersOverTime(30),
      getTopPosts(10),
      getRouteBreakdown(),
      getRecentUsers(8),
    ]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-6 py-4 lg:px-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-400">TransitFlow · internal</p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://analytics.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:border-gray-300 hover:text-gray-900"
            >
              <BarChart2 className="h-3.5 w-3.5" />
              Google Analytics
              <ExternalLink className="h-3 w-3 text-gray-300" />
            </a>
            <Link
              href="/community"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#007A33] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#005f28]"
            >
              View community
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8 lg:px-10">

        {/* ── Stat cards ─────────────────────────────────────────────── */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total posts"
            value={overview.totalPosts}
            icon={<FileText className="h-4 w-4" />}
          />
          <StatCard
            label="Total users"
            value={overview.totalUsers}
            icon={<Users className="h-4 w-4" />}
          />
          <StatCard
            label="Total likes"
            value={overview.totalLikes}
            icon={<Heart className="h-4 w-4" />}
          />
          <StatCard
            label="Total comments"
            value={overview.totalComments}
            icon={<MessageSquare className="h-4 w-4" />}
          />
        </section>

        {/* ── Sparklines ──────────────────────────────────────────────── */}
        <section className="grid gap-4 lg:grid-cols-2">
          <Sparkline
            data={postsOverTime}
            label="Posts — last 30 days"
            color="#007A33"
          />
          <Sparkline
            data={usersOverTime}
            label="New users — last 30 days"
            color="#3b82f6"
          />
        </section>

        {/* ── Route breakdown + recent users ─────────────────────────── */}
        <section className="grid gap-4 lg:grid-cols-3">
          <RouteBreakdown breakdown={breakdown} />
          <div className="lg:col-span-2">
            <RecentUsers users={recentUsers} />
          </div>
        </section>

        {/* ── Top posts ───────────────────────────────────────────────── */}
        <section>
          <TopPostsTable posts={topPosts} />
        </section>

        {/* ── GA4 embed link ──────────────────────────────────────────── */}
        <section className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center">
          <BarChart2 className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm font-medium text-gray-600">Page views &amp; user behaviour</p>
          <p className="mt-1 text-xs text-gray-400">
            Live traffic, session data, and event tracking are in Google Analytics.
          </p>
          <a
            href="https://analytics.google.com/analytics/web/#/p{your-property-id}/reports/intelligenthome"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
          >
            Open GA4 <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </section>

      </main>
    </div>
  );
}
