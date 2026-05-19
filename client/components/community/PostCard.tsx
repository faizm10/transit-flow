"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { Heart, MapPin, Trash2, Loader2, X } from "lucide-react";
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
  currentUserId?: string | null;
  onDelete?: (id: string) => void;
}

export default function PostCard({ post, currentUserId, onDelete }: PostCardProps) {
  const isOwner = !!currentUserId && currentUserId === post.user.id;
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const date = new Date(post.createdAt).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  function handleDelete() {
    startTransition(async () => {
      const res = await fetch(`/api/community/posts/${post.id}`, { method: "DELETE" });
      if (res.ok) {
        onDelete?.(post.id);
      } else {
        setConfirming(false);
      }
    });
  }

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--landing-border)] bg-[var(--landing-elevated)] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">

      {/* Map preview — the whole image area is clickable */}
      <Link
        href={`/community/${post.id}`}
        className="relative block h-44 w-full overflow-hidden bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-inset"
        tabIndex={0}
      >
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
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(135deg, ${post.color}22 0%, ${post.color}44 100%)` }}
          />
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white/90 to-transparent" />
        <div className="absolute right-3 top-3"><RouteTypeBadge type={post.routeType} /></div>
        <div className="absolute inset-x-0 bottom-0 h-0.5" style={{ backgroundColor: post.color }} />
      </Link>

      {/* Owner delete button — top-left of image */}
      {isOwner && !confirming && (
        <button
          onClick={() => setConfirming(true)}
          aria-label="Delete post"
          className="absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-slate-400 opacity-0 shadow backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Card body */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        {confirming ? (
          /* ── Delete confirmation ── */
          <div className="flex flex-1 flex-col gap-3">
            <p className="text-sm font-medium text-slate-900">Delete &ldquo;{post.title}&rdquo;?</p>
            <p className="text-xs text-slate-500">This can&rsquo;t be undone. All likes and comments will be removed.</p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Delete
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={isPending}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          /* ── Normal view ── */
          <Link
            href={`/community/${post.id}`}
            className="flex flex-1 flex-col gap-2 focus-visible:outline-none"
            tabIndex={-1}
          >
            <h3 className="line-clamp-2 text-base font-semibold leading-snug text-[var(--landing-fg)] group-hover:text-[var(--landing-accent)] transition-colors">
              {post.title}
            </h3>
            {post.description && (
              <p className="line-clamp-2 text-xs leading-relaxed text-[var(--landing-muted)]">
                {post.description}
              </p>
            )}
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
          </Link>
        )}
      </div>
    </div>
  );
}
