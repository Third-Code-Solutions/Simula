import * as Sentry from "@sentry/nextjs";

import {
  readWebSentryConfig,
  sanitizeWebSentryEvent,
} from "./src/observability/sentry";

const config = readWebSentryConfig({
  dsn: process.env.SIMULA_SENTRY_DSN,
  enabled: process.env.SIMULA_TELEMETRY_ENABLED,
  environment: process.env.SIMULA_ENVIRONMENT,
  releaseSha: process.env.SIMULA_RELEASE_SHA,
});

Sentry.init({
  beforeSend: (event, hint) =>
    sanitizeWebSentryEvent(event, hint, config.environment, "edge"),
  beforeSendTransaction: () => null,
  dsn: config.dsn,
  enabled: config.enabled,
  environment: config.environment,
  release: config.releaseSha,
  sendDefaultPii: false,
  tracesSampleRate: 0,
});
