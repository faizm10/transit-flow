"use client";

import { useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { Send, Loader2 } from "lucide-react";
import AuthorAvatar from "./AuthorAvatar";

interface CommentUser {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  githubLogin: string | null;
}

interface Comment {
  id: string;
  body: string;
  createdAt: string | Date;
  user: CommentUser;
}

interface CommentSectionProps {
  postId: string;
  initialComments: Comment[];
}

export default function CommentSection({ postId, initialComments }: CommentSectionProps) {
  const { data: session, status } = useSession();
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/community/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });
      const data = (await res.json()) as { comment?: Comment; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to post comment");
        return;
      }
      if (data.comment) {
        setComments((prev) => [...prev, data.comment!]);
        setBody("");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-[var(--landing-fg)]">
        Comments{comments.length > 0 ? ` (${comments.length})` : ""}
      </h2>

      {/* Comment list */}
      {comments.length === 0 ? (
        <p className="text-sm text-[var(--landing-muted)]">
          No comments yet — be the first!
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-[var(--landing-border)] bg-[var(--landing-elevated)] p-4"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <AuthorAvatar
                  name={c.user.name}
                  avatarUrl={c.user.avatarUrl}
                  githubLogin={c.user.githubLogin}
                />
                <time className="text-xs text-[var(--landing-muted)]">
                  {new Date(c.createdAt).toLocaleDateString("en-CA", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </time>
              </div>
              <p className="text-sm leading-relaxed text-[var(--landing-fg)] whitespace-pre-wrap">
                {c.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* Comment form */}
      {status === "authenticated" ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <AuthorAvatar
              name={session.user?.name ?? null}
              avatarUrl={session.user?.image ?? null}
              githubLogin={null}
              size="md"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add a comment…"
              maxLength={2000}
              rows={3}
              className="flex-1 resize-none rounded-xl border border-[var(--landing-border)] bg-[var(--landing-bg)] px-3 py-2.5 text-sm text-[var(--landing-fg)] placeholder:text-[var(--landing-muted)] outline-none focus:border-[var(--landing-accent)] focus:ring-1 focus:ring-[var(--landing-accent)]"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!body.trim() || submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--landing-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#006b2d] disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" aria-hidden />
              )}
              Post
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-xl border border-[var(--landing-border)] bg-[var(--landing-band)] p-4 text-center">
          <p className="text-sm text-[var(--landing-muted)]">
            Sign in to leave a comment.
          </p>
          <button
            onClick={() => signIn("github")}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
          >
            Sign in with GitHub
          </button>
        </div>
      )}
    </div>
  );
}
