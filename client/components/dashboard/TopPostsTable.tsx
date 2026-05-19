import Link from "next/link";
import { Heart, Bus, Train } from "lucide-react";

interface Post {
  id: string;
  title: string;
  routeType: string;
  stopCount: number;
  likesCount: number;
  createdAt: Date | null;
  userName: string | null;
  userLogin: string | null;
}

export function TopPostsTable({ posts }: { posts: Post[] }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="font-semibold text-gray-900">Top posts by likes</h2>
      </div>

      {posts.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-gray-400">No posts yet.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {posts.map((post, i) => (
            <div key={post.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50 transition-colors">
              <span className="w-5 shrink-0 text-center text-sm font-medium text-gray-300">
                {i + 1}
              </span>

              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                {post.routeType === "train"
                  ? <Train className="h-3.5 w-3.5" />
                  : <Bus className="h-3.5 w-3.5" />}
              </span>

              <div className="min-w-0 flex-1">
                <Link
                  href={`/community/${post.id}`}
                  className="block truncate text-sm font-medium text-gray-800 hover:text-[#007A33]"
                >
                  {post.title}
                </Link>
                <p className="text-xs text-gray-400">
                  {post.userName ?? post.userLogin ?? "Unknown"} · {post.stopCount} stops
                  {post.createdAt && (
                    <> · {new Date(post.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}</>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-1 text-sm font-medium text-rose-500">
                <Heart className="h-3.5 w-3.5 fill-current" />
                {post.likesCount}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
