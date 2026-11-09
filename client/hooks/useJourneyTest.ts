"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JourneyRequest, JourneyResult, JourneyWorkerMessage } from "@/lib/journey/protocol";

export type JourneyTestState =
  | { status: "idle" }
  | { status: "running"; phase: string; fraction?: number }
  | { status: "done"; result: JourneyResult }
  | { status: "error"; message: string };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A worker request without the id the hook assigns. */
export type JourneyTestInput = DistributiveOmit<JourneyRequest, "id">;

/**
 * Runs "Test this route" comparisons — one departure or a sweep — in a
 * dedicated worker. The worker lives as long as the component so the GO
 * timetable is downloaded once; responses to superseded requests are dropped.
 */
export function useJourneyTest() {
  const workerRef = useRef<Worker | null>(null);
  const latestId = useRef(0);
  const [state, setState] = useState<JourneyTestState>({ status: "idle" });

  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const getWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(new URL("../lib/workers/journeyPlanner.worker.ts", import.meta.url));
    worker.onmessage = (e: MessageEvent<JourneyWorkerMessage>) => {
      const msg = e.data;
      if (msg.id !== latestId.current) return;
      if (msg.type === "progress") setState({ status: "running", phase: msg.phase, fraction: msg.fraction });
      else if (msg.type === "error") setState({ status: "error", message: msg.message });
      else setState({ status: "done", result: msg.result });
    };
    worker.onerror = (e) => {
      setState({ status: "error", message: e.message || "Journey planner crashed" });
      worker.terminate();
      workerRef.current = null;
    };
    workerRef.current = worker;
    return worker;
  }, []);

  const run = useCallback((input: JourneyTestInput) => {
    const id = ++latestId.current;
    setState({ status: "running", phase: "Starting" });
    getWorker().postMessage({ id, ...input });
  }, [getWorker]);

  return { state, run };
}
