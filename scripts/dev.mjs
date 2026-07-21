import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const SAFE_WEB_ENVIRONMENT_KEYS = new Set([
  "NEXT_PUBLIC_SIMULA_API_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SIMULA_ENVIRONMENT",
  "SIMULA_RELEASE_SHA",
  "SIMULA_RESULT_EXPERIENCE_ENABLED",
]);

const REQUIRED_WEB_ENVIRONMENT_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];

export function resolveWebDevEnvironment(contents, inheritedEnvironment) {
  const safeFileEnvironment = {};

  for (const content of contents) {
    for (const [key, value] of Object.entries(parseEnv(content))) {
      if (SAFE_WEB_ENVIRONMENT_KEYS.has(key)) {
        safeFileEnvironment[key] = value;
      }
    }
  }

  return { ...safeFileEnvironment, ...inheritedEnvironment };
}

export function assertRequiredWebEnvironment(environment) {
  const missing = REQUIRED_WEB_ENVIRONMENT_KEYS.filter(
    (key) => !environment[key]?.trim(),
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing web development environment: ${missing.join(", ")}. Add the values to the repository .env.local file.`,
    );
  }
}

async function runDev() {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const contents = [".env", ".env.local"]
    .map((name) => join(repositoryRoot, name))
    .filter((path) => existsSync(path))
    .map((path) => readFileSync(path, "utf8"));
  const environment = resolveWebDevEnvironment(contents, process.env);
  assertRequiredWebEnvironment(environment);

  const turboEntry = join(
    repositoryRoot,
    "node_modules",
    "turbo",
    "bin",
    "turbo",
  );
  const child = spawn(process.execPath, [turboEntry, "run", "dev"], {
    cwd: repositoryRoot,
    env: environment,
    stdio: "inherit",
  });

  const result = await new Promise((accept, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => accept({ code, signal }));
  });

  if (result.signal) {
    process.kill(process.pid, result.signal);
    return;
  }

  process.exitCode = result.code ?? 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runDev().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
