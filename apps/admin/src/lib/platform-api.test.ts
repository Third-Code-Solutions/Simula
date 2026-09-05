import { afterEach, expect, test, vi } from "vitest";

import {
  workspaceOrigin,
  organizationOffset,
  loadPlatformAdminDashboard,
} from "./platform-api";

const workspaceEnvironmentKey = "NEXT_PUBLIC_SIMULA_WEB_URL";
const originalWorkspaceOrigin = process.env[workspaceEnvironmentKey];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
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

vi.mock("@/lib/supabase/server", () => ({
  getServerSupabaseClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { email: "admin@example.test" } },
        error: null,
      }),
      getSession: async () => ({
        data: { session: { access_token: "inert-test-session" } },
      }),
    },
  }),
}));

test.each([
  [undefined, 0],
  ["120", 120],
  ["139", 120],
  ["-20", 0],
  ["1000001", 0],
  ["1.5", 0],
  [["20", "40"], 0],
])("normalizes bounded organization offsets %j", (value, expected) => {
  expect(organizationOffset(value as string | string[] | undefined)).toBe(
    expected,
  );
});

test("fetches the requested server inventory page with a 30-second deadline", async () => {
  vi.stubEnv("NEXT_PUBLIC_SIMULA_API_URL", "https://api.example.test");
  const timeout = vi.spyOn(AbortSignal, "timeout");
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ organizations: [] }),
  });
  vi.stubGlobal("fetch", fetchMock);
  await loadPlatformAdminDashboard(120);
  expect(fetchMock).toHaveBeenCalledWith(
    "https://api.example.test/api/v1/platform-admin/dashboard?organization_limit=20&organization_offset=120",
    expect.objectContaining({
      cache: "no-store",
      signal: expect.any(AbortSignal),
    }),
  );
  expect(timeout).toHaveBeenCalledWith(30000);
});

test("does not replace a timed-out inventory request with fake success", async () => {
  vi.stubEnv("NEXT_PUBLIC_SIMULA_API_URL", "https://api.example.test");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockRejectedValue(new DOMException("Deadline exceeded", "TimeoutError")),
  );
  await expect(loadPlatformAdminDashboard()).rejects.toThrow(
    "Deadline exceeded",
  );
});
