import type { Event, EventHint } from "@sentry/node";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";

const SAFE_SPAN_ATTRIBUTES = new Set([
  "db.operation.name",
  "db.system",
  "error.type",
  "http.request.method",
  "http.response.status_code",
  "http.route",
  "messaging.operation.type",
  "messaging.system",
  "network.protocol.version",
  "rpc.method",
  "rpc.system",
  "server.port",
]);

function safeSpanName(span: ReadableSpan): string {
  const instrumentation = span.instrumentationScope.name;
  if (instrumentation.includes("http") || instrumentation.includes("express")) {
    return "http.request";
  }
  if (instrumentation.includes("pg")) {
    return "database.query";
  }
  if (instrumentation.includes("redis")) {
    return "redis.operation";
  }
  if (instrumentation.includes("bullmq")) {
    return "queue.operation";
  }
  return "internal.operation";
}

export function sanitizeSentryEvent<TEvent extends Event>(
  event: TEvent,
  _hint: EventHint,
  service: string,
  environment: string,
): TEvent {
  delete event.breadcrumbs;
  delete event.contexts;
  delete event.extra;
  delete event.request;
  delete event.user;
  delete event.message;
  delete event.transaction;
  event.tags = { environment, service };
  for (const value of event.exception?.values ?? []) {
    value.value = value.type ?? "RedactedException";
  }
  return event;
}

function sanitizeSpan(span: ReadableSpan): ReadableSpan {
  const attributes = Object.fromEntries(
    Object.entries(span.attributes).filter(([name]) =>
      SAFE_SPAN_ATTRIBUTES.has(name),
    ),
  );
  const events = span.events.map((event) => ({
    ...event,
    attributes:
      event.name === "exception" &&
      typeof event.attributes?.["exception.type"] === "string"
        ? { "exception.type": event.attributes["exception.type"] }
        : {},
  }));
  const links = span.links.map((link) => ({ ...link, attributes: {} }));
  return {
    ...span,
    attributes,
    events,
    links,
    name: safeSpanName(span),
    status: { code: span.status.code },
  };
}

export class RedactingSpanExporter implements SpanExporter {
  constructor(private readonly delegate: SpanExporter) {}

  export(
    spans: ReadableSpan[],
    resultCallback: Parameters<SpanExporter["export"]>[1],
  ): void {
    this.delegate.export(spans.map(sanitizeSpan), resultCallback);
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush?.() ?? Promise.resolve();
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }
}
