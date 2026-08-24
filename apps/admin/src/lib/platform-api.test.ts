import { afterEach, expect, test } from "vitest";

import { workspaceOrigin } from "./platform-api";

const workspaceEnvironmentKey = "NEXT_PUBLIC_SIMULA_WEB_URL";
const originalWorkspaceOrigin = process.env[workspaceEnvironmentKey];

afterEach(() => {
  if (originalWorkspaceOrigin === undefined) {
    delete process.env[workspaceEnvironmentKey];
  } else {
    process.env[workspaceEnvironmentKey] = originalWorkspaceOrigin;
  }
});

test("returns the canonical HTTP workspace origin", () => {
  process.env[workspaceEnvironmentKey] = "https://simula.example/workspace";

  expect(workspaceOrigin()).toBe("https://simula.example");
});

test.each([undefined, "not a URL", "ftp://simula.example"])(
  "does not return an invalid workspace origin: %s",
  (value) => {
    if (value === undefined) {
      delete process.env[workspaceEnvironmentKey];
    } else {
      process.env[workspaceEnvironmentKey] = value;
    }

    expect(workspaceOrigin()).toBeUndefined();
  },
);
