import { describe, expect, it } from "vitest";

import { isRunRouteId } from "./run-route";

describe("isRunRouteId", () => {
  it.each([
    "00000000-0000-4000-8000-000000000001",
    "018e60d5-71b1-7cc2-8ef2-a1b2c3d4e5f6",
  ])("accepts a canonical UUID run route id: %s", (value) => {
    expect(isRunRouteId(value)).toBe(true);
  });

  it.each([
    "not-a-run-id",
    "00000000-0000-6000-8000-000000000001",
    "00000000-0000-4000-7000-000000000001",
    "00000000-0000-4000-8000-000000000001/anything",
  ])("rejects malformed or non-canonical ids: %s", (value) => {
    expect(isRunRouteId(value)).toBe(false);
  });
});
