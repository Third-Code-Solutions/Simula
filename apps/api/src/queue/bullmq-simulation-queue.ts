import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Job, Queue } from "bullmq";

import {
  SIMULATION_JOB_NAME,
  SIMULATION_JOB_OPTIONS,
  SIMULATION_QUEUE_NAME,
} from "./queue.constants";
import {
  simulationJobId,
  validateSimulationJob,
  type SimulationJobData,
} from "./simulation-job";
import type {
  PublishedSimulationJob,
  SimulationQueuePort,
} from "./simulation-queue.port";

const READY_TIMEOUT_MS = 2_000;
const READY_JOB_TYPES = ["wait", "prioritized", "delayed"] as const;
const RUN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface BullMqQueueSnapshot {
  readonly depth: number;
  readonly memoryPercent: number;
  readonly oldestReadyAgeSeconds: number;
}

function exactQueueCount(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error("BullMQ returned an invalid queue count.");
  }
  return value as number;
}

function redisMemoryPercent(info: string): number {
  const values = new Map(
    info
      .split(/\r?\n/)
      .map((line) => line.split(":", 2))
      .filter((parts): parts is [string, string] => parts.length === 2),
  );
  const usedMemory = Number(values.get("used_memory"));
  const maxMemory = Number(values.get("maxmemory"));
  if (
    !Number.isSafeInteger(usedMemory) ||
    usedMemory < 0 ||
    !Number.isSafeInteger(maxMemory) ||
    maxMemory < 0
  ) {
    throw new Error("Redis returned an invalid memory snapshot.");
  }
  if (maxMemory === 0) {
    return 0;
  }
  return Math.min(100, (usedMemory * 100) / maxMemory);
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Redis readiness deadline exceeded.")),
      READY_TIMEOUT_MS,
    );

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error("Redis failed."));
      },
    );
  });
}

@Injectable()
export class BullMqSimulationQueue implements SimulationQueuePort {
  constructor(
    @InjectQueue(SIMULATION_QUEUE_NAME)
    private readonly queue: Queue<
      SimulationJobData,
      void,
      typeof SIMULATION_JOB_NAME
    >,
  ) {}

  async isReady(): Promise<boolean> {
    try {
      await withTimeout(this.queue.waitUntilReady());
      return true;
    } catch {
      return false;
    }
  }

  async memoryPercent(): Promise<number> {
    const client = await withTimeout(this.queue.client);
    return redisMemoryPercent(await withTimeout(client.info()));
  }

  async snapshot(): Promise<BullMqQueueSnapshot> {
    const counts = await withTimeout(
      this.queue.getJobCounts(...READY_JOB_TYPES),
    );
    const depth = READY_JOB_TYPES.reduce(
      (total, jobType) => total + exactQueueCount(counts[jobType]),
      0,
    );
    const jobs =
      depth === 0
        ? []
        : await withTimeout(
            this.queue.getJobs([...READY_JOB_TYPES], 0, 99, false),
          );
    const timestamps = jobs.map((job) => {
      if (!Number.isSafeInteger(job.timestamp) || job.timestamp < 0) {
        throw new Error("BullMQ returned an invalid job timestamp.");
      }
      return job.timestamp;
    });
    const oldestReadyAgeSeconds =
      timestamps.length === 0
        ? 0
        : Math.max(0, (Date.now() - Math.min(...timestamps)) / 1_000);
    return Object.freeze({
      depth,
      memoryPercent: await this.memoryPercent(),
      oldestReadyAgeSeconds,
    });
  }

  async publish(value: unknown): Promise<PublishedSimulationJob> {
    const payload = await validateSimulationJob(value);
    const jobId = simulationJobId(payload);
    const job: Job<SimulationJobData, void, typeof SIMULATION_JOB_NAME> =
      await this.queue.add(SIMULATION_JOB_NAME, payload, {
        ...SIMULATION_JOB_OPTIONS,
        jobId,
      });

    if (job.id !== jobId) {
      throw new Error("BullMQ returned an unexpected simulation job identity.");
    }

    return Object.freeze({ job_id: jobId });
  }

  async provesPublished(value: unknown): Promise<boolean> {
    const payload = await validateSimulationJob(value);
    const jobId = simulationJobId(payload);
    const job = await this.queue.getJob(jobId);
    if (job === undefined || job === null) {
      return false;
    }
    let stored: SimulationJobData;
    try {
      stored = await validateSimulationJob(job.data);
    } catch {
      return false;
    }
    return (
      job.id === jobId &&
      job.name === SIMULATION_JOB_NAME &&
      job.opts.attempts === SIMULATION_JOB_OPTIONS.attempts &&
      stored.schema_version === payload.schema_version &&
      stored.run_id === payload.run_id &&
      stored.dispatch_generation === payload.dispatch_generation
    );
  }

  async removeForRuns(runIds: readonly string[]): Promise<void> {
    if (
      runIds.length > 10_000 ||
      runIds.some((runId) => !RUN_ID_PATTERN.test(runId)) ||
      new Set(runIds).size !== runIds.length
    ) {
      throw new Error("Organization deletion supplied invalid run identities.");
    }
    for (const runId of runIds) {
      for (let generation = 1; generation <= 3; generation += 1) {
        const jobId = `run-${runId}-generation-${generation}`;
        const job = await this.queue.getJob(jobId);
        if (job !== undefined && job !== null) {
          await job.remove();
        }
        const remaining = await this.queue.getJob(jobId);
        if (remaining !== undefined && remaining !== null) {
          throw new Error("BullMQ could not verify simulation job deletion.");
        }
      }
    }
  }
}
