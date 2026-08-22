import type { Metadata } from "next";
import { GtfsAdminPage } from "@/components/admin/gtfs/GtfsAdminPage";

export const metadata: Metadata = {
  title: "GTFS pipeline",
  robots: { index: false, follow: false },
};

export default function AdminGtfsPage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-8 lg:px-10">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-gray-900">Official GO Transit GTFS</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          Controls the committed GO feed pipeline — not user city-feed overlays.
          Ingestion is stubbed: selecting a zip does not upload or process it yet.
        </p>
      </div>
      <GtfsAdminPage />
    </main>
  );
}
