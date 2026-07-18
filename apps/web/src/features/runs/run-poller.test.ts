import { describe, expect, it, vi } from "vitest";

import { ApiProblem } from "@/lib/api";

import { type PollerClock, RunPollerRegistry } from "./run-poller";

const RUN_ID = "00000000-0000-4000-8000-000000000001";

function runFixture(state: "queued" | "succeeded" = "queued") {
  return {
    id: RUN_ID,
    organization_id: "00000000-0000-4000-8000-000000000002",
    project_id: "00000000-0000-4000-8000-000000000003",
    stimulus_version_id: "00000000-0000-4000-8000-000000000004",
    audience_version_id: "00000000-0000-4000-8000-000000000005",
    state,
    schema_version: 1 as const,
    dispatch_generation: 1,
    job_id: `run:${RUN_ID}:dispatch:1`,
    version: 1,
    created_at: "2026-07-18T00:00:00Z",
    failure: null,
  };
}

function clockFixture(): {
  clock: PollerClock;
  delays: number[];
  pendingTimers: () => number;
  runNextTimer: () => void;
} {
  const delays: number[] = [];
  let nextHandle = 1;
  const timers = new Map<number, () => void>();
  return {
    clock: {
      clearTimeout: vi.fn((handle) => {
        timers.delete(handle as unknown as number);
      }),
      now: () => 0,
      random: () => 0.5,
      setTimeout: (callback, delay) => {
        delays.push(delay);
        const handle = nextHandle;
        nextHandle += 1;
        timers.set(handle, callback);
        return handle as unknown as ReturnType<typeof setTimeout>;
      },
    },
    delays,
    pendingTimers: () => timers.size,
    runNextTimer: () => {
      const next = timers.entries().next().value as
        [number, () => void] | undefined;
      if (!next) {
        throw new Error("Expected a pending timer.");
      }
      timers.delete(next[0]);
      next[1]();
    },
  };
}

describe("RunPollerRegistry", () => {
  it("never overlaps a manual refresh with an in-flight request", async () => {
    let resolveRun:
      ((value: ReturnType<typeof runFixture>) => void) | undefined;
    const fetchRun = vi.fn(
      () =>
        new Promise<ReturnType<typeof runFixture>>((resolve) => {
          resolveRun = resolve;
        }),
    );
    const { clock } = clockFixture();
    const subscription = new RunPollerRegistry(fetchRun, clock).subscribe(
      RUN_ID,
      vi.fn(),
    );

    subscription.refresh();
    expect(fetchRun).toHaveBeenCalledTimes(1);
    resolveRun?.(runFixture());
    await Promise.resolve();
  });

  it("shares one poll and starts with the exact bounded backoff", async () => {
    const fetchRun = vi.fn().mockResolvedValue(runFixture());
    const { clock, delays } = clockFixture();
    const registry = new RunPollerRegistry(fetchRun, clock);
    const first = registry.subscribe(RUN_ID, vi.fn());
    const second = registry.subscribe(RUN_ID, vi.fn());

    await Promise.resolve();
    await Promise.resolve();

    expect(fetchRun).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([1_000]);
    first.unsubscribe();
    second.unsubscribe();
  });

  it("stops immediately for a terminal state", async () => {
    const fetchRun = vi.fn().mockResolvedValue(runFixture("succeeded"));
    const { clock, delays } = clockFixture();
    const snapshots: object[] = [];
    new RunPollerRegistry(fetchRun, clock).subscribe(RUN_ID, (snapshot) =>
      snapshots.push(snapshot),
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(delays).toEqual([]);
    expect(snapshots.at(-1)).toMatchObject({
      isStopped: true,
      stopReason: "terminal",
    });
  });

  it("polls queued work once more, then stops on the terminal state", async () => {
    const fetchRun = vi
      .fn()
      .mockResolvedValueOnce(runFixture())
      .mockResolvedValueOnce(runFixture("succeeded"));
    const { clock, pendingTimers, runNextTimer } = clockFixture();
    const snapshots: object[] = [];
    const telemetry = vi.fn();
    new RunPollerRegistry(fetchRun, clock, telemetry).subscribe(
      RUN_ID,
      (snapshot) => snapshots.push(snapshot),
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(fetchRun).toHaveBeenCalledTimes(1);
    expect(pendingTimers()).toBe(1);

    runNextTimer();
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchRun).toHaveBeenCalledTimes(2);
    expect(pendingTimers()).toBe(0);
    expect(snapshots.at(-1)).toMatchObject({
      isStopped: true,
      run: { state: "succeeded" },
      stopReason: "terminal",
    });
    expect(telemetry).toHaveBeenCalledWith({
      name: "run_poll_stopped",
      pollCount: 2,
      reason: "terminal",
    });
  });

  it("stops instead of retrying after authorization failure", async () => {
    const fetchRun = vi
      .fn()
      .mockRejectedValue(
        new ApiProblem(401, "unauthenticated", "Sign in again."),
      );
    const { clock, delays } = clockFixture();
    const snapshots: object[] = [];
    new RunPollerRegistry(fetchRun, clock).subscribe(RUN_ID, (snapshot) =>
      snapshots.push(snapshot),
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(delays).toEqual([]);
    expect(snapshots.at(-1)).toMatchObject({
      isStopped: true,
      stopReason: "authorization",
    });
  });
});
