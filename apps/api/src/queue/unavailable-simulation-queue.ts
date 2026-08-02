import { Injectable } from "@nestjs/common";

import type {
  PublishedSimulationJob,
  SimulationQueuePort,
} from "./simulation-queue.port";
import { SimulationQueueUnavailableError } from "./simulation-queue.port";

@Injectable()
export class UnavailableSimulationQueue implements SimulationQueuePort {
  async isReady(): Promise<boolean> {
    return false;
  }

  async publish(_value: unknown): Promise<PublishedSimulationJob> {
    throw new SimulationQueueUnavailableError();
  }

  async provesPublished(_value: unknown): Promise<boolean> {
    throw new SimulationQueueUnavailableError();
  }

  async removeForRuns(runIds: readonly string[]): Promise<void> {
    if (runIds.length !== 0) {
      throw new SimulationQueueUnavailableError();
    }
  }
}
