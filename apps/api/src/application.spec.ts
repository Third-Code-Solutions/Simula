import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { createApplication } from "./application";

describe("NestJS control-plane foundation", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApplication({});
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("serves dependency-free liveness with correlation", async () => {
    const response = await request(app.getHttpServer())
      .get("/health/live")
      .expect(200);

    expect(response.body).toEqual({ status: "alive" });
    expect(response.headers["x-correlation-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(response.headers.traceparent).toMatch(
      /^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/,
    );
  });

  it("accepts only canonical UUIDv4/v7 correlation identities", async () => {
    const valid = "018f274b-3c77-7b22-b749-c9274230ef9a";
    const accepted = await request(app.getHttpServer())
      .get("/health/live")
      .set("x-correlation-id", valid.toUpperCase())
      .expect(200);
    const rejected = await request(app.getHttpServer())
      .get("/health/live")
      .set("x-correlation-id", "00000000-0000-0000-0000-000000000000")
      .expect(200);

    expect(accepted.headers["x-correlation-id"]).toBe(valid);
    expect(rejected.headers["x-correlation-id"]).not.toBe(
      "00000000-0000-0000-0000-000000000000",
    );
  });

  it("continues a valid trace ID with a fresh service span", async () => {
    const incoming = "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01";
    const response = await request(app.getHttpServer())
      .get("/health/live")
      .set("traceparent", incoming)
      .expect(200);

    expect(response.headers.traceparent).toMatch(
      /^00-0123456789abcdef0123456789abcdef-[0-9a-f]{16}-01$/,
    );
    expect(response.headers.traceparent).not.toBe(incoming);
  });

  it("allows only configured browser origins without credentials", async () => {
    const allowed = await request(app.getHttpServer())
      .options("/api/v2/organizations")
      .set("Origin", "http://127.0.0.1:3000")
      .set("Access-Control-Request-Method", "GET")
      .expect(204);
    const denied = await request(app.getHttpServer())
      .get("/health/live")
      .set("Origin", "https://attacker.invalid")
      .expect(200);

    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "http://127.0.0.1:3000",
    );
    expect(allowed.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(allowed.headers["access-control-expose-headers"]).toContain(
      "Content-Disposition",
    );
    expect(allowed.headers["access-control-expose-headers"]).toContain(
      "Content-Security-Policy",
    );
    expect(allowed.headers["access-control-expose-headers"]).toContain(
      "X-Content-Type-Options",
    );
    expect(allowed.headers.vary).toContain("Origin");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rejects non-JSON command media before authentication", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v2/auth-events")
      .type("text")
      .send("not-json")
      .expect(415);

    expect(response.body).toMatchObject({
      code: "unsupported_media_type",
      status: 415,
      correlation_id: expect.any(String),
    });
  });

  it("accepts only the bounded stimulus-asset binary media surface", async () => {
    const assetId = "018f274b-3c77-7b22-b749-c9274230ef9a";
    const accepted = await request(app.getHttpServer())
      .put(`/api/v2/stimulus-assets/${assetId}/content`)
      .set("Content-Type", "image/png")
      .send(Buffer.from("fixture"))
      .expect(401);
    const rejected = await request(app.getHttpServer())
      .put(`/api/v2/stimulus-assets/${assetId}/content`)
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("fixture"))
      .expect(415);
    const parameterized = await request(app.getHttpServer())
      .put(`/api/v2/stimulus-assets/${assetId}/content`)
      .set("Content-Type", "image/png; charset=binary")
      .send(Buffer.from("fixture"))
      .expect(415);

    expect(accepted.body).toMatchObject({ code: "unauthenticated" });
    expect(rejected.body).toMatchObject({ code: "unsupported_media_type" });
    expect(parameterized.body).toMatchObject({
      code: "unsupported_media_type",
    });
  });

  it("enforces the 16 MiB asset-body envelope before authentication", async () => {
    const response = await request(app.getHttpServer())
      .put(
        "/api/v2/stimulus-assets/018f274b-3c77-7b22-b749-c9274230ef9a/content",
      )
      .set("Content-Type", "image/png")
      .send(Buffer.alloc(16_777_217, 1))
      .expect(413);

    expect(response.body).toMatchObject({
      code: "request_too_large",
      status: 413,
    });
  });

  it("returns a safe validation problem for malformed JSON", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v2/auth-events")
      .set("Content-Type", "application/json")
      .send('{"kind":')
      .expect(422);

    expect(response.body).toMatchObject({
      code: "validation_error",
      status: 422,
      correlation_id: expect.any(String),
    });
  });

  it("enforces the 64 KiB command-body envelope before authentication", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v2/auth-events")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ kind: "sign_in", padding: "x".repeat(66_000) }))
      .expect(413);

    expect(response.body).toMatchObject({
      code: "request_too_large",
      status: 413,
      correlation_id: expect.any(String),
    });
  });

  it("fails readiness closed when BullMQ is unconfigured", async () => {
    const response = await request(app.getHttpServer())
      .get("/health/ready")
      .expect(503);

    expect(response.body).toEqual({ status: "not_ready" });
    expect(JSON.stringify(response.body)).not.toMatch(/redis|secret|url/i);
  });

  it("exposes v2 migration routes but denies missing authentication safely", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v2/me")
      .expect(401);

    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(response.body).toMatchObject({
      type: "https://simula.invalid/problems/unauthenticated",
      title: "Authentication required",
      status: 401,
      code: "unauthenticated",
      instance: "/api/v2/me",
      correlation_id: expect.any(String),
    });
  });

  it("fails the disabled migration surface closed without runtime disclosure", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v2/organizations")
      .set("Authorization", "Bearer header.payload.signature")
      .expect(503);

    expect(response.body).toMatchObject({
      code: "dependency_unavailable",
      status: 503,
      instance: "/api/v2/organizations",
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /postgres|redis|supabase|secret|url/i,
    );
  });
});
