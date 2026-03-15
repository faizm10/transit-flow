import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  applyRateLimit,
  clampNumber,
  jsonError,
  logApiEvent,
  normalizeString,
  normalizeStringArray,
  readJsonBody,
  withTimeout,
} from "@/lib/server/api";
import { resolveAppUrl } from "@/lib/server/origin";

type OptimizerRequest = {
  routeName: string;
  startStopName: string;
  endStopName: string;
  durationMinutes: number;
  stopsCount: number;
  nearbyGoRouteNames: string[];
};

type OptimizerResponse = {
  suggestedStartTime: string;
  suggestedEndTime: string;
  suggestedIntervalMinutes: number;
  reasoning: string;
};

type FrequencyResult = {
  route_short_name: string;
  peakFrequencyWeekday: number;
  averageHeadway: number;
  startStopName?: string;
  endStopName?: string;
};

function buildFallbackSchedule(body: {
  routeName: string;
  durationMinutes: number;
  nearbyGoRouteNames: string[];
}): OptimizerResponse {
  const interval = body.nearbyGoRouteNames.length > 0 ? 20 : 30;
  const serviceEndHour = body.durationMinutes >= 90 ? "21:30" : "22:30";
  return {
    suggestedStartTime: "06:00",
    suggestedEndTime: serviceEndHour,
    suggestedIntervalMinutes: interval,
    reasoning:
      "Using a deterministic beta fallback: earlier commuter start times with moderate peak-friendly frequency.",
  };
}

export async function POST(request: NextRequest) {
  const requestStartedAt = Date.now();
  logApiEvent("/api/schedule-optimizer", "request");

  const limited = applyRateLimit(request, {
    bucket: "schedule-optimizer",
    limit: 8,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const bodyResult = await readJsonBody<OptimizerRequest>(request, {
      maxBytes: 10_000,
    });
    if (!bodyResult.ok) return bodyResult.response;

    const routeName = normalizeString(bodyResult.data.routeName, { maxLength: 80 });
    const startStopName = normalizeString(bodyResult.data.startStopName, { maxLength: 80 }) ?? "";
    const endStopName = normalizeString(bodyResult.data.endStopName, { maxLength: 80 }) ?? "";
    const durationMinutes = clampNumber(bodyResult.data.durationMinutes, 5, 240);
    const stopsCount = clampNumber(bodyResult.data.stopsCount, 2, 80);
    const nearbyGoRouteNames = normalizeStringArray(bodyResult.data.nearbyGoRouteNames, {
      maxItems: 12,
      maxItemLength: 16,
    });

    if (!routeName) {
      return jsonError(400, "routeName is required");
    }
    if (durationMinutes === null || stopsCount === null) {
      return jsonError(400, "durationMinutes and stopsCount must be valid numbers");
    }

    // Fetch GO Transit frequency context for nearby routes
    let goFrequencyContext = "";
    if (nearbyGoRouteNames.length > 0) {
      try {
        const baseUrl = resolveAppUrl(request);
        const freqResponse = await withTimeout(
          fetch(`${baseUrl}/api/gotransit/frequency`, {
            headers: {
              "x-transitflow-internal": "schedule-optimizer",
            },
          }),
          5000,
          "GO frequency context",
        );
        if (freqResponse.ok) {
          const freqData = (await freqResponse.json()) as {
            results: FrequencyResult[];
          };
          const nearbyFreqs = (freqData.results ?? []).filter((r) =>
            nearbyGoRouteNames.includes(r.route_short_name)
          );
          if (nearbyFreqs.length > 0) {
            goFrequencyContext = nearbyFreqs
              .map(
                (r) =>
                  `- GO Route ${r.route_short_name}${r.startStopName ? ` (${r.startStopName} → ${r.endStopName})` : ""}: ` +
                  `peak ${r.peakFrequencyWeekday} trips/hr, avg headway ${Math.round(r.averageHeadway)} min`
              )
              .join("\n");
          }
        }
      } catch {
        // Non-fatal — proceed without frequency context
      }
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          ...buildFallbackSchedule({ routeName, durationMinutes, nearbyGoRouteNames }),
          degraded: true,
          fallbackReason: "ANTHROPIC_API_KEY is not configured",
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const prompt = `You are a transit planning assistant for the Greater Toronto Area.

A custom transit route has been designed:
- Route name: ${routeName}
- From: ${startStopName || "Start"}
- To: ${endStopName || "End"}
- Trip duration: ${durationMinutes} minutes
- Number of stops: ${stopsCount}
${
  goFrequencyContext
    ? `\nNearby GO Transit routes for context:\n${goFrequencyContext}`
    : nearbyGoRouteNames.length > 0
      ? `\nNearby GO Transit routes: ${nearbyGoRouteNames.join(", ")}`
      : ""
}

Suggest an optimal weekday service schedule. Consider:
1. GTA commuter peak hours: 06:00–09:00 AM and 15:30–18:30 PM
2. Service gaps in nearby GO Transit routes (if provided)
3. Route duration and number of stops
4. Reasonable operating hours (not before 05:30 or after 23:30)
5. Shorter headways during peak hours are preferable

Respond ONLY with a JSON object (no markdown, no code blocks, no explanation outside JSON):
{"suggestedStartTime":"HH:MM","suggestedEndTime":"HH:MM","suggestedIntervalMinutes":<number>,"reasoning":"<1-2 sentence explanation>"}`;

    const message = await withTimeout(
      client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      }),
      12_000,
      "Anthropic schedule optimizer",
    );

    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json(
        {
          ...buildFallbackSchedule({ routeName, durationMinutes, nearbyGoRouteNames }),
          degraded: true,
          fallbackReason: "No text response returned from Anthropic",
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    let parsed: OptimizerResponse;
    try {
      // Strip any markdown fences if the model adds them despite instructions
      const raw = textContent.text
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      parsed = JSON.parse(raw) as OptimizerResponse;
    } catch {
      return NextResponse.json(
        {
          ...buildFallbackSchedule({ routeName, durationMinutes, nearbyGoRouteNames }),
          degraded: true,
          fallbackReason: "Anthropic returned unparseable JSON",
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    logApiEvent("/api/schedule-optimizer", "success", {
      durationMs: Date.now() - requestStartedAt,
      degraded: false,
    });
    return NextResponse.json(parsed, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logApiEvent("/api/schedule-optimizer", "error", {
      durationMs: Date.now() - requestStartedAt,
      message,
    });
    return NextResponse.json(
      {
        ...buildFallbackSchedule({
          routeName: "TransitFlow Route",
          durationMinutes: 30,
          nearbyGoRouteNames: [],
        }),
        degraded: true,
        fallbackReason: message,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
