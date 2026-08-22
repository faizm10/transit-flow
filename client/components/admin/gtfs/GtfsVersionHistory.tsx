import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { GtfsVersion, GtfsVersionStatus } from "@/lib/gtfsIngestion/types";
import { formatDurationMs, formatImportedAt } from "@/lib/gtfsIngestion/format";

function statusVariant(
  status: GtfsVersionStatus
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "failed") return "destructive";
  if (status === "processing") return "outline";
  return "secondary";
}

export function GtfsVersionHistory({ versions }: { versions: GtfsVersion[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="font-semibold text-gray-900">GTFS version history</h2>
        <p className="mt-0.5 text-xs text-gray-400">
          Activate / rollback are UI placeholders until artifact storage exists.
        </p>
      </div>

      {versions.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-gray-400">No versions yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-180 text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-[11px] font-medium uppercase tracking-wider text-gray-400">
                <th className="px-6 py-2.5 font-medium">Version</th>
                <th className="px-3 py-2.5 font-medium">Source</th>
                <th className="px-3 py-2.5 font-medium">Imported at</th>
                <th className="px-3 py-2.5 font-medium">Duration</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Active</th>
                <th className="px-6 py-2.5 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-6 py-3 font-mono text-[13px] font-medium text-gray-900">
                    {v.version}
                  </td>
                  <td className="px-3 py-3 text-gray-600">{v.source}</td>
                  <td className="px-3 py-3 tabular-nums text-gray-600">
                    {formatImportedAt(v.importedAt)}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-gray-600">
                    {formatDurationMs(v.processingDurationMs)}
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={statusVariant(v.status)}>{v.status}</Badge>
                  </td>
                  <td className="px-3 py-3 text-gray-600">{v.isActive ? "yes" : "no"}</td>
                  <td className="px-6 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled
                        title="Not implemented — needs versioned artifact storage"
                      >
                        Activate
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled
                        title="Not implemented — needs versioned artifact storage"
                      >
                        Rollback
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
