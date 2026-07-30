import { type ClassConstructor, plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { StimulusAssetDeleteDto } from "./assets/stimulus-asset.dto";
import { SimulationRunCancelDto } from "./runs/run.dto";

const STRICT_VALIDATION = {
  forbidNonWhitelisted: true,
  forbidUnknownValues: true,
  whitelist: true,
};

const EMPTY_COMMANDS: Array<[string, ClassConstructor<object>]> = [
  ["stimulus asset deletion", StimulusAssetDeleteDto],
  ["simulation run cancellation", SimulationRunCancelDto],
];

describe.each(EMPTY_COMMANDS)("%s empty command", (_name, CommandDto) => {
  it("accepts the documented empty object", async () => {
    const command = plainToInstance(CommandDto, {});

    await expect(validate(command, STRICT_VALIDATION)).resolves.toHaveLength(0);
  });

  it("rejects supplied fields", async () => {
    const command = plainToInstance(CommandDto, { unexpected: true });

    await expect(validate(command, STRICT_VALIDATION)).resolves.toEqual([
      expect.objectContaining({
        constraints: {
          whitelistValidation: "property unexpected should not exist",
        },
        property: "unexpected",
      }),
    ]);
  });
});
