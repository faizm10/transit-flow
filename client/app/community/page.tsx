import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import CommunityFeed from "@/components/community/CommunityFeed";
import type { PostSummary } from "@/components/community/PostCard";
import { db, posts, users } from "@/lib/db";
import { desc, eq, count } from "drizzle-orm";
import { buildStaticMapUrl } from "@/lib/mapboxStaticImage";
import type { CustomRoute } from "@/lib/gtfs";

// Always fetch fresh posts from the DB — never serve a stale static snapshot
export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://transit-flow-two.vercel.app";

export const metadata: Metadata = {
  title: "Community",
  description:
    "Browse and share custom GO Transit network designs. Explore routes created by the TransitFlow community and load them directly onto the map.",
  alternates: { canonical: `${SITE_URL}/community` },
  openGraph: {
    title: "Community — TransitFlow",
    description:
      "Browse and share custom GO Transit network designs. Explore routes created by the TransitFlow community and load them directly onto the map.",
    url: `${SITE_URL}/community`,
  },
};

const PAGE_SIZE = 20;

async function getInitialPosts(): Promise<{
  posts: PostSummary[];
  nextPage: number | null;
}> {
  try {
    const rows = await db
      .select({
        id: posts.id,
        title: posts.title,
        description: posts.description,
        stopCount: posts.stopCount,
        routeType: posts.routeType,
        color: posts.color,
        likesCount: posts.likesCount,
        createdAt: posts.createdAt,
        routeData: posts.routeData,
        userId: posts.userId,
        userName: users.name,
        userAvatar: users.avatarUrl,
        userLogin: users.githubLogin,
      })
      .from(posts)
      .innerJoin(users, eq(posts.userId, users.id))
      .orderBy(desc(posts.createdAt))
      .limit(PAGE_SIZE);

    const [{ total }] = await db.select({ total: count() }).from(posts);
    const nextPage = PAGE_SIZE < total ? 2 : null;

    return {
      posts: rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        stopCount: r.stopCount,
        routeType: r.routeType,
        color: r.color,
        likesCount: r.likesCount,
        createdAt: r.createdAt,
        previewUrl: buildStaticMapUrl(r.routeData as unknown as CustomRoute),
        user: {
          id: r.userId,
          name: r.userName,
          avatarUrl: r.userAvatar,
          githubLogin: r.userLogin,
        },
      })),
      nextPage,
    };
  } catch {
    // DB not yet configured — return empty state
    return { posts: [], nextPage: null };
  }
}

export default async function CommunityPage() {
  const { posts: initialPosts, nextPage } = await getInitialPosts();

  return (
    <MarketingShell>
      <MarketingHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 lg:px-8 lg:py-16">
        {/* Header */}
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Users className="h-5 w-5 text-[var(--landing-accent)]" aria-hidden />
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--landing-accent)]">
                Community
              </p>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--landing-fg)] sm:text-4xl">
              Shared networks
            </h1>
            <p className="mt-2 text-base text-[var(--landing-muted)]">
              Browse custom GO Transit designs from the community. Click any card to explore the route.
            </p>
          </div>

          <Link
            href="/map"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--landing-accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#006b2d]"
          >
            Design a route
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <CommunityFeed initialPosts={initialPosts} initialNextPage={nextPage} />
      </main>

      <MarketingFooter />
    </MarketingShell>
  );
}
