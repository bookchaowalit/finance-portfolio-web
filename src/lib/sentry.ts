// Sentry settings for the Node.js and Edge server runtimes (see instrumentation.ts).
// Errors only: no tracing, no trace headers on outgoing requests, no breadcrumbs.
// Off unless SENTRY_DSN is set on the host. The DSN is never committed.
//
// This dashboard renders finance data, so scrubbing is an allowlist: an event is
// rebuilt from the fields below and everything else (request URL, query, headers,
// cookies, user, extra, tags, breadcrumbs, stack-frame locals and source lines) is
// dropped before it leaves the server.

type Json = Record<string, unknown>;

const EVENT_FIELDS = ["event_id", "timestamp", "level", "platform", "logger", "release", "environment", "dist", "fingerprint"] as const;
const CONTEXT_FIELDS = ["runtime", "os"] as const;
const FRAME_FIELDS = ["filename", "module", "function", "lineno", "colno", "in_app"] as const;
const MECHANISM_FIELDS = ["type", "handled"] as const;
const MAX_MESSAGE_LENGTH = 500;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pick(source: Json, fields: readonly string[]): Json {
  const out: Json = {};
  for (const field of fields) {
    if (source[field] !== undefined) out[field] = source[field];
  }
  return out;
}

function clip(value: unknown): unknown {
  return typeof value === "string" && value.length > MAX_MESSAGE_LENGTH ? `${value.slice(0, MAX_MESSAGE_LENGTH)}…` : value;
}

function scrubException(value: unknown): Json | null {
  if (!isRecord(value)) return null;
  const out: Json = pick(value, ["type"]);
  if (value.value !== undefined) out.value = clip(value.value);
  if (isRecord(value.mechanism)) out.mechanism = pick(value.mechanism, MECHANISM_FIELDS);
  const frames = isRecord(value.stacktrace) && Array.isArray(value.stacktrace.frames) ? value.stacktrace.frames : null;
  if (frames) out.stacktrace = { frames: frames.filter(isRecord).map((frame) => pick(frame, FRAME_FIELDS)) };
  return out;
}

/** Rebuilds an event from allowlisted fields only. */
export function scrubEvent<T extends object>(event: T): T {
  const source = event as Json;
  const out: Json = pick(source, EVENT_FIELDS);

  if (typeof source.message === "string") out.message = clip(source.message);
  if (isRecord(source.exception) && Array.isArray(source.exception.values)) {
    out.exception = { values: source.exception.values.map(scrubException).filter((v): v is Json => v !== null) };
  }
  if (isRecord(source.contexts)) {
    const contexts: Json = {};
    for (const name of CONTEXT_FIELDS) {
      const context = source.contexts[name];
      if (isRecord(context)) contexts[name] = pick(context, ["name", "version"]);
    }
    out.contexts = contexts;
  }
  if (isRecord(source.sdk)) out.sdk = pick(source.sdk, ["name", "version"]);
  return out as T;
}

export function sentryOptions(dsn: string | undefined) {
  const trimmed = dsn?.trim() || undefined;
  return {
    dsn: trimmed,
    enabled: Boolean(trimmed),
    sendDefaultPii: false,
    tracesSampleRate: undefined,
    tracePropagationTargets: [] as string[],
    maxBreadcrumbs: 0,
    includeLocalVariables: false,
    beforeSend: scrubEvent,
    beforeSendTransaction: () => null,
  };
}
