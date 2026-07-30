import { spawn } from "node:child_process";
import { cpSync } from "node:fs";
import process from "node:process";

const authOrigin = "http://127.0.0.1:52140";
const apiOrigin = "http://127.0.0.1:52141";
const webEnvironment = {
  ...process.env,
  NEXT_PUBLIC_SIMULA_API_URL: apiOrigin,
  NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION: "v2",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_m2_browser_local",
  NEXT_PUBLIC_SUPABASE_URL: authOrigin,
  SIMULA_BEHAVIORAL_DEMO_ENABLED: "false",
  SIMULA_ENVIRONMENT: "test",
  SIMULA_PRIVATE_ASSET_WORKFLOW_ENABLED: "false",
  SIMULA_RELEASE_SHA: "a".repeat(40),
  SIMULA_TECHNICAL_VISUAL_PROFILE_ENABLED: "false",
};
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const safeCommandArgument = /^[A-Za-z0-9@/._:-]+$/;

if (!process.env.SIMULA_TEST_ADMIN_DATABASE_URL) {
  throw new Error(
    "SIMULA_TEST_ADMIN_DATABASE_URL is required for M2 browser proof.",
  );
}

async function run(arguments_, environment = process.env) {
  await new Promise((resolve, reject) => {
    if (arguments_.some((argument) => !safeCommandArgument.test(argument))) {
      reject(new Error("unsafe command argument in browser verifier"));
      return;
    }
    const command =
      process.platform === "win32"
        ? (process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe")
        : pnpm;
    const commandArguments =
      process.platform === "win32"
        ? ["/d", "/s", "/c", `${pnpm} ${arguments_.join(" ")}`]
        : arguments_;
    const child = spawn(command, commandArguments, {
      env: environment,
      shell: false,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `${pnpm} ${arguments_.join(" ")} failed (${code ?? signal})`,
          ),
        );
      }
    });
  });
}

await run(["--filter", "@simula/api", "build"]);
await run(["--filter", "@simula/web", "build"], webEnvironment);
cpSync(
  "apps/web/.next/static",
  "apps/web/.next/standalone/apps/web/.next/static",
  { force: true, recursive: true },
);
cpSync("apps/web/public", "apps/web/.next/standalone/apps/web/public", {
  force: true,
  recursive: true,
});
await run(
  ["exec", "playwright", "test", "--config", "playwright.m2.config.ts"],
  webEnvironment,
);
