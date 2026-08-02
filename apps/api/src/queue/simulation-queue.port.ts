import type { SimulationJobData } from "./simulation-job";

export interface PublishedSimulationJob {
  readonly job_id: string;
}

export interface SimulationQueuePort {
  isReady(): Promise<boolean>;
  publish(value: unknown): Promise<PublishedSimulationJob>;
  provesPublished(value: unknown): Promise<boolean>;
  removeForRuns(runIds: readonly string[]): Promise<void>;
}

export class SimulationQueueUnavailableError extends Error {
  constructor() {
    super("Simulation queue is unavailable.");
    this.name = "SimulationQueueUnavailableError";
  }
}

export type SimulationJob = SimulationJobData;
