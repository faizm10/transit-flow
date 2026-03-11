import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as OptimizerRequest;
    const {
      routeName,
      startStopName,
      endStopName,
      durationMinutes,
      stopsCount,
      nearbyGoRouteNames,
    } = body;

    if (!routeName) {
      return NextResponse.json(
        { error: "routeName is required" },
        { status: 400 }
      );
    }

    // Fetch GO Transit frequency context for nearby routes
    let goFrequencyContext = "";
    if (nearbyGoRouteNames.length > 0) {
      try {
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const freqResponse = await fetch(
          `${baseUrl}/api/gotransit/frequency`,
          { signal: AbortSignal.timeout(5000) }
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

    const client = new Anthropic();

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

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
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
        { error: "AI returned unparseable response", raw: textContent.text },
        { status: 500 }
      );
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Schedule optimizer error:", error);
    return NextResponse.json(
      {
        error: "Failed to optimize schedule",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
