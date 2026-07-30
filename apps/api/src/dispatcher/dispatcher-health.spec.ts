import {
  DispatcherHealthServer,
  DispatcherHealthState,
} from "./dispatcher-health";

describe("DispatcherHealthState", () => {
  it("is live but not ready until dependencies and the loop are admitted", () => {
    const health = new DispatcherHealthState(5_000);

    expect(health.snapshot(1_000)).toEqual({ live: true, ready: false });

    health.markReady(1_000);

    expect(health.snapshot(5_999)).toEqual({ live: true, ready: true });
    expect(health.snapshot(6_001)).toEqual({ live: true, ready: false });
  });

  it("refreshes readiness after each successful pass and fails closed on stop", () => {
    const health = new DispatcherHealthState(5_000);
    health.markReady(1_000);
    health.markPassSucceeded(5_000);

    expect(health.snapshot(9_999)).toEqual({ live: true, ready: true });

    health.markStopping();

    expect(health.snapshot(5_001)).toEqual({ live: false, ready: false });
  });

  it("rejects an unsafe readiness staleness window", () => {
    expect(() => new DispatcherHealthState(999)).toThrow("at least one second");
  });

  it("serves separate liveness and fail-closed readiness endpoints", async () => {
    const health = new DispatcherHealthState();
    const server = new DispatcherHealthServer(health);
    const port = await server.listen(0);

    try {
      await expect(
        fetch(`http://127.0.0.1:${port}/health/live`).then(async (response) => [
          response.status,
          await response.json(),
        ]),
      ).resolves.toEqual([200, { status: "live" }]);
      await expect(
        fetch(`http://127.0.0.1:${port}/health/ready`).then(
          async (response) => [response.status, await response.json()],
        ),
      ).resolves.toEqual([503, { status: "not_ready" }]);

      health.markReady();

      await expect(
        fetch(`http://127.0.0.1:${port}/health/ready`).then(
          async (response) => [response.status, await response.json()],
        ),
      ).resolves.toEqual([200, { status: "ready" }]);
    } finally {
      health.markStopping();
      await server.close();
    }
  });
});
