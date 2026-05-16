"use client";

import { useState, useCallback } from "react";
import PostCard, { type PostSummary } from "./PostCard";
import { Loader2 } from "lucide-react";

interface CommunityFeedProps {
  initialPosts: PostSummary[];
  initialNextPage: number | null;
}

export default function CommunityFeed({
  initialPosts,
  initialNextPage,
}: CommunityFeedProps) {
  const [sort, setSort] = useState<"recent" | "top">("recent");
  const [posts, setPosts] = useState<PostSummary[]>(initialPosts);
  const [nextPage, setNextPage] = useState<number | null>(initialNextPage);
  const [loading, setLoading] = useState(false);

  const fetchPage = useCallback(
    async (page: number, newSort: "recent" | "top", replace = false) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/community/posts?page=${page}&sort=${newSort}`
        );
        const data = (await res.json()) as {
          posts: PostSummary[];
          nextPage: number | null;
        };
        setPosts((prev) => (replace ? data.posts : [...prev, ...data.posts]));
        setNextPage(data.nextPage);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleSortChange = (newSort: "recent" | "top") => {
    if (newSort === sort) return;
    setSort(newSort);
    fetchPage(1, newSort, true);
  };

  return (
    <div>
      {/* Sort controls */}
      <div className="mb-6 flex items-center gap-2">
        {(["recent", "top"] as const).map((s) => (
          <button
            key={s}
            onClick={() => handleSortChange(s)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              sort === s
                ? "bg-[var(--landing-accent)] text-white"
                : "border border-[var(--landing-border)] bg-[var(--landing-elevated)] text-[var(--landing-muted)] hover:text-[var(--landing-fg)]"
            }`}
          >
            {s === "recent" ? "Most recent" : "Most liked"}
          </button>
        ))}
      </div>

      {/* Grid */}
      {posts.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-lg font-semibold text-[var(--landing-fg)]">
            No networks shared yet
          </p>
          <p className="mt-2 text-sm text-[var(--landing-muted)]">
            Be the first — open the map, design a route, and share it.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <li key={post.id}>
              <PostCard post={post} />
            </li>
          ))}
        </ul>
      )}

      {/* Load more */}
      {nextPage && (
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => fetchPage(nextPage, sort)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--landing-border)] bg-[var(--landing-elevated)] px-5 py-2.5 text-sm font-medium text-[var(--landing-fg)] transition-colors hover:bg-[var(--landing-band)] disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
