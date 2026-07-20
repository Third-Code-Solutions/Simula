import { describe, expect, it } from "vitest";

import { safeNextPath } from "./safe-next-path";

describe("safeNextPath", () => {
  it.each([
    undefined,
    "",
    "https://evil.example/steal",
    "//evil.example/steal",
    "/\\evil.example/steal",
    "/%5cevil.example/steal",
    "/%2fevil.example/steal",
    "/organizations\u0000/steal",
    "/not-a-protected-route",
  ])("rejects an unsafe post-auth destination: %s", (value) => {
    expect(safeNextPath(value)).toBe("/organizations");
  });

  it.each([
    "/organizations",
    "/organizations/00000000-0000-4000-8000-000000000001/projects",
    "/projects/00000000-0000-4000-8000-000000000001",
    "/runs/00000000-0000-4000-8000-000000000001",
  ])("accepts an allowlisted protected destination: %s", (value) => {
    expect(safeNextPath(value)).toBe(value);
  });
});
