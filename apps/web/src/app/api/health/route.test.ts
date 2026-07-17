import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("GET /api/health", () => {
  it("returns non-cacheable runtime metadata", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      environment: "local",
      releaseSha: "dev",
      service: "web",
      status: "ok",
    });
  });
});
