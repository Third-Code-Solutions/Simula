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
  };
}

function clockFixture(): { clock: PollerClock; delays: number[] } {
  const delays: number[] = [];
  return {
    clock: {
      clearTimeout: vi.fn(),
      now: () => 0,
      random: () => 0.5,
      setTimeout: (_callback, delay) => {
        delays.push(delay);
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
    },
    delays,
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
