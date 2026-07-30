import {
  InvalidSimulationJobError,
  simulationJobId,
  validateSimulationJob,
} from "./simulation-job";

const RUN_ID = "018f274b-3c77-7b22-b749-c9274230ef9a";

describe("simulation job contract", () => {
  it("accepts and freezes the exact v2 identifier-only payload", async () => {
    const result = await validateSimulationJob({
      schema_version: 2,
      run_id: RUN_ID,
      dispatch_generation: 1,
    });

    expect(result).toEqual({
      schema_version: 2,
      run_id: RUN_ID,
      dispatch_generation: 1,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(simulationJobId(result)).toBe(`run-${RUN_ID}-generation-1`);
  });

  it.each([
    null,
    [],
    { schema_version: 1, run_id: RUN_ID, dispatch_generation: 1 },
    {
      schema_version: 2,
      run_id: RUN_ID,
      dispatch_generation: 1,
      stimulus: "must never enter Redis",
    },
    { schema_version: 2, run_id: "not-a-uuid", dispatch_generation: 1 },
    { schema_version: 2, run_id: RUN_ID, dispatch_generation: 0 },
    { schema_version: 2, run_id: RUN_ID, dispatch_generation: 4 },
  ])("rejects invalid or expanded payload %#", async (payload) => {
    await expect(validateSimulationJob(payload)).rejects.toBeInstanceOf(
      InvalidSimulationJobError,
    );
  });
});
