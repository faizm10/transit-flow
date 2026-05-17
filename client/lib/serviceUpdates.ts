// ── Types ─────────────────────────────────────────────────────────────────

export type AlertType = "delay" | "cancellation" | "information" | "other";

export interface ServiceAlert {
  id: string;
  title: string;
  body: string;
  routes: string[];   // GO short codes: "LW", "BR", "KI", etc.
  type: AlertType;
  postedAt: string;   // ISO 8601
}

export interface ServiceUpdatesResult {
  alerts: ServiceAlert[];
  fetchedAt: string;
  source: "nextdata" | "html-fallback" | "error";
}

// ── GO Line name → short code map ─────────────────────────────────────────

const LINE_NAME_MAP: Record<string, string> = {
  "barrie":          "BR",
  "kitchener":       "KI",
  "lakeshore east":  "LE",
  "lakeshore west":  "LW",
  "milton":          "MI",
  "richmond hill":   "RH",
  "stouffville":     "ST",
  "up express":      "UP",
  "union pearson":   "UP",
};

function extractRoutes(raw: unknown): string[] {
  const candidates: string[] = [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") candidates.push(item);
      else if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        const val = obj.name ?? obj.code ?? obj.shortName ?? obj.id;
        if (typeof val === "string") candidates.push(val);
      }
    }
  } else if (typeof raw === "string") {
    candidates.push(raw);
  }

  const result: string[] = [];
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    const upper = candidate.toUpperCase().trim();
    if (["BR", "KI", "LE", "LW", "MI", "RH", "ST", "UP"].includes(upper)) {
      result.push(upper);
      continue;
    }
    for (const [name, code] of Object.entries(LINE_NAME_MAP)) {
      if (lower.includes(name)) {
        result.push(code);
        break;
      }
    }
  }
  return [...new Set(result)];
}

function extractRoutesFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const result: string[] = [];
  for (const [name, code] of Object.entries(LINE_NAME_MAP)) {
    if (lower.includes(name)) result.push(code);
  }
  return [...new Set(result)];
}

function classifyType(title: string, body: string): AlertType {
  const text = `${title} ${body}`.toLowerCase();
  if (/cancel|suspend|no service|discontinued/.test(text)) return "cancellation";
  if (/delay|slow|late|reduced|disruption|irregular/.test(text)) return "delay";
  if (/inform|notice|update|reminder|plan|change|advisory/.test(text)) return "information";
  return "other";
}

function pick<T>(obj: Record<string, unknown>, keys: string[]): T | undefined {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key] as T;
  }
  return undefined;
}

// ── __NEXT_DATA__ parser ──────────────────────────────────────────────────

function parseFromNextData(html: string, fetchedAt: string): ServiceUpdatesResult | null {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(match[1]);
  } catch {
    return null;
  }

  const props = json.props as Record<string, unknown> | undefined;
  const pageProps = (props?.pageProps ?? {}) as Record<string, unknown>;

  // Probe for the alerts array under common key names
  const candidateArrays = [
    pageProps.serviceAlerts,
    pageProps.alerts,
    pageProps.serviceUpdates,
    (pageProps.initialData as Record<string, unknown> | undefined)?.alerts,
    (pageProps.data as Record<string, unknown> | undefined)?.alerts,
    Array.isArray(pageProps.data) ? pageProps.data : undefined,
    (pageProps.pageData as Record<string, unknown> | undefined)?.serviceAlerts,
  ];

  let rawAlerts: unknown[] | undefined;
  for (const candidate of candidateArrays) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      rawAlerts = candidate;
      break;
    }
  }

  if (!rawAlerts) return null;

  const alerts: ServiceAlert[] = rawAlerts.map((raw, i) => {
    const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

    const title = String(
      pick<string>(obj, ["title", "heading", "subject", "alertTitle", "name"]) ?? "Service Alert"
    );
    const body = String(
      pick<string>(obj, ["description", "body", "message", "detail", "content", "text", "bodyText"]) ?? ""
    );
    const rawRoutes = pick<unknown>(obj, ["affectedRoutes", "routes", "lines", "affectedLines", "lineNames", "line"]);
    const rawDate = pick<string>(obj, ["publishedDate", "postedAt", "date", "createdAt", "timestamp", "updatedAt", "startDate"]);
    const rawType = pick<string>(obj, ["alertType", "type", "category", "severity"]);
    const rawId = pick<string>(obj, ["id", "code", "alertId", "messageId"]);

    const routes = extractRoutes(rawRoutes).length
      ? extractRoutes(rawRoutes)
      : extractRoutesFromText(`${title} ${body}`);

    const type: AlertType = rawType
      ? (/cancel|suspend/i.test(rawType) ? "cancellation"
        : /delay|slow|disruption/i.test(rawType) ? "delay"
        : /info|notice|advisory/i.test(rawType) ? "information"
        : classifyType(title, body))
      : classifyType(title, body);

    let postedAt = fetchedAt;
    if (rawDate) {
      const parsed = new Date(rawDate);
      if (!isNaN(parsed.getTime())) postedAt = parsed.toISOString();
    }

    return {
      id: String(rawId ?? `alert-${i}`),
      title,
      body,
      routes,
      type,
      postedAt,
    };
  });

  return { alerts, fetchedAt, source: "nextdata" };
}

