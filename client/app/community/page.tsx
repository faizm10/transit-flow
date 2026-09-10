import type { Metadata } from "next";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { Eyebrow, CornerButton } from "@/components/marketing/spec";
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
  const [{ posts: initialPosts, nextPage }, session] = await Promise.all([
    getInitialPosts(),
    import("@/lib/auth").then((m) => m.auth()),
  ]);

  return (
    <MarketingShell>
      <MarketingHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-24 pt-14 lg:px-8">
        {/* Header */}
        <div className="mb-12 flex flex-col gap-5 border-b border-[var(--landing-border)] pb-10 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-4">
            <Eyebrow>Community</Eyebrow>
            <h1 className="font-[family-name:var(--font-hanken)] text-[2.5rem] font-normal leading-[1.05] tracking-[-0.025em] text-[var(--landing-ink)]">
              Shared networks
            </h1>
            <p className="max-w-lg text-[var(--landing-muted)]">
              Browse custom GO Transit designs from the community. Click any card
              to explore the route.
            </p>
          </div>

          <CornerButton href="/map" solid>
            Design a route →
          </CornerButton>
        </div>

        <CommunityFeed
          initialPosts={initialPosts}
          initialNextPage={nextPage}
          currentUserId={session?.user?.id ?? null}
        />
      </main>

      <MarketingFooter />
    </MarketingShell>
  );
}
