import { describe, expect, it } from "vitest";

import { readWebSentryConfig, sanitizeWebSentryEvent } from "./sentry";

describe("web Sentry policy", () => {
  it("is disabled without public or server credentials", () => {
    expect(readWebSentryConfig({})).toEqual({
      enabled: false,
      environment: "local",
      releaseSha: "0".repeat(40),
    });
  });

  it("requires exact deployed identity and HTTPS", () => {
    expect(
      readWebSentryConfig({
        dsn: "https://public@example.test/1",
        enabled: "true",
        environment: "staging",
        releaseSha: "a".repeat(40),
      }),
    ).toEqual({
      dsn: "https://public@example.test/1",
      enabled: true,
      environment: "staging",
      releaseSha: "a".repeat(40),
    });
    expect(() =>
      readWebSentryConfig({
        dsn: "http://example.test/1",
        enabled: "true",
        environment: "staging",
        releaseSha: "a".repeat(40),
      }),
    ).toThrow();
  });

  it("removes identity, URL, payload, breadcrumbs, and error messages", () => {
    const event = sanitizeWebSentryEvent(
      {
        breadcrumbs: [{ message: "private stimulus" }],
        exception: {
          values: [{ type: "RenderError", value: "private result" }],
        },
        extra: { result: "private result" },
        message: "private message",
        request: {
          data: "private body",
          headers: { cookie: "secret" },
          url: "https://simula.test/projects/private",
        },
        transaction: "/projects/private",
        user: { id: "private-user" },
      },
      {},
      "staging",
      "browser",
    );

    expect(event).toEqual({
      exception: {
        values: [{ type: "RenderError", value: "RenderError" }],
      },
      tags: {
        environment: "staging",
        runtime: "browser",
        service: "web",
      },
    });
  });
});