// ── HTML fallback parser ──────────────────────────────────────────────────

function parseFromHtml(html: string, fetchedAt: string): ServiceUpdatesResult {
  const alerts: ServiceAlert[] = [];

  const articleMatches = [
    ...html.matchAll(
      /<(?:article|li|div)[^>]*(?:class|id)="[^"]*(?:alert|service-update|disruption|notice)[^"]*"[^>]*>([\s\S]*?)(?=<\/(?:article|li|div)>)/gi
    ),
  ];

  articleMatches.forEach((match, i) => {
    const block = match[1];
    const titleMatch = block.match(/<(?:h[2-4]|strong)[^>]*>([\s\S]*?)<\/(?:h[2-4]|strong)>/i);
    const title = titleMatch
      ? titleMatch[1].replace(/<[^>]+>/g, "").trim()
      : "Service Alert";

    const bodyParts: string[] = [];
    for (const p of block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
      const text = p[1].replace(/<[^>]+>/g, "").trim();
      if (text && text !== title) bodyParts.push(text);
    }
    const body = bodyParts.join(" ");
    if (!title && !body) return;

    alerts.push({
      id: `html-${i}`,
      title: title || "Service Alert",
      body,
      routes: extractRoutesFromText(`${title} ${body}`),
      type: classifyType(title, body),
      postedAt: fetchedAt,
    });
  });

  return { alerts, fetchedAt, source: "html-fallback" };
}

// ── Main fetch function (cached via Next.js Data Cache) ───────────────────
//
// Using fetch() with `next: { revalidate: 300 }` caches the raw HTTP
// response at the Next.js Data Cache layer for 5 minutes — no experimental
// flags required. Parsing is fast (CPU-only) and happens on each revalidation.

export async function fetchServiceUpdates(): Promise<ServiceUpdatesResult> {
  const fetchedAt = new Date().toISOString();

  try {
    const res = await fetch("https://www.gotransit.com/en/service-updates", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-CA,en;q=0.9",
      },
      next: { revalidate: 300, tags: ["service-updates"] },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return { alerts: [], fetchedAt, source: "error" };
    }

    const html = await res.text();

    // Primary: extract from __NEXT_DATA__
    const nextDataResult = parseFromNextData(html, fetchedAt);
    if (nextDataResult && nextDataResult.alerts.length > 0) {
      return nextDataResult;
    }

    // Fallback: HTML regex parse
    const htmlResult = parseFromHtml(html, fetchedAt);
    if (htmlResult.alerts.length > 0) return htmlResult;

    // No alerts found (valid — service may be running normally)
    return { alerts: [], fetchedAt, source: nextDataResult ? "nextdata" : "html-fallback" };
  } catch {
    return { alerts: [], fetchedAt, source: "error" };
  }
}
