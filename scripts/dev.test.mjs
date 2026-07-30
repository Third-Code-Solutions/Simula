import assert from "node:assert/strict";
import test from "node:test";

import {
  assertRequiredWebEnvironment,
  resolveWebDevEnvironment,
} from "./dev.mjs";

test("loads only safe web values with local and process overrides", () => {
  const environment = resolveWebDevEnvironment(
    [
      [
        "NEXT_PUBLIC_SIMULA_API_URL=http://127.0.0.1:8000",
        "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=base-public-key",
        "SIMULA_ENVIRONMENT=local",
        "SIMULA_DATABASE_URL=postgresql://must-not-load",
      ].join("\n"),
      [
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=local-public-key",
        "SIMULA_RELEASE_SHA=dev-release",
      ].join("\n"),
    ],
    { NEXT_PUBLIC_SIMULA_API_URL: "http://localhost:8000" },
  );

  assert.equal(environment.NEXT_PUBLIC_SIMULA_API_URL, "http://localhost:8000");
  assert.equal(environment.NEXT_PUBLIC_SUPABASE_URL, "http://127.0.0.1:54321");
  assert.equal(
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    "local-public-key",
  );
  assert.equal(environment.SIMULA_RELEASE_SHA, "dev-release");
  assert.equal(environment.SIMULA_DATABASE_URL, undefined);
  assert.doesNotThrow(() => assertRequiredWebEnvironment(environment));
});

test("rejects startup when required public Supabase values are absent", () => {
  assert.throws(
    () => assertRequiredWebEnvironment({}),
    /NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
  );
});

test("rejects hosted Supabase URL for local web development", () => {
  assert.throws(
    () =>
      assertRequiredWebEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "https://ywiwmczccktwzqyhzhiz.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-public-key",
        SIMULA_ENVIRONMENT: "local",
      }),
    /Local web development requires NEXT_PUBLIC_SUPABASE_URL to target local Supabase/,
  );
});
