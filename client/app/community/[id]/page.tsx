import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Map, ArrowLeft, MapPin, Calendar } from "lucide-react";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import AuthorAvatar from "@/components/community/AuthorAvatar";
import RouteTypeBadge from "@/components/community/RouteTypeBadge";
import MiniRouteMap from "@/components/community/MiniRouteMap";
import LikeButton from "@/components/community/LikeButton";
import CommentSection from "@/components/community/CommentSection";
import { db, posts, users, comments, likes } from "@/lib/db";
import { eq, asc } from "drizzle-orm";
import type { CustomRoute } from "@/lib/gtfs";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getPost(id: string) {
  const [row] = await db
    .select({
      id: posts.id,
      title: posts.title,
      description: posts.description,
      routeData: posts.routeData,
      stopCount: posts.stopCount,
      routeType: posts.routeType,
      color: posts.color,
      likesCount: posts.likesCount,
      createdAt: posts.createdAt,
      userId: posts.userId,
      userName: users.name,
      userAvatar: users.avatarUrl,
      userLogin: users.githubLogin,
    })
    .from(posts)
    .innerJoin(users, eq(posts.userId, users.id))
    .where(eq(posts.id, id))
    .limit(1);

  return row ?? null;
}

async function getComments(postId: string) {
  return db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      userId: comments.userId,
      userName: users.name,
      userAvatar: users.avatarUrl,
      userLogin: users.githubLogin,
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.postId, postId))
    .orderBy(asc(comments.createdAt));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const post = await getPost(id);
    if (!post) return { title: "Not found — TransitFlow Community" };
    return {
      title: `${post.title} — TransitFlow Community`,
      description: post.description ?? `A custom ${post.routeType} route with ${post.stopCount} stops.`,
    };
  } catch {
    return { title: "TransitFlow Community" };
  }
}

export default async function CommunityPostPage({ params }: PageProps) {
  const { id } = await params;

  let post: Awaited<ReturnType<typeof getPost>>;
  let postComments: Awaited<ReturnType<typeof getComments>>;

  try {
    [post, postComments] = await Promise.all([getPost(id), getComments(id)]);
  } catch {
    notFound();
  }

  if (!post) notFound();

  const route = post.routeData as unknown as CustomRoute;
  const date = new Date(post.createdAt).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const formattedComments = postComments.map((c) => ({
    id: c.id,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    user: {
      id: c.userId,
      name: c.userName,
      avatarUrl: c.userAvatar,
      githubLogin: c.userLogin,
    },
  }));

  return (
    <MarketingShell>
      <MarketingHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-12 lg:px-8 lg:py-16">
        {/* Back */}
        <Link
          href="/community"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-[var(--landing-muted)] transition-colors hover:text-[var(--landing-fg)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to community
        </Link>

        {/* Color strip */}
        <div className="mb-6 h-1.5 w-full rounded-full" style={{ backgroundColor: post.color }} />

        {/* Post header */}
        <div className="mb-6 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <RouteTypeBadge type={post.routeType} />
            <span className="flex items-center gap-1 text-xs text-[var(--landing-muted)]">
              <MapPin className="h-3 w-3" aria-hidden />
              {post.stopCount} stop{post.stopCount !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1 text-xs text-[var(--landing-muted)]">
              <Calendar className="h-3 w-3" aria-hidden />
              {date}
            </span>
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-[var(--landing-fg)] sm:text-4xl">
            {post.title}
          </h1>

          {post.description && (
            <p className="text-base leading-relaxed text-[var(--landing-muted)]">
              {post.description}
            </p>
          )}

          <AuthorAvatar
            name={post.userName}
            avatarUrl={post.userAvatar}
            githubLogin={post.userLogin}
            size="md"
          />
        </div>

        {/* Mini map */}
        <div className="mb-6 overflow-hidden rounded-2xl border border-[var(--landing-border)]">
          <MiniRouteMap route={route} />
        </div>

        {/* Actions */}
        <div className="mb-10 flex flex-wrap items-center gap-3">
          <Link
            href={`/map?community_route=${post.id}`}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--landing-accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#006b2d]"
          >
            <Map className="h-4 w-4" aria-hidden />
            Load into map
          </Link>
          <LikeButton postId={post.id} initialLikesCount={post.likesCount} />
        </div>

        {/* Divider */}
        <hr className="mb-10 border-[var(--landing-border)]" />

        {/* Comments */}
        <CommentSection postId={post.id} initialComments={formattedComments} />
      </main>

      <MarketingFooter />
    </MarketingShell>
  );
}
