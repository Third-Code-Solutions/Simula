import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  getBrowserSupabaseClient: () => ({
    auth: { getSession },
  }),
}));

import { createOrganization, listOrganizations } from "./api";

describe("SIMULA domain API client", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SIMULA_API_URL = "http://127.0.0.1:8000";
    getSession.mockReset();
    getSession.mockResolvedValue({
      data: { session: { access_token: "local-user-token" } },
      error: null,
    });
    vi.stubGlobal("fetch", vi.fn());
  });

  it("uses the user bearer token and an idempotency key for a domain command", async () => {
    const responseBody = {
      created_at: "2026-07-17T00:00:00Z",
      id: "00000000-0000-4000-8000-000000000001",
      name: "Northstar",
      role: "owner",
      status: "active",
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        headers: { "content-type": "application/json" },
        status: 201,
      }),
    );

    await expect(createOrganization("Northstar")).resolves.toEqual(
      responseBody,
    );

    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/organizations",
      expect.objectContaining({
        method: "POST",
        headers: expect.any(Headers),
      }),
    );
    const request = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    const headers = request.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer local-user-token");
    expect(headers.get("idempotency-key")).toMatch(/^.{16,128}$/);
    expect(headers.get("content-type")).toBe("application/json");
    expect(request.body).toBe(JSON.stringify({ name: "Northstar" }));
  });

  it("renders safe RFC 9457 details and correlation for a denied request", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "forbidden",
          correlation_id: "00000000-0000-4000-8000-000000000999",
          detail: "You do not have permission to mutate this organization.",
          instance: "/api/v1/organizations",
          status: 403,
          title: "Forbidden",
          type: "https://simula.local/problems/forbidden",
        }),
        {
          headers: { "content-type": "application/problem+json" },
          status: 403,
        },
      ),
    );

    await expect(listOrganizations()).rejects.toMatchObject({
      code: "forbidden",
      correlationId: "00000000-0000-4000-8000-000000000999",
      message: "You do not have permission to mutate this organization.",
      status: 403,
    });
  });

  it("preserves a bounded Retry-After delay for rate-limited guidance", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "rate_limited",
          detail: "Too many requests.",
          status: 429,
          title: "Rate limited",
        }),
        {
          headers: {
            "content-type": "application/problem+json",
            "retry-after": "17",
          },
          status: 429,
        },
      ),
    );

    await expect(listOrganizations()).rejects.toMatchObject({
      code: "rate_limited",
      message: "Too many requests. Retry after 17 seconds.",
      retryAfterSeconds: 17,
      status: 429,
    });
  });

  it("fails closed when the Auth session is absent", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(listOrganizations()).rejects.toMatchObject({
      code: "unauthenticated",
      status: 401,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
