"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { Loader2, Share2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { CustomRoute } from "@/lib/gtfs";

interface ShareModalProps {
  route: CustomRoute | null;
  onClose: () => void;
}

export default function ShareModal({ route, onClose }: ShareModalProps) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [title, setTitle] = useState(route?.name ?? "");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync title when route changes
  if (route && title === "" && route.name) {
    setTitle(route.name);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!route || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim(), routeData: route }),
      });
      const data = (await res.json()) as { post?: { id: string }; error?: string };

      if (res.status === 401) {
        // Shouldn't reach here since we gate below, but handle anyway
        signIn("github");
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      onClose();
      router.push(`/community/${data.post!.id}`);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const isOpen = !!route;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-[var(--landing-accent)]" aria-hidden />
            <DialogTitle>Share to community</DialogTitle>
          </div>
          <DialogDescription>
            Post your route publicly so others can browse and load it into their map.
          </DialogDescription>
        </DialogHeader>

        {/* Not signed in */}
        {status !== "authenticated" ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <p className="text-sm text-[var(--landing-muted)]">
              Sign in with GitHub to share your route.
            </p>
            <button
              onClick={() => signIn("github")}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
            >
              Sign in with GitHub
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="share-title" className="text-sm font-medium text-[var(--landing-fg)]">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                id="share-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                required
                placeholder={route?.name ?? "My route"}
                className="rounded-lg border border-[var(--landing-border)] bg-[var(--landing-bg)] px-3 py-2 text-sm text-[var(--landing-fg)] outline-none placeholder:text-[var(--landing-muted)] focus:border-[var(--landing-accent)] focus:ring-1 focus:ring-[var(--landing-accent)]"
              />
              <p className="text-right text-xs text-[var(--landing-muted)]">
                {title.length}/120
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="share-desc" className="text-sm font-medium text-[var(--landing-fg)]">
                Description
              </label>
              <textarea
                id="share-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="What makes this route interesting?"
                className="resize-none rounded-lg border border-[var(--landing-border)] bg-[var(--landing-bg)] px-3 py-2 text-sm text-[var(--landing-fg)] outline-none placeholder:text-[var(--landing-muted)] focus:border-[var(--landing-accent)] focus:ring-1 focus:ring-[var(--landing-accent)]"
              />
            </div>

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[var(--landing-border)] px-4 py-2 text-sm font-medium text-[var(--landing-muted)] transition-colors hover:text-[var(--landing-fg)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !title.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--landing-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#006b2d] disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Share
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
