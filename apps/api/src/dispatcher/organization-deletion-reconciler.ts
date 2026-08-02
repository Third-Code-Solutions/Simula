import { isUUID } from "class-validator";

import {
  ASSET_BUCKET,
  type AssetObjectStore,
} from "../assets/asset-object-store";
import type { SimulationQueuePort } from "../queue/simulation-queue.port";

const RECONCILIATION_INTERVAL_MILLISECONDS = 30_000;

export type OrganizationDeletionResourceKind =
  "storage_object" | "run" | "cache";

export type OrganizationDeletionCleanupError =
  "storage_cleanup_failed" | "queue_cleanup_failed" | "cache_cleanup_failed";

export interface OrganizationDeletionResourceClaim {
  readonly resource_id: string;
  readonly request_id: string;
  readonly organization_id: string;
  readonly resource_kind: OrganizationDeletionResourceKind;
  readonly resource_key: string;
  readonly claim_token: string;
  readonly claim_expires_at: string;
  readonly attempt_count: number;
}

export interface OrganizationDeletionDatabasePort {
  claimOrganizationDeletionResources(
    batchSize: number,
  ): Promise<readonly OrganizationDeletionResourceClaim[]>;
  completeOrganizationDeletionResource(
    resourceId: string,
    claimToken: string,
  ): Promise<boolean>;
  releaseOrganizationDeletionResource(
    resourceId: string,
    claimToken: string,
    errorCode: OrganizationDeletionCleanupError,
  ): Promise<boolean>;
  finalizeReadyOrganizationDeletions(batchSize: number): Promise<number>;
}

export interface OrganizationCachePurger {
  purgeOrganization(organizationId: string): Promise<void>;
}

export interface OrganizationDeletionPass {
  readonly claimed: number;
  readonly completed: number;
  readonly released: number;
  readonly finalized: number;
}

function emptyPass(): OrganizationDeletionPass {
  return Object.freeze({
    claimed: 0,
    completed: 0,
    released: 0,
    finalized: 0,
  });
}

function cleanupError(
  kind: OrganizationDeletionResourceKind,
): OrganizationDeletionCleanupError {
  if (kind === "storage_object") return "storage_cleanup_failed";
  if (kind === "run") return "queue_cleanup_failed";
  return "cache_cleanup_failed";
}

export class OrganizationDeletionReconciler {
  private nextReconciliationAt = 0;

  constructor(
    private readonly database: OrganizationDeletionDatabasePort,
    private readonly objectStore: AssetObjectStore,
    private readonly queue: SimulationQueuePort,
    private readonly cache: OrganizationCachePurger,
    private readonly monotonicMilliseconds: () => number = () =>
      performance.now(),
  ) {}

  async reconcileIfDue(batchSize = 10): Promise<OrganizationDeletionPass> {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 50) {
      throw new Error(
        "organization deletion batch size is outside its contract",
      );
    }
    const now = this.monotonicMilliseconds();
    if (now < this.nextReconciliationAt) return emptyPass();
    this.nextReconciliationAt = now + RECONCILIATION_INTERVAL_MILLISECONDS;

    const claims =
      await this.database.claimOrganizationDeletionResources(batchSize);
    let completed = 0;
    let released = 0;

    for (const claim of claims) {
      try {
        await this.cleanup(claim);
        if (
          await this.database.completeOrganizationDeletionResource(
            claim.resource_id,
            claim.claim_token,
          )
        ) {
          completed += 1;
        }
      } catch {
        if (
          await this.database.releaseOrganizationDeletionResource(
            claim.resource_id,
            claim.claim_token,
            cleanupError(claim.resource_kind),
          )
        ) {
          released += 1;
        }
      }
    }

    const finalized =
      await this.database.finalizeReadyOrganizationDeletions(batchSize);
    return Object.freeze({
      claimed: claims.length,
      completed,
      released,
      finalized,
    });
  }

  private async cleanup(
    claim: OrganizationDeletionResourceClaim,
  ): Promise<void> {
    if (
      !isUUID(claim.resource_id) ||
      !isUUID(claim.request_id) ||
      !isUUID(claim.organization_id) ||
      !isUUID(claim.claim_token)
    ) {
      throw new Error("organization deletion claim identity is invalid");
    }
    if (claim.resource_kind === "run") {
      if (!isUUID(claim.resource_key)) {
        throw new Error("organization deletion run identity is invalid");
      }
      await this.queue.removeForRuns([claim.resource_key]);
      return;
    }
    if (claim.resource_kind === "cache") {
      if (claim.resource_key !== claim.organization_id) {
        throw new Error("organization deletion cache identity is invalid");
      }
      await this.cache.purgeOrganization(claim.organization_id);
      return;
    }
    if (
      !this.objectStore.configured ||
      !claim.resource_key.startsWith(`${claim.organization_id}/`)
    ) {
      throw new Error("organization deletion storage identity is unavailable");
    }
    const identity = {
      bucket: ASSET_BUCKET,
      objectName: claim.resource_key,
    } as const;
    await this.objectStore.delete(identity);
    if ((await this.objectStore.stat(identity)) !== null) {
      throw new Error("organization deletion storage object still exists");
    }
  }
}
