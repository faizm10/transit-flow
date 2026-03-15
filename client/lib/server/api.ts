import { NextRequest, NextResponse } from "next/server";

type JsonRecord = Record<string, unknown>;

type RateLimitWindow = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  bucket: string;
  limit: number;
  windowMs: number;
};

type JsonBodyOptions = {
  maxBytes?: number;
};

const rateLimitStore = new Map<string, RateLimitWindow>();
const DEFAULT_JSON_BYTES = 16_384;

function cleanupRateLimitStore(now: number) {
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

function buildApiResponse(
  payload: JsonRecord,
  init?: ResponseInit,
) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...init?.headers,
    },
  });
}

export function jsonError(
  status: number,
  error: string,
  details?: string,
  extras?: JsonRecord,
) {
  return buildApiResponse(
    {
      error,
      ...(details ? { details } : {}),
      ...(extras ?? {}),
    },
    { status },
  );
}

export function jsonOk(payload: JsonRecord, init?: ResponseInit) {
  return buildApiResponse(payload, init);
}

export function getClientIp(request: NextRequest | Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "anonymous";
  }
  return request.headers.get("x-real-ip")?.trim() || "anonymous";
}

export function applyRateLimit(
  request: NextRequest,
  options: RateLimitOptions,
) {
  const now = Date.now();
  cleanupRateLimitStore(now);

  const key = `${options.bucket}:${getClientIp(request)}`;
  const current = rateLimitStore.get(key);
  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return null;
  }

  if (current.count >= options.limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((current.resetAt - now) / 1000),
    );
    return jsonError(
      429,
      "Rate limit exceeded",
      "Please wait before retrying this request.",
      {
        retryAfterSeconds,
      },
    );
  }

  current.count += 1;
  rateLimitStore.set(key, current);
  return null;
}

export async function readJsonBody<T>(
  request: NextRequest,
  options?: JsonBodyOptions,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  const maxBytes = options?.maxBytes ?? DEFAULT_JSON_BYTES;
  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
  if (contentLength !== null && Number.isFinite(contentLength) && contentLength > maxBytes) {
    return {
      ok: false,
      response: jsonError(
        413,
        "Request body too large",
        `Maximum supported request size is ${maxBytes} bytes.`,
      ),
    };
  }

  const raw = await request.text();
  if (raw.length > maxBytes) {
    return {
      ok: false,
      response: jsonError(
        413,
        "Request body too large",
        `Maximum supported request size is ${maxBytes} bytes.`,
      ),
    };
  }

  try {
    return {
      ok: true,
      data: JSON.parse(raw) as T,
    };
  } catch {
    return {
      ok: false,
      response: jsonError(400, "Invalid JSON body"),
    };
  }
}

export function normalizeString(
  value: unknown,
  options?: { maxLength?: number; trim?: boolean },
) {
  if (typeof value !== "string") return null;
  const normalized = options?.trim === false ? value : value.trim();
  if (!normalized) return null;
  if (options?.maxLength && normalized.length > options.maxLength) {
    return normalized.slice(0, options.maxLength);
  }
  return normalized;
}

export function normalizeStringArray(
  value: unknown,
  options?: { maxItems?: number; maxItemLength?: number },
) {
  if (!Array.isArray(value)) return [];
  const maxItems = options?.maxItems ?? 20;
  const items = value
    .map((item) => normalizeString(item, { maxLength: options?.maxItemLength ?? 64 }))
    .filter((item): item is string => Boolean(item));
  return items.slice(0, maxItems);
}

export function clampNumber(
  value: unknown,
  min: number,
  max: number,
) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.min(max, Math.max(min, numeric));
}

export async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  label: string,
) {
  let timeoutId: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function logApiEvent(
  route: string,
  stage: "request" | "success" | "error",
  details?: JsonRecord,
) {
  const payload = {
    route,
    stage,
    timestamp: new Date().toISOString(),
    ...(details ?? {}),
  };

  if (stage === "error") {
    console.error("[api]", payload);
    return;
  }

  console.info("[api]", payload);
}
