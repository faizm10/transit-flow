import type { Session } from "next-auth";

/** GitHub login OR Google email — same dual-identity check as /dashboard. */
export const OWNER_GITHUB = "faizm10";
export const OWNER_EMAIL = "faizmustansar10@gmail.com";

export function isOwnerSession(session: Session | null | undefined): boolean {
  if (!session?.user) return false;
  const login = (session.user as { login?: string }).login;
  const email = session.user.email;
  return login === OWNER_GITHUB || email === OWNER_EMAIL;
}
