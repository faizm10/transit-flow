"use client";

import { useEffect, useState } from "react";
import { getGtfsAdminSnapshot, startIngestion } from "@/lib/gtfsIngestion/client";
import type { GtfsAdminSnapshot, GtfsIngestionJob } from "@/lib/gtfsIngestion/types";
import { CurrentVersionCard } from "./CurrentVersionCard";
import { GtfsUploadCard } from "./GtfsUploadCard";
import { IngestionJobStatus } from "./IngestionJobStatus";
import { GtfsVersionHistory } from "./GtfsVersionHistory";

export function GtfsAdminPage() {
  const [snapshot, setSnapshot] = useState<GtfsAdminSnapshot | null>(null);
  const [jobOverride, setJobOverride] = useState<GtfsIngestionJob | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getGtfsAdminSnapshot()
      .then((data) => {
        if (!cancelled) setSnapshot(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Could not load GTFS admin data");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStart = async (file: File) => {
    setIngestError(null);
    setSubmitting(true);
    try {
      const { job } = await startIngestion({
        filename: file.name,
        byteSize: file.size,
      });
      setJobOverride(job);
    } catch (err: unknown) {
      setIngestError(err instanceof Error ? err.message : "Could not start ingestion");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
        {loadError}
      </p>
    );
  }

  if (!snapshot) {
    return <p className="text-sm text-gray-400">Loading pipeline snapshot…</p>;
  }

  const currentJob = jobOverride ?? snapshot.currentJob;

  return (
    <div className="flex flex-col gap-6">
      <CurrentVersionCard version={snapshot.activeVersion} />

      <div className="grid gap-6 lg:grid-cols-2">
        <GtfsUploadCard submitting={submitting} onStart={(file) => void handleStart(file)} />
        <IngestionJobStatus job={currentJob} />
      </div>

      {ingestError ? (
        <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {ingestError}
        </p>
      ) : null}

      <GtfsVersionHistory versions={snapshot.versions} />
    </div>
  );
}
