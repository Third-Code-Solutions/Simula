import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { ProjectPatchDto } from "../projects/project.dto";
import { StimulusCreateDto, StimulusVersionAppendDto } from "./stimulus.dto";

describe("command DTO contracts", () => {
  it("rejects stimulus content beyond the UTF-8 byte budget", async () => {
    const dto = plainToInstance(StimulusCreateDto, {
      name: "Four-byte content",
      content: "😀".repeat(4_500),
    });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: "content",
          constraints: expect.objectContaining({
            maxUtf8Bytes: expect.any(String),
          }),
        }),
      ]),
    );
  });

  it("accepts content within both character and byte budgets", async () => {
    const dto = plainToInstance(StimulusVersionAppendDto, {
      content: "é".repeat(5_000),
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it("does not treat explicit null project fields as omitted", async () => {
    const dto = plainToInstance(ProjectPatchDto, { name: null });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: "name" })]),
    );
  });
});
