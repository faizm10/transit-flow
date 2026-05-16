"use client";

import dynamic from "next/dynamic";
import type { CustomRoute } from "@/lib/gtfs";

const CommunityMapPreview = dynamic(
  () => import("@/components/community/CommunityMapPreview"),
  {
    ssr: false,
    loading: () => (
      <div className="h-72 w-full animate-pulse rounded-2xl bg-slate-100" />
    ),
  }
);

export default function CommunityMapPreviewWrapper({ route }: { route: CustomRoute }) {
  return <CommunityMapPreview route={route} />;
}
