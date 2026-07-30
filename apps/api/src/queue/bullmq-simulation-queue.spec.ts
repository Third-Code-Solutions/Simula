import type { Queue } from "bullmq";

import { SIMULATION_JOB_NAME, SIMULATION_JOB_OPTIONS } from "./queue.constants";
import { BullMqSimulationQueue } from "./bullmq-simulation-queue";
import type { SimulationJobData } from "./simulation-job";

const RUN_ID = "018f274b-3c77-7b22-b749-c9274230ef9a";

describe("BullMqSimulationQueue", () => {
  it("publishes the exact bound job with database-owned retry semantics", async () => {
    const jobId = `run-${RUN_ID}-generation-2`;
    const add = jest.fn().mockResolvedValue({ id: jobId });
    const queue = {
      add,
    } as unknown as Queue<SimulationJobData, void, typeof SIMULATION_JOB_NAME>;
    const publisher = new BullMqSimulationQueue(queue);

    await expect(
      publisher.publish({
        schema_version: 2,
        run_id: RUN_ID,
        dispatch_generation: 2,
      }),
    ).resolves.toEqual({ job_id: jobId });
    expect(add).toHaveBeenCalledWith(
      SIMULATION_JOB_NAME,
      {
        schema_version: 2,
        run_id: RUN_ID,
        dispatch_generation: 2,
      },
      {
        ...SIMULATION_JOB_OPTIONS,
        jobId,
      },
    );
  });

  it("reports ready only after BullMQ finishes connecting", async () => {
    const queue = {
      waitUntilReady: jest.fn().mockResolvedValue(undefined),
    } as unknown as Queue<SimulationJobData, void, typeof SIMULATION_JOB_NAME>;

    await expect(new BullMqSimulationQueue(queue).isReady()).resolves.toBe(
      true,
    );
  });

  it("fails readiness closed without exposing a Redis error", async () => {
    const queue = {
      waitUntilReady: jest
        .fn()
        .mockRejectedValue(new Error("redis://user:secret@internal")),
    } as unknown as Queue<SimulationJobData, void, typeof SIMULATION_JOB_NAME>;

    await expect(new BullMqSimulationQueue(queue).isReady()).resolves.toBe(
      false,
    );
  });

  it("reports a bounded Redis memory percentage for durable run control", async () => {
    const queue = {
      client: Promise.resolve({
        info: jest
          .fn()
          .mockResolvedValue("used_memory:250\r\nmaxmemory:1000\r\n"),
      }),
    } as unknown as Queue<SimulationJobData, void, typeof SIMULATION_JOB_NAME>;

    await expect(
      new BullMqSimulationQueue(queue).memoryPercent(),
    ).resolves.toBe(25);
  });

  it("treats unlimited Redis memory as zero percent and malformed data as fatal", async () => {
    const unlimited = {
      client: Promise.resolve({
        info: jest.fn().mockResolvedValue("used_memory:250\r\nmaxmemory:0\r\n"),
      }),
    } as unknown as Queue<SimulationJobData, void, typeof SIMULATION_JOB_NAME>;
    const malformed = {
      client: Promise.resolve({
        info: jest.fn().mockResolvedValue("used_memory:not-a-number\r\n"),
      }),
    } as unknown as Queue<SimulationJobData, void, typeof SIMULATION_JOB_NAME>;

    await expect(
      new BullMqSimulationQueue(unlimited).memoryPercent(),
    ).resolves.toBe(0);
    await expect(
      new BullMqSimulationQueue(malformed).memoryPercent(),
    ).rejects.toThrow("invalid memory snapshot");
  });

  it("reports exact ready depth, oldest age, and Redis memory pressure", async () => {
    const now = Date.now();
    const queue = {
      client: Promise.resolve({
        info: jest
          .fn()
          .mockResolvedValue("used_memory:250\r\nmaxmemory:1000\r\n"),
      }),
      getJobCounts: jest.fn().mockResolvedValue({
        delayed: 2,
        prioritized: 3,
        wait: 4,
      }),
      getJobs: jest
        .fn()
        .mockResolvedValue([
          { timestamp: now - 2_000 },
          { timestamp: now - 61_000 },
        ]),
    } as unknown as Queue<SimulationJobData, void, typeof SIMULATION_JOB_NAME>;

    await expect(
      new BullMqSimulationQueue(queue).snapshot(),
    ).resolves.toMatchObject({
      depth: 9,
      memoryPercent: 25,
      oldestReadyAgeSeconds: expect.any(Number),
    });
    const snapshot = await new BullMqSimulationQueue(queue).snapshot();
    expect(snapshot.oldestReadyAgeSeconds).toBeGreaterThanOrEqual(61);
    expect(queue.getJobs).toHaveBeenCalledWith(
      ["wait", "prioritized", "delayed"],
      0,
      99,
      false,
    );
  });

  it("fails pressure snapshots closed on malformed counts or timestamps", async () => {
    const malformedCount = {
      getJobCounts: jest.fn().mockResolvedValue({
        delayed: 0,
        prioritized: 0,
        wait: -1,
      }),
    } as unknown as Queue<SimulationJobData, void, typeof SIMULATION_JOB_NAME>;
    const malformedTimestamp = {
      getJobCounts: jest.fn().mockResolvedValue({
        delayed: 0,
        prioritized: 0,
        wait: 1,
      }),
      getJobs: jest.fn().mockResolvedValue([{ timestamp: Number.NaN }]),
    } as unknown as Queue<SimulationJobData, void, typeof SIMULATION_JOB_NAME>;

    await expect(
      new BullMqSimulationQueue(malformedCount).snapshot(),
    ).rejects.toThrow("invalid queue count");
    await expect(
      new BullMqSimulationQueue(malformedTimestamp).snapshot(),
    ).rejects.toThrow("invalid job timestamp");
  });

  it("proves only an exact retained BullMQ job binding", async () => {
    const payload = {
      schema_version: 2 as const,
      run_id: RUN_ID,
      dispatch_generation: 2,
    };
    const jobId = `run-${RUN_ID}-generation-2`;
    const queue = {
      getJob: jest.fn().mockResolvedValue({
        id: jobId,
        name: SIMULATION_JOB_NAME,
        data: payload,
        opts: { attempts: SIMULATION_JOB_OPTIONS.attempts },
      }),
    } as unknown as Queue<SimulationJobData, void, typeof SIMULATION_JOB_NAME>;

    await expect(
      new BullMqSimulationQueue(queue).provesPublished(payload),
    ).resolves.toBe(true);
  });

  it.each([
    null,
    {
      id: `run-${RUN_ID}-generation-2`,
      name: "wrong-job",
      data: {
        schema_version: 2,
        run_id: RUN_ID,
        dispatch_generation: 2,
      },
      opts: { attempts: 1 },
    },
    {
      id: `run-${RUN_ID}-generation-2`,
      name: SIMULATION_JOB_NAME,
      data: {
        schema_version: 2,
        run_id: RUN_ID,
        dispatch_generation: 3,
      },
      opts: { attempts: 1 },
    },
    {
      id: `run-${RUN_ID}-generation-2`,
      name: SIMULATION_JOB_NAME,
      data: {
        schema_version: 2,
        run_id: RUN_ID,
        dispatch_generation: 2,
      },
      opts: { attempts: 2 },
    },
  ])("rejects absent or drifted queue proof %#", async (job) => {
    const queue = {
      getJob: jest.fn().mockResolvedValue(job),
    } as unknown as Queue<SimulationJobData, void, typeof SIMULATION_JOB_NAME>;

    await expect(
      new BullMqSimulationQueue(queue).provesPublished({
        schema_version: 2,
        run_id: RUN_ID,
        dispatch_generation: 2,
      }),
    ).resolves.toBe(false);
  });

  it("removes and verifies every retained generation for deleted runs", async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const getJob = jest
      .fn()
      .mockResolvedValueOnce({ remove })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const queue = {
      getJob,
    } as unknown as Queue<SimulationJobData, void, typeof SIMULATION_JOB_NAME>;

    await expect(
      new BullMqSimulationQueue(queue).removeForRuns([RUN_ID]),
    ).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(getJob).toHaveBeenCalledTimes(6);
    expect(getJob).toHaveBeenNthCalledWith(1, `run-${RUN_ID}-generation-1`);
    expect(getJob).toHaveBeenNthCalledWith(6, `run-${RUN_ID}-generation-3`);
  });

  it("rejects invalid deletion manifests before queue access", async () => {
    const queue = {
      getJob: jest.fn(),
    } as unknown as Queue<SimulationJobData, void, typeof SIMULATION_JOB_NAME>;

    await expect(
      new BullMqSimulationQueue(queue).removeForRuns(["not-a-run"]),
    ).rejects.toThrow("invalid run identities");
    expect(queue.getJob).not.toHaveBeenCalled();
  });
});
