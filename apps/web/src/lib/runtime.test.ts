import { afterEach, describe, expect, it } from "vitest";

import { resultExperienceEnabled } from "./runtime";

const initialValue = process.env.SIMULA_RESULT_EXPERIENCE_ENABLED;

afterEach(() => {
  if (initialValue === undefined) {
    delete process.env.SIMULA_RESULT_EXPERIENCE_ENABLED;
  } else {
    process.env.SIMULA_RESULT_EXPERIENCE_ENABLED = initialValue;
  }
});

describe("resultExperienceEnabled", () => {
  it("defaults on and allows the server to hide the result experience", () => {
    delete process.env.SIMULA_RESULT_EXPERIENCE_ENABLED;
    expect(resultExperienceEnabled()).toBe(true);

    process.env.SIMULA_RESULT_EXPERIENCE_ENABLED = "false";
    expect(resultExperienceEnabled()).toBe(false);
  });
});
