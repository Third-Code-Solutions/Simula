import type { Event } from "@sentry/node";
import { RedactingSpanExporter, sanitizeSentryEvent } from "./redaction";

describe("observability redaction", () => {
  it("removes request, identity, content, and arbitrary diagnostic fields", () => {
    const result = sanitizeSentryEvent(
      {
        breadcrumbs: [{ message: "secret stimulus" }],
        contexts: { private: { rationale: "secret" } },
        exception: {
          values: [{ type: "ProviderError", value: "token=secret" }],
        },
        extra: { result: "secret result" },
        message: "secret message",
        request: {
          cookies: { session: "secret" },
          data: "secret body",
          headers: { authorization: "Bearer secret" },
          url: "https://example.test/path?token=secret",
        },
        transaction: "/organizations/private-id",
        user: { id: "private-user" },
      } as Event,
      {},
      "api",
      "staging",
    );

    expect(result).toEqual({
      exception: {
        values: [{ type: "ProviderError", value: "ProviderError" }],
      },
      tags: { environment: "staging", service: "api" },
    });
  });

  it("exports only bounded span names and allowlisted attributes", () => {
    const delegate = {
      export: jest.fn((_spans, callback) => callback({ code: 0 })),
      shutdown: jest.fn(async () => undefined),
    };
    const exporter = new RedactingSpanExporter(delegate);
    const callback = jest.fn();
    exporter.export(
      [
        {
          attributes: {
            "http.request.header.authorization": "Bearer secret",
            "http.request.method": "GET",
            "http.route": "/api/v2/runs/:run_id",
            "url.full": "https://example.test/runs/private?token=secret",
          },
          events: [
            {
              attributes: {
                "exception.message": "secret",
                "exception.type": "Error",
              },
              droppedAttributesCount: 0,
              name: "exception",
              time: [0, 0],
            },
          ],
          instrumentationScope: {
            name: "@opentelemetry/instrumentation-http",
            version: "0.0.0",
          },
          links: [
            {
              attributes: { private: "secret" },
              context: {
                spanId: "0".repeat(16),
                traceFlags: 0,
                traceId: "0".repeat(32),
              },
            },
          ],
          name: "GET /runs/private",
          status: { code: 2, message: "secret" },
        },
      ] as never,
      callback,
    );

    const exported = delegate.export.mock.calls[0]?.[0]?.[0];
    expect(exported).toMatchObject({
      attributes: {
        "http.request.method": "GET",
        "http.route": "/api/v2/runs/:run_id",
      },
      events: [{ attributes: { "exception.type": "Error" } }],
      links: [{ attributes: {} }],
      name: "http.request",
      status: { code: 2 },
    });
    expect(callback).toHaveBeenCalledWith({ code: 0 });
  });
});
