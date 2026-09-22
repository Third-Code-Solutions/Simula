import { describe, expect, it } from "vitest";
import { isCancelledRequest } from "./view-request";

describe("isCancelledRequest", () => {
  it("recognizes the request_cancelled problem code", () => {
    expect(isCancelledRequest({ code: "request_cancelled" })).toBe(true);
  });

  it("recognizes a fetch abort", () => {
    expect(isCancelledRequest(new DOMException("aborted", "AbortError"))).toBe(
      true,
    );
    expect(isCancelledRequest({ name: "AbortError" })).toBe(true);
  });

  it("does not treat real failures as cancellations", () => {
    expect(isCancelledRequest({ code: "request_timeout" })).toBe(false);
    expect(isCancelledRequest(new Error("Source admission unavailable"))).toBe(
      false,
    );
    expect(isCancelledRequest({ code: "forbidden" })).toBe(false);
    expect(isCancelledRequest(undefined)).toBe(false);
    expect(isCancelledRequest(null)).toBe(false);
    expect(isCancelledRequest("request_cancelled")).toBe(false);
  });

  it("does not depend on the API module's error class identity", () => {
    // A structurally equivalent cancellation must be recognized even though it
    // was never constructed by the API module.
    const foreign = Object.assign(new Error("cancelled elsewhere"), {
      code: "request_cancelled",
    });
    expect(isCancelledRequest(foreign)).toBe(true);
  });
});
