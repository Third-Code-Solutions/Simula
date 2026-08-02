import type { AssetObjectStore } from "../assets/asset-object-store";
import type { SimulationQueuePort } from "../queue/simulation-queue.port";
import {
  OrganizationDeletionReconciler,
  type OrganizationCachePurger,
  type OrganizationDeletionDatabasePort,
  type OrganizationDeletionResourceClaim,
} from "./organization-deletion-reconciler";

const ORGANIZATION_ID = "00000000-0000-4000-8000-0000000000a1";
const REQUEST_ID = "00000000-0000-4000-8000-0000000000a2";
const RUN_ID = "00000000-0000-4000-8000-0000000000a3";
const CLAIM_TOKEN = "00000000-0000-4000-8000-0000000000a4";
const PROJECT_ID = "00000000-0000-4000-8000-0000000000a5";
const ASSET_ID = "00000000-0000-4000-8000-0000000000a6";
const OBJECT_NAME = `${ORGANIZATION_ID}/${PROJECT_ID}/${ASSET_ID}/${"a".repeat(64)}`;

function claim(
  resourceId: string,
  resourceKind: OrganizationDeletionResourceClaim["resource_kind"],
  resourceKey: string,
): OrganizationDeletionResourceClaim {
  return {
    resource_id: resourceId,
    request_id: REQUEST_ID,
    organization_id: ORGANIZATION_ID,
    resource_kind: resourceKind,
    resource_key: resourceKey,
    claim_token: CLAIM_TOKEN,
    claim_expires_at: "2026-07-30T12:00:00.000Z",
    attempt_count: 1,
  };
}

function fixture(claims: readonly OrganizationDeletionResourceClaim[]) {
  const database: jest.Mocked<OrganizationDeletionDatabasePort> = {
    claimOrganizationDeletionResources: jest.fn().mockResolvedValue(claims),
    completeOrganizationDeletionResource: jest.fn().mockResolvedValue(true),
    releaseOrganizationDeletionResource: jest.fn().mockResolvedValue(true),
    finalizeReadyOrganizationDeletions: jest.fn().mockResolvedValue(1),
  };
  const objectStore: jest.Mocked<AssetObjectStore> = {
    configured: true,
    isReady: jest.fn().mockResolvedValue(true),
    stat: jest.fn().mockResolvedValue(null),
    put: jest.fn(),
    get: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const queue: jest.Mocked<SimulationQueuePort> = {
    isReady: jest.fn().mockResolvedValue(true),
    publish: jest.fn(),
    provesPublished: jest.fn(),
    removeForRuns: jest.fn().mockResolvedValue(undefined),
  };
  const cache: jest.Mocked<OrganizationCachePurger> = {
    purgeOrganization: jest.fn().mockResolvedValue(undefined),
  };
  return { database, objectStore, queue, cache };
}

describe("OrganizationDeletionReconciler", () => {
  it("absence-verifies storage, queue, and cache before finalizing", async () => {
    const claims = [
      claim(
        "00000000-0000-4000-8000-0000000000b1",
        "storage_object",
        OBJECT_NAME,
      ),
      claim("00000000-0000-4000-8000-0000000000b2", "run", RUN_ID),
      claim("00000000-0000-4000-8000-0000000000b3", "cache", ORGANIZATION_ID),
    ] as const;
    const value = fixture(claims);
    const reconciler = new OrganizationDeletionReconciler(
      value.database,
      value.objectStore,
      value.queue,
      value.cache,
      () => 1,
    );

    await expect(reconciler.reconcileIfDue()).resolves.toEqual({
      claimed: 3,
      completed: 3,
      released: 0,
      finalized: 1,
    });
    expect(value.objectStore.delete).toHaveBeenCalledWith({
      bucket: "simula-private-assets",
      objectName: OBJECT_NAME,
    });
    expect(value.objectStore.stat).toHaveBeenCalledTimes(1);
    expect(value.queue.removeForRuns).toHaveBeenCalledWith([RUN_ID]);
    expect(value.cache.purgeOrganization).toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(
      value.database.completeOrganizationDeletionResource,
    ).toHaveBeenCalledTimes(3);
    expect(
      value.database.finalizeReadyOrganizationDeletions,
    ).toHaveBeenCalledWith(10);
  });

  it("releases a failed resource under its bounded safe error class", async () => {
    const value = fixture([
      claim(
        "00000000-0000-4000-8000-0000000000b4",
        "storage_object",
        OBJECT_NAME,
      ),
    ]);
    value.objectStore.stat.mockResolvedValue({
      byteSize: 1,
      contentSha256: "a".repeat(64),
      mediaType: "image/png",
    });
    const reconciler = new OrganizationDeletionReconciler(
      value.database,
      value.objectStore,
      value.queue,
      value.cache,
      () => 1,
    );

    await expect(reconciler.reconcileIfDue()).resolves.toEqual({
      claimed: 1,
      completed: 0,
      released: 1,
      finalized: 1,
    });
    expect(
      value.database.releaseOrganizationDeletionResource,
    ).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-0000000000b4",
      CLAIM_TOKEN,
      "storage_cleanup_failed",
    );
    expect(
      value.database.completeOrganizationDeletionResource,
    ).not.toHaveBeenCalled();
  });

  it("runs no more than once per recovery interval", async () => {
    const value = fixture([]);
    let now = 1;
    const reconciler = new OrganizationDeletionReconciler(
      value.database,
      value.objectStore,
      value.queue,
      value.cache,
      () => now,
    );

    await reconciler.reconcileIfDue();
    now = 2;
    await expect(reconciler.reconcileIfDue()).resolves.toEqual({
      claimed: 0,
      completed: 0,
      released: 0,
      finalized: 0,
    });
    expect(
      value.database.claimOrganizationDeletionResources,
    ).toHaveBeenCalledTimes(1);
  });
});
