import { Inject, Injectable, Optional } from "@nestjs/common";

import { DOMAIN_READINESS } from "../domain/domain.constants";
import type { DomainReadiness } from "../domain/domain-readiness";
import { SIMULATION_QUEUE_PORT } from "../queue/queue.constants";
import type { SimulationQueuePort } from "../queue/simulation-queue.port";

export interface HealthResponse {
  readonly status: "alive" | "ready" | "not_ready";
  readonly releaseSha?: string;
}

function releaseMetadata(): { releaseSha?: string } {
  const releaseSha = process.env.SIMULA_RELEASE_SHA?.trim();
  return releaseSha && /^[0-9a-f]{40}$/.test(releaseSha) ? { releaseSha } : {};
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(SIMULATION_QUEUE_PORT)
    private readonly simulationQueue: SimulationQueuePort,
    @Optional()
    @Inject(DOMAIN_READINESS)
    private readonly domainReadiness?: DomainReadiness,
  ) {}

  liveness(): HealthResponse {
    return Object.freeze({ status: "alive", ...releaseMetadata() });
  }

  async readiness(): Promise<HealthResponse> {
    const [queueReady, domainReady] = await Promise.all([
      this.simulationQueue.isReady(),
      this.domainReadiness?.isReady() ?? Promise.resolve(true),
    ]);
    return Object.freeze({
      status: queueReady && domainReady ? "ready" : "not_ready",
      ...releaseMetadata(),
    });
  }
}
