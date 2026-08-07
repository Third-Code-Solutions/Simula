import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("GET /api/health", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns non-cacheable runtime metadata", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      environment: "local",
      release_sha: "dev",
      service: "admin",
      status: "ok",
    });
  });

  it("falls back to the admitted release when Vercel provides an empty Git SHA", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    vi.stubEnv("SIMULA_RELEASE_SHA", "b".repeat(40));

    const response = GET();

    await expect(response.json()).resolves.toMatchObject({
      release_sha: "b".repeat(40),
    });
  });
});
