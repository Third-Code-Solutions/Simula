import { HealthService } from "./health.service";
import type { SimulationQueuePort } from "../queue/simulation-queue.port";

function queueWithReadiness(isReady: boolean): SimulationQueuePort {
  return {
    isReady: jest.fn().mockResolvedValue(isReady),
    publish: jest.fn(),
    provesPublished: jest.fn(),
    removeForRuns: jest.fn(),
  };
}

describe("HealthService", () => {
  it("keeps liveness dependency-free", () => {
    expect(new HealthService(queueWithReadiness(false)).liveness()).toEqual({
      status: "alive",
    });
  });

  it.each([
    [true, "ready"],
    [false, "not_ready"],
  ] as const)("maps queue readiness %s to %s", async (queueReady, status) => {
    await expect(
      new HealthService(queueWithReadiness(queueReady)).readiness(),
    ).resolves.toEqual({ status });
  });

  it("requires the enabled domain store as well as the queue", async () => {
    const domain = {
      isReady: jest.fn().mockResolvedValue(false),
    };
    await expect(
      new HealthService(queueWithReadiness(true), domain).readiness(),
    ).resolves.toEqual({ status: "not_ready" });
  });
});
