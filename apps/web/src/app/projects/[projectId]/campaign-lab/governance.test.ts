import { describe, expect, it } from "vitest";

import { complianceReviewInput } from "./governance";

describe("Campaign Lab governance commands", () => {
  it("queues automated compliance without a caller-asserted reviewer", () => {
    expect(complianceReviewInput({ use_case: "aggregate research" })).toEqual({
      payload: { use_case: "aggregate research" },
    });
  });
});
