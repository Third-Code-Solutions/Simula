import type { SimulationJobData } from "../queue/simulation-job";

const RECOVERY_INTERVAL_MILLISECONDS = 30_000;
const DISPATCH_FAILURE_CODE = "dispatch_transport_failed";

export interface RunDispatchClaim {
  readonly outbox_id: string;
  readonly run_id: string;
  readonly dispatch_generation: number;
  readonly claim_token: string;
}

export interface RunOutboxDatabasePort {
  requireQueueTransport(): Promise<void>;
  finalizeRequestedCancellations(batchSize: number): Promise<number>;
  finalizePoisonedDispatches(batchSize: number): Promise<number>;
  reconcileStaleDispatches(batchSize: number): Promise<number>;
  claimDueDispatches(batchSize: number): Promise<readonly RunDispatchClaim[]>;
  confirmDispatch(outboxId: string, claimToken: string): Promise<boolean>;
  failDispatch(
    outboxId: string,
    claimToken: string,
    safeErrorCode: typeof DISPATCH_FAILURE_CODE,
  ): Promise<boolean>;
}

export interface RunDispatchQueuePort {
  publish(value: SimulationJobData): Promise<unknown>;
  provesPublished(value: SimulationJobData): Promise<boolean>;
}

export interface DispatchPass {
  readonly canceled: number;
  readonly poisoned: number;
  readonly recovered: number;
  readonly claimed: number;
  readonly confirmed: number;
}

function payload(claim: RunDispatchClaim): SimulationJobData {
  return Object.freeze({
    schema_version: 2,
    run_id: claim.run_id,
    dispatch_generation: claim.dispatch_generation,
  });
}

export class RunOutboxDispatcher {
  private nextRecoveryAt = 0;

  constructor(
    private readonly database: RunOutboxDatabasePort,
    private readonly queue: RunDispatchQueuePort,
    private readonly monotonicMilliseconds: () => number = () =>
      performance.now(),
  ) {}

  async dispatchOnce(batchSize = 10): Promise<DispatchPass> {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100) {
      throw new Error("dispatcher batch size is outside its contract");
    }
    await this.database.requireQueueTransport();
    const canceled =
      await this.database.finalizeRequestedCancellations(batchSize);
    const poisoned = await this.database.finalizePoisonedDispatches(batchSize);
    const now = this.monotonicMilliseconds();
    const recovered =
      now >= this.nextRecoveryAt
        ? await this.database.reconcileStaleDispatches(batchSize)
        : 0;
    if (now >= this.nextRecoveryAt) {
      this.nextRecoveryAt = now + RECOVERY_INTERVAL_MILLISECONDS;
    }
    const claims = await this.database.claimDueDispatches(batchSize);
    let confirmed = 0;

    for (const claim of claims) {
      const job = payload(claim);
      try {
        await this.queue.publish(job);
      } catch {
        let definitelyAbsent = false;
        try {
          definitelyAbsent = !(await this.queue.provesPublished(job));
        } catch {
          continue;
        }
        if (definitelyAbsent) {
          await this.database.failDispatch(
            claim.outbox_id,
            claim.claim_token,
            DISPATCH_FAILURE_CODE,
          );
        } else if (
          await this.database.confirmDispatch(
            claim.outbox_id,
            claim.claim_token,
          )
        ) {
          confirmed += 1;
        }
        continue;
      }
      let proved = false;
      try {
        proved = await this.queue.provesPublished(job);
      } catch {
        continue;
      }
      if (
        proved &&
        (await this.database.confirmDispatch(
          claim.outbox_id,
          claim.claim_token,
        ))
      ) {
        confirmed += 1;
      }
    }

    return Object.freeze({
      canceled,
      poisoned,
      recovered,
      claimed: claims.length,
      confirmed,
    });
  }
}
