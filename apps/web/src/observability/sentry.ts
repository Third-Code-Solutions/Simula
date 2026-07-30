import type { Event, EventHint } from "@sentry/nextjs";

const DEPLOYMENT_ENVIRONMENTS = new Set([
  "local",
  "test",
  "preview",
  "staging",
  "production",
]);
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/;

export interface WebSentryConfig {
  readonly dsn?: string;
  readonly enabled: boolean;
  readonly environment: string;
  readonly releaseSha: string;
}

function parseEnabled(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase() ?? "false";
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  throw new Error("web telemetry enablement must be true or false");
}

function parseDsn(value: string | undefined, environment: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error("a Sentry DSN is required when web telemetry is enabled");
  }
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("the Sentry DSN must be an absolute URL");
  }
  const localHttp =
    environment === "local" &&
    parsed.protocol === "http:" &&
    (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost");
  if (parsed.protocol !== "https:" && !localHttp) {
    throw new Error(
      "the Sentry DSN must use HTTPS outside local loopback development",
    );
  }
  if (parsed.search || parsed.hash) {
    throw new Error(
      "the Sentry DSN must not contain query parameters or a fragment",
    );
  }
  return parsed.toString();
}

export function readWebSentryConfig(input: {
  readonly dsn?: string;
  readonly enabled?: string;
  readonly environment?: string;
  readonly releaseSha?: string;
}): WebSentryConfig {
  const enabled = parseEnabled(input.enabled);
  const environment = input.environment?.trim() || "local";
  const releaseSha = input.releaseSha?.trim() || "0".repeat(40);
  if (!enabled) {
    return { enabled, environment, releaseSha };
  }
  if (!DEPLOYMENT_ENVIRONMENTS.has(environment)) {
    throw new Error("web telemetry environment is unsupported");
  }
  if (!RELEASE_SHA_PATTERN.test(releaseSha)) {
    throw new Error(
      "web telemetry release must be an exact lowercase 40-character git SHA",
    );
  }
  return {
    dsn: parseDsn(input.dsn, environment),
    enabled,
    environment,
    releaseSha,
  };
}

export function sanitizeWebSentryEvent<TEvent extends Event>(
  event: TEvent,
  _hint: EventHint,
  environment: string,
  runtime: "browser" | "edge" | "server",
): TEvent {
  delete event.breadcrumbs;
  delete event.contexts;
  delete event.extra;
  delete event.message;
  delete event.request;
  delete event.transaction;
  delete event.user;
  event.tags = { environment, runtime, service: "web" };
  for (const value of event.exception?.values ?? []) {
    value.value = value.type ?? "RedactedException";
  }
  return event;
}
