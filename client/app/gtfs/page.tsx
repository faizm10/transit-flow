import { auth } from "@/lib/auth";
import GtfsClient from "./GtfsClient";

export default async function GtfsPage() {
  let user: { name?: string | null; email?: string | null; image?: string | null } | null = null;
  try {
    const session = await auth();
    user = session?.user ?? null;
  } catch {
    // auth() can throw in some environments; API enforces auth server-side.
  }
  return <GtfsClient user={user} />;
}
