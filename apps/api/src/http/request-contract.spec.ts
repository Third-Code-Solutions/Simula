import type { Request } from "express";

import {
  canonicalRequestSha256,
  expectedVersion,
  idempotencyKey,
  resourceId,
} from "./request-contract";

function requestWith(rawHeaders: string[]): Request {
  return { rawHeaders } as Request;
}

describe("request contract helpers", () => {
  it("byte-matches the FastAPI canonical request checksum", () => {
    expect(
      canonicalRequestSha256({
        category: "campaign_message",
        language: "en",
        market: "philippines",
        name: "Campaign",
        objective: "Reach café buyers",
      }),
    ).toBe("a525bc0fd890eb2dc1df30f44953ed10bb311f0561e113bf539f8a7a524ea178");
  });

  it("accepts exactly one printable idempotency key", () => {
    expect(
      idempotencyKey(requestWith(["Idempotency-Key", "request-identity-0001"])),
    ).toBe("request-identity-0001");
    expect(() =>
      idempotencyKey(
        requestWith([
          "Idempotency-Key",
          "request-identity-0001",
          "idempotency-key",
          "request-identity-0002",
        ]),
      ),
    ).toThrow(
      expect.objectContaining({
        status: 422,
        code: "validation_error",
      }),
    );
  });

  it("requires a single quoted positive If-Match version", () => {
    expect(expectedVersion(requestWith(["If-Match", '"12"']))).toBe(12);
    expect(() => expectedVersion(requestWith(["If-Match", "12"]))).toThrow(
      expect.objectContaining({
        status: 422,
        code: "validation_error",
      }),
    );
  });

  it("normalizes canonical UUID resource identifiers", () => {
    expect(
      resourceId("018F274B-3C77-7B22-B749-C9274230EF9A", "project_id"),
    ).toBe("018f274b-3c77-7b22-b749-c9274230ef9a");
  });
});
