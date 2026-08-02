import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const containerName = "supabase_db_simula-local";

function localAdminDatabaseUrl() {
  const containerId = execFileSync(
    "docker",
    ["ps", "--filter", `name=^/${containerName}$`, "--format", "{{.ID}}"],
    { encoding: "utf8" },
  )
    .trim()
    .split(/\r?\n/, 1)[0];

  if (!containerId) {
    throw new Error(`disposable Supabase container ${containerName} is unavailable`);
  }

  const password = randomBytes(32).toString("hex");
  const alterPasswordSql = `alter role supabase_admin password '${password}'`;
  let passwordConfigured = false;

  for (const bootstrapRole of ["supabase_admin", "postgres"]) {
    const result = spawnSync(
      "docker",
      [
        "exec",
        containerId,
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        bootstrapRole,
        "-d",
        "postgres",
        "-c",
        alterPasswordSql,
      ],
      { stdio: "ignore", timeout: 10_000 },
    );

    if (result.status === 0) {
      passwordConfigured = true;
      break;
    }
  }

  if (!passwordConfigured) {
    throw new Error("could not configure the disposable Supabase admin test credential");
  }

  const superuserCheck = spawnSync(
    "docker",
    [
      "exec",
      containerId,
      "psql",
      "-At",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      "select rolsuper from pg_catalog.pg_roles where rolname = 'supabase_admin'",
    ],
    { encoding: "utf8", timeout: 10_000 },
  );

  if (superuserCheck.status !== 0 || superuserCheck.stdout.trim() !== "t") {
    throw new Error("disposable Supabase admin test role is not superuser");
  }

  return `postgresql://supabase_admin:${password}@127.0.0.1:54322/postgres?sslmode=disable`;
}

const testArgs = ["exec", "supabase", "test", "db", "supabase/tests"];
if (process.env.SIMULA_SUPABASE_TEST_AS_ADMIN === "true") {
  testArgs.push("--db-url", localAdminDatabaseUrl());
} else {
  testArgs.push("--local");
}

const result = spawnSync("pnpm", testArgs, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
