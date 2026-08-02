import "./instrumentation";
import "reflect-metadata";

import { createApplication } from "./application";
import { observabilityRuntime } from "./instrumentation";

function readPort(value: string | undefined): number {
  if (value === undefined) {
    return 8080;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer from 1 through 65535.");
  }

  return port;
}

async function bootstrap(): Promise<void> {
  const app = await createApplication();
  await app.listen(readPort(process.env.PORT), "0.0.0.0");
}

void bootstrap().catch(async (error: unknown) => {
  observabilityRuntime.captureException(error);
  await observabilityRuntime.shutdown();
  process.exitCode = 1;
});
