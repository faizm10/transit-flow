"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Heart } from "lucide-react";
import { signIn } from "next-auth/react";

interface LikeButtonProps {
  postId: string;
  initialLikesCount: number;
}

export default function LikeButton({ postId, initialLikesCount }: LikeButtonProps) {
  const { data: session, status } = useSession();
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(initialLikesCount);
  const [loading, setLoading] = useState(false);

  // Fetch initial liked state for the current user
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch(`/api/community/posts/${postId}/likes`)
      .then((r) => r.json())
      .then((data: { liked?: boolean }) => {
        if (typeof data.liked === "boolean") setLiked(data.liked);
      })
      .catch(() => {/* silent */});
  }, [postId, status]);

  const handleToggle = async () => {
    if (status === "unauthenticated") {
      signIn("github");
      return;
    }
    if (loading) return;
    setLoading(true);

    // Optimistic update
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikesCount((c) => c + (wasLiked ? -1 : 1));

    try {
      const res = await fetch(`/api/community/posts/${postId}/likes`, {
        method: "POST",
      });
      const data = (await res.json()) as { liked?: boolean; likesCount?: number };
      if (typeof data.liked === "boolean") setLiked(data.liked);
      if (typeof data.likesCount === "number") setLikesCount(data.likesCount);
    } catch {
      // Revert optimistic update on error
      setLiked(wasLiked);
      setLikesCount((c) => c + (wasLiked ? 1 : -1));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading || status === "loading"}
      aria-label={liked ? "Unlike this route" : "Like this route"}
      className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all disabled:opacity-50 ${
        liked
          ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
          : "border-[var(--landing-border)] bg-[var(--landing-elevated)] text-[var(--landing-muted)] hover:text-[var(--landing-fg)]"
      }`}
    >
      <Heart
        className={`h-4 w-4 transition-transform ${liked ? "fill-red-500 stroke-red-500 scale-110" : ""}`}
        aria-hidden
      />
      {likesCount} {likesCount === 1 ? "like" : "likes"}
    </button>
  );
}
