"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Pencil, Trash2, MapPin, Heart, X, Check, Loader2, ExternalLink } from "lucide-react";

export interface AccountPost {
  id: string;
  title: string;
  description: string | null;
  routeType: string;
  color: string;
  stopCount: number;
  likesCount: number;
  createdAt: Date | string;
  previewUrl: string | null;
}

export default function AccountPostCard({ post }: { post: AccountPost }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [title, setTitle] = useState(post.title);
  const [description, setDescription] = useState(post.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const date = new Date(post.createdAt).toLocaleDateString("en-CA", {
    year: "numeric", month: "short", day: "numeric",
  });

  async function handleSave() {
    if (!title.trim()) { setError("Title is required"); return; }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/community/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? "Failed to save");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  async function handleDelete() {
    startTransition(async () => {
      const res = await fetch(`/api/community/posts/${post.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Failed to delete");
        setConfirmDelete(false);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Map preview */}
      <div className="relative h-44 w-full overflow-hidden bg-slate-100">
        {post.previewUrl ? (
          <Image
            src={post.previewUrl}
            alt={post.title}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <MapPin className="h-8 w-8 text-slate-300" />
          </div>
        )}
        {/* Route type badge */}
        <span
          className="absolute right-2 top-2 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white shadow"
          style={{ backgroundColor: post.color }}
        >
          {post.routeType === "train" ? "Train" : "Bus"}
        </span>
        {/* Accent bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: post.color }} />
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        {editing ? (
          /* ── Edit mode ── */
          <div className="flex flex-col gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Route name"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 focus:border-[#007A33] focus:outline-none focus:ring-1 focus:ring-[#007A33]"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Description (optional)"
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 focus:border-[#007A33] focus:outline-none focus:ring-1 focus:ring-[#007A33]"
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={isPending}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#007A33] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#005f28] disabled:opacity-60"
              >
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Save
              </button>
              <button
                onClick={() => { setEditing(false); setTitle(post.title); setDescription(post.description ?? ""); setError(null); }}
                disabled={isPending}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
            </div>
          </div>
        ) : confirmDelete ? (
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
                onClick={() => setConfirmDelete(false)}
                disabled={isPending}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          /* ── View mode ── */
          <>
            <div className="flex-1">
              <h3 className="line-clamp-1 text-sm font-semibold text-slate-900">{post.title}</h3>
              {post.description && (
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{post.description}</p>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{post.stopCount}</span>
              <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{post.likesCount}</span>
              <span className="ml-auto">{date}</span>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            {/* Action row */}
            <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
              <Link
                href={`/community/${post.id}`}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View post
              </Link>
              <button
                onClick={() => { setEditing(true); setConfirmDelete(false); }}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                onClick={() => { setConfirmDelete(true); setEditing(false); }}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
