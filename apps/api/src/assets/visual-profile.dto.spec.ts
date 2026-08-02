import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { VisualProfileCreateDto } from "./visual-profile.dto";

describe("VisualProfileCreateDto", () => {
  it("admits only the exact technical-image methodology command", async () => {
    const admitted = plainToInstance(VisualProfileCreateDto, {
      methodology_version: "technical_image_signals_v1",
    });

    await expect(
      validate(admitted, { forbidUnknownValues: true }),
    ).resolves.toHaveLength(0);
  });

  it.each([
    {},
    { methodology_version: "unversioned" },
    { methodology_version: null },
  ])("rejects an absent or unadmitted methodology %#", async (command) => {
    const rejected = plainToInstance(VisualProfileCreateDto, command);

    await expect(
      validate(rejected, { forbidUnknownValues: true }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: "methodology_version" }),
      ]),
    );
  });
});
