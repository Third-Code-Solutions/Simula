import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
};

const sentryBuildValues = [
  process.env.SENTRY_AUTH_TOKEN,
  process.env.SENTRY_ORG,
  process.env.SENTRY_PROJECT,
];
const configuredSentryBuildValues = sentryBuildValues.filter(Boolean).length;
if (
  configuredSentryBuildValues !== 0 &&
  configuredSentryBuildValues !== sentryBuildValues.length
) {
  throw new Error(
    "Sentry source-map upload requires SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT together.",
  );
}

export default configuredSentryBuildValues === sentryBuildValues.length
  ? withSentryConfig(nextConfig, {
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: true,
      sourcemaps: {
        deleteSourcemapsAfterUpload: true,
      },
      telemetry: false,
    })
  : nextConfig;
