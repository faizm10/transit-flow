import Link from "next/link";
import { Heart, MapPin } from "lucide-react";
import AuthorAvatar from "./AuthorAvatar";
import RouteTypeBadge from "./RouteTypeBadge";

export interface PostSummary {
  id: string;
  title: string;
  description: string | null;
  stopCount: number;
  routeType: string;
  color: string;
  likesCount: number;
  createdAt: Date | string;
  user: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
    githubLogin: string | null;
  };
}

interface PostCardProps {
  post: PostSummary;
}

export default function PostCard({ post }: PostCardProps) {
  const date = new Date(post.createdAt).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <Link
      href={`/community/${post.id}`}
      className="group flex flex-col gap-3 rounded-2xl border border-[var(--landing-border)] bg-[var(--landing-elevated)] p-5 shadow-[0_4px_24px_-12px_color-mix(in_oklab,var(--landing-fg)_12%,transparent)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[color-mix(in_oklab,var(--landing-fg)_14%,var(--landing-border))] hover:shadow-[0_8px_32px_-12px_color-mix(in_oklab,var(--landing-fg)_18%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-bg)]"
    >
      {/* Color strip */}
      <div className="h-1 w-full rounded-full" style={{ backgroundColor: post.color }} />

      {/* Title + type */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-base font-semibold text-[var(--landing-fg)] leading-snug">
          {post.title}
        </h3>
        <RouteTypeBadge type={post.routeType} />
      </div>

      {/* Description */}
      {post.description && (
        <p className="line-clamp-2 text-sm leading-relaxed text-[var(--landing-muted)]">
          {post.description}
        </p>
      )}

      {/* Meta row */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <AuthorAvatar
          name={post.user.name}
          avatarUrl={post.user.avatarUrl}
          githubLogin={post.user.githubLogin}
        />
        <div className="flex items-center gap-3 text-xs text-[var(--landing-muted)]">
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" aria-hidden />
            {post.stopCount} stop{post.stopCount !== 1 ? "s" : ""}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3" aria-hidden />
            {post.likesCount}
          </span>
          <span>{date}</span>
        </div>
      </div>
    </Link>
  );
}
