import { readObservabilityConfig } from "./observability-config";

const deployedEnvironment = {
  SIMULA_ENVIRONMENT: "staging",
  SIMULA_RELEASE_SHA: "a".repeat(40),
  SIMULA_SENTRY_DSN: "https://public@example.test/1",
  SIMULA_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:
    "https://collector.example.test/v1/traces",
  SIMULA_TELEMETRY_ENABLED: "true",
  SIMULA_TELEMETRY_TRACES_SAMPLE_RATE: "0.25",
};

describe("readObservabilityConfig", () => {
  it("is inert by default without requiring vendor credentials", () => {
    expect(readObservabilityConfig({}, "api")).toEqual({
      enabled: false,
      environment: "local",
      releaseSha: "0".repeat(40),
      service: "api",
      tracesSampleRate: 0.1,
    });
  });

  it("binds both exporters to trusted runtime identity", () => {
    expect(readObservabilityConfig(deployedEnvironment, "dispatcher")).toEqual({
      enabled: true,
      environment: "staging",
      releaseSha: "a".repeat(40),
      service: "dispatcher",
      sentryDsn: "https://public@example.test/1",
      otlpTracesEndpoint: "https://collector.example.test/v1/traces",
      tracesSampleRate: 0.25,
    });
  });

  it.each([
    ["SIMULA_TELEMETRY_ENABLED", "yes"],
    ["SIMULA_RELEASE_SHA", "preview"],
    ["SIMULA_SENTRY_DSN", "http://sentry.example.test/1"],
    [
      "SIMULA_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
      "https://collector.example.test",
    ],
    ["SIMULA_TELEMETRY_TRACES_SAMPLE_RATE", "1.1"],
  ])("rejects unsafe %s", (name, value) => {
    expect(() =>
      readObservabilityConfig(
        {
          ...deployedEnvironment,
          [name]: value,
        },
        "api",
      ),
    ).toThrow();
  });

  it("admits loopback HTTP collectors for local development only", () => {
    const config = readObservabilityConfig(
      {
        ...deployedEnvironment,
        SIMULA_ENVIRONMENT: "local",
        SIMULA_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:
          "http://127.0.0.1:4318/v1/traces",
      },
      "api",
    );

    expect(config.otlpTracesEndpoint).toBe("http://127.0.0.1:4318/v1/traces");
  });
});
