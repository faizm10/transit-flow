import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/authz";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

/**
 * Workspace chrome.
 *
 * Route group, so the URLs stay flat (`/datasets`, not `/workspace/datasets`).
 * The session is resolved here and passed down, which makes the shell a server
 * component and avoids the post-hydration flash the marketing header has.
 *
 * This layout does not gate access — the workspace is browsable signed out
 * (the map and community are public). Screens that own user data enforce their
 * own requirements.
 */
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <WorkspaceShell
      user={session?.user ?? null}
      isOwner={isOwner(session)}
    >
      {children}
    </WorkspaceShell>
  );
}
