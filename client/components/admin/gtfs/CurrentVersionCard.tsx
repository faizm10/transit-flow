import type { GtfsVersion } from "@/lib/gtfsIngestion/types";
import { formatImportedAt } from "@/lib/gtfsIngestion/format";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}

export function CurrentVersionCard({ version }: { version: GtfsVersion | null }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-gray-900">Current GTFS version</h2>
      <p className="mt-0.5 text-xs text-gray-400">Active artifacts served by Explore / Simulate</p>

      {version ? (
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Active version" value={version.version} />
          <Field label="Source" value={version.source} />
          <Field label="Imported" value={formatImportedAt(version.importedAt)} />
          <Field label="Processing status" value={version.status} />
        </dl>
      ) : (
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Active version" value="—" />
          <Field label="Source" value="—" />
          <Field label="Imported" value="—" />
          <Field label="Processing status" value="—" />
        </dl>
      )}
    </section>
  );
}
