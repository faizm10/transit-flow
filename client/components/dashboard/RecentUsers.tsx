import Image from "next/image";

interface User {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  login: string | null;
  createdAt: Date | null;
}

export function RecentUsers({ users }: { users: User[] }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="font-semibold text-gray-900">Recent signups</h2>
      </div>

      {users.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-gray-400">No users yet.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-6 py-3">
              {u.avatarUrl ? (
                <Image
                  src={u.avatarUrl}
                  alt={u.name ?? "avatar"}
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-400">
                  {(u.name ?? u.login ?? "?")[0].toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">
                  {u.name ?? u.login ?? "Unknown"}
                </p>
                {u.login && (
                  <p className="truncate text-xs text-gray-400">@{u.login}</p>
                )}
              </div>
              {u.createdAt && (
                <time className="shrink-0 text-xs text-gray-300">
                  {new Date(u.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                </time>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
