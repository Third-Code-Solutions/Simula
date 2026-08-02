import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import * as Sentry from "@sentry/node";

import {
  readObservabilityConfig,
  type ObservabilityService,
} from "./observability/observability-config";
import {
  RedactingSpanExporter,
  sanitizeSentryEvent,
} from "./observability/redaction";

interface ObservabilityRuntime {
  captureException(error: unknown): void;
  shutdown(): Promise<void>;
}

const disabledRuntime: ObservabilityRuntime = {
  captureException: () => undefined,
  shutdown: async () => undefined,
};

function serviceFromEntrypoint(): ObservabilityService {
  return process.argv.some((value) => value.includes("dispatcher"))
    ? "dispatcher"
    : "api";
}

function initialize(): ObservabilityRuntime {
  const config = readObservabilityConfig(process.env, serviceFromEntrypoint());
  if (!config.enabled) {
    return disabledRuntime;
  }

  Sentry.init({
    beforeSend: (event, hint) =>
      sanitizeSentryEvent(event, hint, config.service, config.environment),
    beforeSendTransaction: () => null,
    dsn: config.sentryDsn,
    environment: config.environment,
    includeLocalVariables: false,
    release: config.releaseSha,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });

  const traceExporter = new OTLPTraceExporter({
    url: config.otlpTracesEndpoint,
  });
  const sdk = new NodeSDK({
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-dns": { enabled: false },
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-net": { enabled: false },
      }),
    ],
    resource: resourceFromAttributes({
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: config.environment,
      [ATTR_SERVICE_NAME]: `simula-${config.service}`,
      [ATTR_SERVICE_VERSION]: config.releaseSha,
    }),
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(config.tracesSampleRate),
    }),
    spanProcessors: [
      new BatchSpanProcessor(new RedactingSpanExporter(traceExporter)),
    ],
  });
  sdk.start();

  return {
    captureException: (error) => {
      Sentry.captureException(error);
    },
    shutdown: async () => {
      await Promise.allSettled([sdk.shutdown(), Sentry.flush(2_000)]);
    },
  };
}

const globalRuntime = globalThis as typeof globalThis & {
  __simulaObservabilityRuntime?: ObservabilityRuntime;
};

export const observabilityRuntime =
  globalRuntime.__simulaObservabilityRuntime ?? initialize();
globalRuntime.__simulaObservabilityRuntime = observabilityRuntime;

process.once("beforeExit", () => {
  void observabilityRuntime.shutdown();
});
