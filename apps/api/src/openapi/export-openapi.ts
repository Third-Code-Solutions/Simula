import "reflect-metadata";

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createApplication } from "../application";
import { buildOpenApiDocument } from "./openapi-document";

const CONTRACT_PATH = resolve(__dirname, "../../openapi.json");

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function exportOpenApi(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== "--check" && mode !== "--write") {
    throw new Error("Expected --check or --write.");
  }

  const app = await createApplication({});
  await app.init();

  try {
    const generated = canonicalJson(buildOpenApiDocument(app));
    if (mode === "--write") {
      await writeFile(CONTRACT_PATH, generated, "utf8");
      return;
    }

    const committed = await readFile(CONTRACT_PATH, "utf8");
    if (committed !== generated) {
      throw new Error(
        "NestJS OpenAPI drift detected. Run pnpm --filter @simula/api openapi:generate.",
      );
    }
  } finally {
    await app.close();
  }
}

void exportOpenApi();
