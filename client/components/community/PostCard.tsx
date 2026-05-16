import Link from "next/link";
import Image from "next/image";
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
  previewUrl: string | null;
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
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Link
      href={`/community/${post.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--landing-border)] bg-[var(--landing-elevated)] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2"
    >
      {/* Map preview */}
      <div className="relative h-44 w-full overflow-hidden bg-slate-100">
        {post.previewUrl ? (
          <Image
            src={post.previewUrl}
            alt={`Map preview for ${post.title}`}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            unoptimized
          />
        ) : (
          /* Fallback: coloured gradient when no image */
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${post.color}22 0%, ${post.color}44 100%)`,
            }}
          />
        )}

        {/* Bottom fade */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white/90 to-transparent" />

        {/* Type badge pinned top-right */}
        <div className="absolute right-3 top-3">
          <RouteTypeBadge type={post.routeType} />
        </div>

        {/* Colour accent bar at bottom of image */}
        <div
          className="absolute inset-x-0 bottom-0 h-0.5"
          style={{ backgroundColor: post.color }}
        />
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-base font-semibold leading-snug text-[var(--landing-fg)] group-hover:text-[var(--landing-accent)] transition-colors">
          {post.title}
        </h3>

        {post.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-[var(--landing-muted)]">
            {post.description}
          </p>
        )}

        {/* Meta row */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <AuthorAvatar
            name={post.user.name}
            avatarUrl={post.user.avatarUrl}
            githubLogin={post.user.githubLogin}
          />
          <div className="flex items-center gap-2.5 text-[11px] text-[var(--landing-muted)]">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden />
              {post.stopCount}
            </span>
            <span className="flex items-center gap-1">
              <Heart className="h-3 w-3" aria-hidden />
              {post.likesCount}
            </span>
            <span>{date}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
