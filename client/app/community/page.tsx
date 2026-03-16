import { CommunityPageClient } from "@/components/CommunityPageClient";

type CommunityPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CommunityPage({ searchParams }: CommunityPageProps) {
  const resolved = searchParams ? await searchParams : {};
  const type = resolved.type === "feedback" ? "feedback" : "bug";
  return <CommunityPageClient initialType={type} />;
}
