import type { Session } from "next-auth";
import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";

type SessionUser = Session["user"] & { login?: string };

/**
 * Syncs the authenticated user into the community_users table.
 * Called at the start of every write handler (post, like, comment).
 */
export async function upsertUser(session: Session): Promise<void> {
  const user = session.user as SessionUser;
  if (!user?.id) return;

  await db
    .insert(users)
    .values({
      id: user.id,
      name: user.name ?? null,
      avatarUrl: user.image ?? null,
      githubLogin: user.login ?? null,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        name: user.name ?? null,
        avatarUrl: user.image ?? null,
        githubLogin: user.login ?? null,
      },
    });
}

// Re-export for convenience
export { eq };
