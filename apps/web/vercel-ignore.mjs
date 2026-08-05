import { execFileSync, spawnSync } from "node:child_process";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = dirname(fileURLToPath(import.meta.url));
let repositoryRoot;
try {
  repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: appDirectory,
    encoding: "utf8",
  }).trim();
} catch {
  console.error(
    "Vercel Git metadata is unavailable; continuing with the build.",
  );
  process.exit(1);
}
const appPath = relative(repositoryRoot, appDirectory).replaceAll("\\", "/");
const relevantPaths = [
  appPath,
  "packages/contracts",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig.base.json",
];
const result = spawnSync(
  "git",
  ["diff", "--quiet", "HEAD^", "HEAD", "--", ...relevantPaths],
  { cwd: repositoryRoot, stdio: "inherit" },
);

if (result.error || (result.status !== 0 && result.status !== 1)) {
  console.error("Vercel ignore check failed; continuing with the build.");
  process.exit(1);
}

process.exit(result.status ?? 1);
