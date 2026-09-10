/**
 * Underserved-corridor data produced offline by scripts/build_network_gaps.py
 * and served as a static file from public/gotransit/derived/network_gaps.json.
 */

export interface GapEndpoint {
  code: string;
  name: string;
  lat: number;
  lon: number;
}

export interface NetworkGap {
  id: string;
  headline: string;
  note: string;
  /** The route type this corridor is a candidate for. Phase 1 is bus-only. */
  mode: "bus" | "train";
  straightLineKm: number;
  freeFlowMin: number;
  current: {
    minutes: number;
    transfers: number;
    direct: boolean;
    reachable: boolean;
  };
  demand: number;
  demandLabel: "high" | "moderate" | "light";
  score: number;
  from: GapEndpoint;
  to: GapEndpoint;
}

export interface NetworkGapsFile {
  generatedAt: string;
  method: string;
  count: number;
  gaps: NetworkGap[];
}

export async function fetchNetworkGaps(signal?: AbortSignal): Promise<NetworkGapsFile> {
  const res = await fetch("/gotransit/derived/network_gaps.json", { signal });
  if (!res.ok) throw new Error(`network_gaps.json ${res.status}`);
  return (await res.json()) as NetworkGapsFile;
}
