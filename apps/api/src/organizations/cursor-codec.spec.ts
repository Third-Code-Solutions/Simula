import { REQUIRED_DATABASE_MIGRATION_HEAD } from "../config/production-admission";
import { CursorCodec } from "./cursor-codec";

const RUNTIME = Object.freeze({
  enabled: true as const,
  environment: "test" as const,
  releaseSha: "a".repeat(40),
  migrationHead: REQUIRED_DATABASE_MIGRATION_HEAD,
  databaseUrl: "postgresql://simula_api:password@127.0.0.1:54322/postgres",
  databaseCaPem: null,
  supabaseIssuer: "http://127.0.0.1:54321/auth/v1",
  supabaseJwksUrl: "http://127.0.0.1:54321/auth/v1/.well-known/jwks.json",
  supabasePublishableKey: "sb_publishable_test",
  cursorSecret: "0123456789abcdef0123456789abcdef",
  redisConnection: {
    db: 14,
    enableOfflineQueue: false as const,
    host: "127.0.0.1",
    maxRetriesPerRequest: 1 as const,
    port: 6379,
  },
  rateLimitKeyPrefix: "simula:test:cursor",
  behavioralEngineUrl: "http://127.0.0.1:8010",
  behavioralEngineToken: "t".repeat(32),
});
const SCOPE = "organizations:018f274b-3c77-7b22-b749-c9274230ef9a";
const POSITION = Object.freeze({
  createdAt: "2026-07-29T06:00:00.123456Z",
  resourceId: "018f274b-3c77-7b22-b749-c9274230ef9b",
});
const PYTHON_CURSOR =
  "eyJjcmVhdGVkX2F0IjoiMjAyNi0wNy0yOVQwNjowMDowMC4xMjM0NTZaIiwiaWQiOiIwMThmMjc0Yi0zYzc3LTdiMjItYjc0OS1jOTI3NDIzMGVmOWIiLCJzY29wZSI6Im9yZ2FuaXphdGlvbnM6MDE4ZjI3NGItM2M3Ny03YjIyLWI3NDktYzkyNzQyMzBlZjlhIiwidiI6MX0.aj_C7UJhct2vQeuA1beK6L-p6oKwxWTy8ai8uWPpSn4";

describe("CursorCodec", () => {
  it("byte-matches and decodes the existing FastAPI cursor contract", () => {
    const codec = new CursorCodec(RUNTIME);
    expect(codec.encode(SCOPE, POSITION)).toBe(PYTHON_CURSOR);
    expect(codec.decode(PYTHON_CURSOR, SCOPE)).toEqual(POSITION);
  });

  it.each([`${PYTHON_CURSOR}x`, PYTHON_CURSOR.replace("ey", "e!"), ""])(
    "rejects a tampered cursor %#",
    (cursor) => {
      expect(() => new CursorCodec(RUNTIME).decode(cursor, SCOPE)).toThrow(
        expect.objectContaining({ code: "validation_error" }),
      );
    },
  );

  it("rejects cross-scope replay", () => {
    expect(() =>
      new CursorCodec(RUNTIME).decode(
        PYTHON_CURSOR,
        "organizations:018f274b-3c77-7b22-b749-c9274230ef9c",
      ),
    ).toThrow(expect.objectContaining({ code: "validation_error" }));
  });
});
