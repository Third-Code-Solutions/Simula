import type { Response } from "express";

import type { AssetObjectStore } from "../assets/asset-object-store";
import type { AuthenticatedRequest } from "../auth/supabase-auth.guard";
import type { VerifiedIdentity } from "../auth/identity";
import type { DomainRateLimiter } from "../rate-limits/domain-rate-limiter";
import type { SimulationQueuePort } from "../queue/simulation-queue.port";
import { CursorCodec } from "./cursor-codec";
import type {
  OrganizationDeletionRecord,
  OrganizationGateway,
} from "./organization-gateway.port";
import { OrganizationsController } from "./organizations.controller";

const ORGANIZATION_ID = "018f274b-3c77-7b22-b749-c9274230ef9a";
const REQUEST_ID = "018f274b-3c77-7b22-b749-c9274230ef9b";
const RUN_ID = "018f274b-3c77-7b22-b749-c9274230ef9c";
const CORRELATION_ID = "018f274b-3c77-7b22-b749-c9274230ef9d";
const OBJECT_NAME = `${ORGANIZATION_ID}/018f274b-3c77-7b22-b749-c9274230ef9e/018f274b-3c77-7b22-b749-c9274230ef9f/${"a".repeat(64)}`;
const IDENTITY: VerifiedIdentity = {
  userId: "018f274b-3c77-7b22-b749-c9274230ef90",
  issuer: "http://127.0.0.1:54321/auth/v1",
  expiresAt: 4_102_444_800,
  sessionId: "018f274b-3c77-7b22-b749-c9274230ef91",
};
const REQUEST = {
  rawHeaders: ["Idempotency-Key", "organization-delete-key-0001"],
  simulaCorrelationId: CORRELATION_ID,
} as AuthenticatedRequest;

function deletion(
  status: "pending" | "completed",
  replayed = false,
): OrganizationDeletionRecord {
  return {
    request_id: REQUEST_ID,
    organization_id: ORGANIZATION_ID,
    status,
    storage_objects: status === "pending" ? [OBJECT_NAME] : [],
    run_ids: status === "pending" ? [RUN_ID] : [],
    requested_at: "2026-07-30T12:00:00.000000Z",
    completed_at: status === "completed" ? "2026-07-30T12:01:00.000000Z" : null,
    replayed,
  };
}

function harness() {
  const gateway = {
    requestOrganizationDeletion: jest
      .fn()
      .mockResolvedValue(deletion("pending")),
    confirmOrganizationDeletion: jest
      .fn()
      .mockResolvedValue(deletion("completed")),
  } as unknown as OrganizationGateway;
  const rateLimiter = {
    requireOrganizationMutation: jest.fn().mockResolvedValue({
      markerKey: "marker",
      ownerToken: "a".repeat(32),
      acceptedReplay: false,
    }),
    acceptIdempotency: jest.fn().mockResolvedValue(undefined),
    rejectIdempotency: jest.fn().mockResolvedValue(undefined),
    purgeOrganization: jest.fn().mockResolvedValue(undefined),
  } as unknown as DomainRateLimiter;
  const objectStore = {
    configured: true,
    delete: jest.fn().mockResolvedValue(undefined),
    stat: jest.fn().mockResolvedValue(null),
  } as unknown as AssetObjectStore;
  const queue = {
    removeForRuns: jest.fn().mockResolvedValue(undefined),
  } as unknown as SimulationQueuePort;
  const controller = new OrganizationsController(
    gateway,
    rateLimiter,
    objectStore,
    queue,
    {} as CursorCodec,
  );
  const response = {
    setHeader: jest.fn(),
  } as unknown as Response;
  return { controller, gateway, objectStore, queue, rateLimiter, response };
}

describe("OrganizationsController deletion", () => {
  it("resumes the durable request, verifies every external purge, then deletes the graph", async () => {
    const values = harness();

    await expect(
      values.controller.delete(
        ORGANIZATION_ID,
        IDENTITY,
        { confirmation: "Northstar Strategy" },
        REQUEST,
        values.response,
      ),
    ).resolves.toEqual({
      request_id: REQUEST_ID,
      organization_id: ORGANIZATION_ID,
      status: "completed",
      requested_at: "2026-07-30T12:00:00.000000Z",
      completed_at: "2026-07-30T12:01:00.000000Z",
      replayed: false,
    });

    expect(values.objectStore.delete).toHaveBeenCalledWith({
      bucket: "simula-private-assets",
      objectName: OBJECT_NAME,
    });
    expect(values.objectStore.stat).toHaveBeenCalledWith({
      bucket: "simula-private-assets",
      objectName: OBJECT_NAME,
    });
    expect(values.queue.removeForRuns).toHaveBeenCalledWith([RUN_ID]);
    expect(values.rateLimiter.purgeOrganization).toHaveBeenCalledWith(
      ORGANIZATION_ID,
    );
    expect(values.gateway.confirmOrganizationDeletion).toHaveBeenCalledWith(
      IDENTITY,
      REQUEST_ID,
      ORGANIZATION_ID,
    );
    expect(values.rateLimiter.acceptIdempotency).toHaveBeenCalledTimes(1);
    expect(values.rateLimiter.rejectIdempotency).not.toHaveBeenCalled();
  });

  it("keeps the durable request pending when external absence cannot be proved", async () => {
    const values = harness();
    jest.mocked(values.objectStore.stat).mockResolvedValue({
      byteSize: 1,
      contentSha256: "a".repeat(64),
      mediaType: "image/png",
    });

    await expect(
      values.controller.delete(
        ORGANIZATION_ID,
        IDENTITY,
        { confirmation: "Northstar Strategy" },
        REQUEST,
        values.response,
      ),
    ).rejects.toMatchObject({
      status: 503,
      code: "dependency_unavailable",
    });

    expect(values.gateway.confirmOrganizationDeletion).not.toHaveBeenCalled();
    expect(values.rateLimiter.acceptIdempotency).toHaveBeenCalledTimes(1);
    expect(values.rateLimiter.rejectIdempotency).not.toHaveBeenCalled();
  });

  it("releases the provisional marker when the database rejects the request", async () => {
    const values = harness();
    jest
      .mocked(values.gateway.requestOrganizationDeletion)
      .mockRejectedValue(new Error("active runs"));

    await expect(
      values.controller.delete(
        ORGANIZATION_ID,
        IDENTITY,
        { confirmation: "Northstar Strategy" },
        REQUEST,
        values.response,
      ),
    ).rejects.toThrow("active runs");

    expect(values.rateLimiter.acceptIdempotency).not.toHaveBeenCalled();
    expect(values.rateLimiter.rejectIdempotency).toHaveBeenCalledTimes(1);
  });
});
