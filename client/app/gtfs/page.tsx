import { auth } from "@/lib/auth";
import GtfsClient from "./GtfsClient";

export default async function GtfsPage() {
  let authenticated = false;
  try {
    const session = await auth();
    authenticated = !!session?.user;
  } catch {
    // auth() can throw in some environments; treat as unauthenticated.
    // The upload API still enforces auth server-side and returns 401.
  }
  return <GtfsClient authenticated={authenticated} />;
}
