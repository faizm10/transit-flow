"use client";

import { useRef, useState } from "react";
import { CloudUpload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/gtfsIngestion/format";

interface GtfsUploadCardProps {
  submitting: boolean;
  onStart: (file: File) => void;
}

export function GtfsUploadCard({ submitting, onStart }: GtfsUploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const pick = (next: File | undefined) => {
    if (!next) return;
    if (!next.name.toLowerCase().endsWith(".zip")) {
      setError("Only .zip GTFS archives are accepted");
      setFile(null);
      return;
    }
    setError(null);
    setFile(next);
  };

  const clear = () => {
    setFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-gray-900">Upload new GTFS</h2>
      <p className="mt-0.5 text-xs text-gray-400">
        File stays in the browser. Start ingestion calls a stub — nothing is stored.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {!file ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          className={`mt-4 flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 transition-colors ${
            dragOver
              ? "border-[#007A33] bg-green-50/60"
              : "border-gray-200 bg-gray-50/80 hover:border-[#007A33]/50"
          }`}
        >
          <CloudUpload className="size-5 text-gray-400" aria-hidden />
          <p className="text-sm font-medium text-gray-800">
            Drop a GTFS <span className="font-mono text-xs">.zip</span> here
          </p>
          <p className="text-xs text-gray-400">or click to browse</p>
        </button>
      ) : (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm font-medium text-gray-900">{file.name}</p>
            <p className="text-xs tabular-nums text-gray-400">{formatBytes(file.size)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              Change
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Remove file"
              onClick={clear}
            >
              <X />
            </Button>
          </div>
        </div>
      )}

      {error ? (
        <p className="mt-3 text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end">
        <Button
          type="button"
          disabled={!file || submitting}
          onClick={() => file && onStart(file)}
        >
          {submitting ? "Starting…" : "Start ingestion"}
        </Button>
      </div>
    </section>
  );
}
