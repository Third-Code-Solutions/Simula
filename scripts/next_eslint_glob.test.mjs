import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

for (const app of ["web", "admin"]) {
  test(`${app}: Next root globs preserve directory discovery and link linting`, () => {
    const appRequire = createRequire(
      new URL(`../apps/${app}/package.json`, import.meta.url),
    );
    const configRequire = createRequire(
      appRequire.resolve("eslint-config-next"),
    );
    const pluginPath = configRequire.resolve("@next/eslint-plugin-next");
    const plugin = configRequire("@next/eslint-plugin-next");
    const { getRootDirs } = configRequire(
      join(dirname(pluginPath), "utils/get-root-dirs.js"),
    );
    const { Linter } = appRequire("eslint");
    const fixture = mkdtempSync(join(tmpdir(), "simula-next-glob-"));
    const previousCwd = process.cwd();
    try {
      for (const root of [".", "apps/web", "apps/admin", "apps/.hidden"]) {
        mkdirSync(join(fixture, root, "pages"), { recursive: true });
        writeFileSync(
          join(fixture, root, "pages/index.tsx"),
          "export default () => null;",
        );
      }
      writeFileSync(join(fixture, "apps/file.txt"), "not a directory");
      symlinkSync(
        join(fixture, "apps/web"),
        join(fixture, "linked-web"),
        process.platform === "win32" ? "junction" : "dir",
      );
      process.chdir(fixture);
      assert.throws(
        () =>
          getRootDirs({ cwd: fixture, settings: { next: { rootDir: "" } } }),
        {
          name: "TypeError",
          message:
            "Patterns must be a string (non empty) or an array of strings",
        },
      );
      const cases = [
        [undefined, ["."]],
        ["apps/web", ["apps/web"]],
        ["./apps/web/", ["apps/web"]],
        ["apps\\web", ["apps/web"]],
        [join(fixture, "apps/web"), ["apps/web"]],
        ["apps/*", ["apps/admin", "apps/web"]],
        ["apps/{web,admin}", ["apps/admin", "apps/web"]],
        ["apps/@(web|admin)", ["apps/admin", "apps/web"]],
        [
          ["apps/web", "apps/admin", null],
          ["apps/admin", "apps/web"],
        ],
        ["apps/.hidden", ["apps/.hidden"]],
        ["linked-*", ["linked-web"]],
        ["missing", []],
        ["apps/file.txt", []],
        [`apps/${"{".repeat(4500)}web,admin${"}".repeat(4500)}`, []],
      ];
      assert.deepEqual(
        getRootDirs({
          cwd: fixture,
          settings: { next: { rootDir: "**/pages" } },
        })
          .map((dir) => resolve(dir))
          .sort(),
        ["pages", "apps/web/pages", "apps/admin/pages", "linked-web/pages"]
          .map((dir) => resolve(dir))
          .sort(),
        "globstar follows directory symlinks",
      );
      for (const [rootDir, expected] of cases) {
        const settings = { next: { rootDir } };
        assert.deepEqual(
          getRootDirs({ cwd: fixture, settings })
            .map((dir) => resolve(dir))
            .sort(),
          expected.map((dir) => resolve(dir)).sort(),
          `directory discovery: ${JSON.stringify(rootDir)}`,
        );
        if (expected.length === 0) continue;
        const lintConfig = {
          files: ["**/*.jsx"],
          languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
          plugins: { next: plugin },
          settings,
          rules: { "next/no-html-link-for-pages": "error" },
        };
        const linter = new Linter({ cwd: fixture });
        const messages = linter.verify(
          '<a href="/">Home</a>',
          lintConfig,
          "probe.jsx",
        );
        assert.equal(messages.length, 1, JSON.stringify(rootDir));
        assert.equal(messages[0].ruleId, "next/no-html-link-for-pages");
        assert.equal(messages[0].severity, 2);
        assert.deepEqual(
          linter.verify(
            '<a href="https://example.com">External</a>',
            lintConfig,
            "probe.jsx",
          ),
          [],
        );
      }
    } finally {
      process.chdir(previousCwd);
      rmSync(fixture, { recursive: true, force: true });
    }
  });
}
