import { createHash } from "node:crypto";

import type { VerifiedIdentity } from "../auth/identity";
import { AppProblem } from "../domain/problem";
import type { OrganizationGateway } from "../organizations/organization-gateway.port";
import type { DomainRateLimiter } from "../rate-limits/domain-rate-limiter";
import type { AssetObjectStore } from "./asset-object-store";
import { StimulusAssetsController } from "./stimulus-assets.controller";

const USER_ID = "018f274b-3c77-7b22-b749-c9274230efa0";
const ORGANIZATION_ID = "018f274b-3c77-7b22-b749-c9274230efa1";
const STIMULUS_ID = "018f274b-3c77-7b22-b749-c9274230efa2";
const ASSET_ID = "018f274b-3c77-7b22-b749-c9274230efa3";
const CORRELATION_ID = "018f274b-3c77-4b22-b749-c9274230efa4";
const IDEMPOTENCY_KEY = "asset-test-key-0001";
const CONTENT = Buffer.from("bounded visual fixture", "utf8");
const CHECKSUM = createHash("sha256").update(CONTENT).digest("hex");
const RETENTION = "2026-08-15T00:00:00.000000Z";

const IDENTITY: VerifiedIdentity = Object.freeze({
  userId: USER_ID,
  issuer: "http://127.0.0.1:54321/auth/v1",
  expiresAt: 1_800_000_000,
  sessionId: "018f274b-3c77-7b22-b749-c9274230efa5",
});

function asset(
  status: "pending_upload" | "available" | "deleted" = "pending_upload",
) {
  return Object.freeze({
    asset_id: ASSET_ID,
    organization_id: ORGANIZATION_ID,
    stimulus_id: STIMULUS_ID,
    storage_bucket_id: "simula-private-assets" as const,
    storage_object_name: `${ORGANIZATION_ID}/${STIMULUS_ID}/${ASSET_ID}/${CHECKSUM}`,
    filename: "concept.png",
    media_type: "image/png" as const,
    expected_byte_size: CONTENT.length,
    expected_content_sha256: CHECKSUM,
    byte_size: status === "available" ? CONTENT.length : null,
    content_sha256: status === "available" ? CHECKSUM : null,
    status,
    retention_until: RETENTION,
    created_at: "2026-07-29T15:00:00.000000Z",
    replayed: false,
  });
}

function request(contentType = "image/png") {
  return {
    rawHeaders: [
      "Idempotency-Key",
      IDEMPOTENCY_KEY,
      "Content-Type",
      contentType,
    ],
    header: jest.fn((name: string) =>
      name.toLowerCase() === "content-type" ? contentType : undefined,
    ),
    simulaCorrelationId: CORRELATION_ID,
  };
}

function response() {
  const value = {
    setHeader: jest.fn(),
    status: jest.fn(),
    send: jest.fn(),
  };
  value.status.mockReturnValue(value);
  value.send.mockReturnValue(value);
  return value;
}

function mocks() {
  const admission = Object.freeze({
    markerKey: "rate-marker",
    ownerToken: "owner-token",
    acceptedReplay: false,
  });
  const gateway = {
    organizationForStimulus: jest.fn().mockResolvedValue(ORGANIZATION_ID),
    createStimulusAsset: jest.fn().mockResolvedValue({
      value: asset(),
      replayed: false,
    }),
    listStimulusAssets: jest.fn().mockResolvedValue([asset()]),
    getStimulusAsset: jest.fn().mockResolvedValue(asset()),
    confirmStimulusAssetUpload: jest.fn().mockResolvedValue(asset("available")),
    requestStimulusAssetDeletion: jest.fn().mockResolvedValue({
      value: { ...asset(), status: "deletion_requested" },
      replayed: false,
    }),
    confirmStimulusAssetDeletion: jest.fn().mockResolvedValue(asset("deleted")),
  } as unknown as jest.Mocked<OrganizationGateway>;
  const rateLimiter = {
    requireOrganizationMutation: jest.fn().mockResolvedValue(admission),
    requireGeneral: jest.fn().mockResolvedValue(undefined),
    acceptIdempotency: jest.fn().mockResolvedValue(undefined),
    rejectIdempotency: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<DomainRateLimiter>;
  const objectStore = {
    configured: true,
    isReady: jest.fn().mockResolvedValue(true),
    stat: jest.fn().mockResolvedValueOnce(null).mockResolvedValue({
      byteSize: CONTENT.length,
      contentSha256: CHECKSUM,
      mediaType: "image/png",
    }),
    put: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue({
      byteSize: CONTENT.length,
      contentSha256: CHECKSUM,
      mediaType: "image/png",
      content: CONTENT,
    }),
    delete: jest.fn().mockResolvedValue(undefined),
  } as jest.Mocked<AssetObjectStore>;
  return {
    controller: new StimulusAssetsController(gateway, rateLimiter, objectStore),
    gateway,
    objectStore,
    rateLimiter,
  };
}

describe("StimulusAssetsController", () => {
  it("reserves metadata without exposing the private object path", async () => {
    const { controller } = mocks();
    const result = await controller.reserve(
      STIMULUS_ID,
      IDENTITY,
      {
        filename: "concept.png",
        media_type: "image/png",
        byte_size: CONTENT.length,
        content_sha256: CHECKSUM,
        retention_until: RETENTION,
      },
      request() as never,
      response() as never,
    );

    expect(result.data).toMatchObject({
      asset_id: ASSET_ID,
      status: "pending_upload",
    });
    expect(result.data).not.toHaveProperty("storage_object_name");
    expect(result.data).not.toHaveProperty("storage_bucket_id");
  });

  it("stores, rechecks, and durably confirms exact reserved bytes", async () => {
    const { controller, gateway, objectStore } = mocks();

    const result = await controller.upload(
      ASSET_ID,
      IDENTITY,
      CONTENT,
      request() as never,
      response() as never,
    );

    expect(objectStore.put).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: "simula-private-assets" }),
      expect.objectContaining({
        byteSize: CONTENT.length,
        contentSha256: CHECKSUM,
        mediaType: "image/png",
      }),
      CONTENT,
    );
    expect(gateway.confirmStimulusAssetUpload).toHaveBeenCalledWith(
      IDENTITY,
      ASSET_ID,
      CONTENT.length,
      CHECKSUM,
      CORRELATION_ID,
    );
    expect(result.data.status).toBe("available");
  });

  it("rejects bytes that do not match the immutable reservation", async () => {
    const { controller, gateway, objectStore } = mocks();

    await expect(
      controller.upload(
        ASSET_ID,
        IDENTITY,
        Buffer.from("different"),
        request() as never,
        response() as never,
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "version_conflict",
    });
    expect(objectStore.put).not.toHaveBeenCalled();
    expect(gateway.confirmStimulusAssetUpload).not.toHaveBeenCalled();
  });

  it("rejects upload after the retention window has ended", async () => {
    const { controller, gateway, objectStore } = mocks();
    gateway.getStimulusAsset.mockResolvedValue({
      ...asset(),
      retention_until: new Date(Date.now() - 1_000).toISOString(),
    });

    await expect(
      controller.upload(
        ASSET_ID,
        IDENTITY,
        CONTENT,
        request() as never,
        response() as never,
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "version_conflict",
    });
    expect(objectStore.stat).not.toHaveBeenCalled();
  });

  it("does not rewrite a matching object during upload replay", async () => {
    const { controller, objectStore } = mocks();
    objectStore.stat.mockReset();
    objectStore.stat.mockResolvedValue({
      byteSize: CONTENT.length,
      contentSha256: CHECKSUM,
      mediaType: "image/png",
    });

    await controller.upload(
      ASSET_ID,
      IDENTITY,
      CONTENT,
      request() as never,
      response() as never,
    );

    expect(objectStore.put).not.toHaveBeenCalled();
  });

  it("rechecks downloaded bytes and emits private immutable headers", async () => {
    const { controller, gateway } = mocks();
    gateway.getStimulusAsset.mockResolvedValue(asset("available"));
    const output = response();

    await controller.download(ASSET_ID, IDENTITY, output as never);

    expect(output.setHeader).toHaveBeenCalledWith("ETag", `"${CHECKSUM}"`);
    expect(output.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store",
    );
    expect(output.send).toHaveBeenCalledWith(CONTENT);
  });

  it("denies expired downloads before object storage is read", async () => {
    const { controller, gateway, objectStore } = mocks();
    gateway.getStimulusAsset.mockResolvedValue({
      ...asset("available"),
      retention_until: new Date(Date.now() - 1_000).toISOString(),
    });

    await expect(
      controller.download(ASSET_ID, IDENTITY, response() as never),
    ).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
    expect(objectStore.get).not.toHaveBeenCalled();
  });

  it("fails closed when stored bytes no longer match metadata", async () => {
    const { controller, gateway, objectStore } = mocks();
    gateway.getStimulusAsset.mockResolvedValue(asset("available"));
    objectStore.get.mockResolvedValue({
      byteSize: CONTENT.length,
      contentSha256: CHECKSUM,
      mediaType: "image/png",
      content: Buffer.from("tampered"),
    });

    await expect(
      controller.download(ASSET_ID, IDENTITY, response() as never),
    ).rejects.toBeInstanceOf(AppProblem);
  });

  it("deletes object bytes before confirming the durable tombstone", async () => {
    const { controller, gateway, objectStore } = mocks();
    objectStore.stat.mockReset();
    objectStore.stat.mockResolvedValue(null);
    const result = await controller.delete(
      ASSET_ID,
      IDENTITY,
      {},
      request("application/json") as never,
      response() as never,
    );

    expect(objectStore.delete).toHaveBeenCalled();
    expect(gateway.confirmStimulusAssetDeletion).toHaveBeenCalledWith(
      IDENTITY,
      ASSET_ID,
      CORRELATION_ID,
    );
    expect(result.data.status).toBe("deleted");
  });

  it("keeps deletion requested after ambiguous storage failure and recovers with the same key", async () => {
    const { controller, gateway, objectStore, rateLimiter } = mocks();
    const requested = { ...asset(), status: "deletion_requested" as const };
    gateway.requestStimulusAssetDeletion
      .mockReset()
      .mockResolvedValueOnce({ value: requested, replayed: false })
      .mockResolvedValueOnce({ value: requested, replayed: true });
    objectStore.stat
      .mockReset()
      .mockResolvedValueOnce({
        byteSize: CONTENT.length,
        contentSha256: CHECKSUM,
        mediaType: "image/png",
      })
      .mockResolvedValueOnce(null);

    await expect(
      controller.delete(
        ASSET_ID,
        IDENTITY,
        {},
        request("application/json") as never,
        response() as never,
      ),
    ).rejects.toMatchObject({
      status: 503,
      code: "dependency_unavailable",
    });
    expect(gateway.confirmStimulusAssetDeletion).not.toHaveBeenCalled();
    expect(rateLimiter.rejectIdempotency).toHaveBeenCalledTimes(1);

    const output = response();
    const recovered = await controller.delete(
      ASSET_ID,
      IDENTITY,
      {},
      request("application/json") as never,
      output as never,
    );

    expect(objectStore.delete).toHaveBeenCalledTimes(2);
    expect(gateway.confirmStimulusAssetDeletion).toHaveBeenCalledTimes(1);
    expect(rateLimiter.acceptIdempotency).toHaveBeenCalledTimes(1);
    expect(output.setHeader).toHaveBeenCalledWith(
      "Idempotent-Replayed",
      "true",
    );
    expect(recovered.data.status).toBe("deleted");
  });

  it("rejects reservations before database mutation when storage is disabled", async () => {
    const { controller, gateway, objectStore } = mocks();
    Object.defineProperty(objectStore, "configured", { value: false });

    await expect(
      controller.reserve(
        STIMULUS_ID,
        IDENTITY,
        {
          filename: "concept.png",
          media_type: "image/png",
          byte_size: CONTENT.length,
          content_sha256: CHECKSUM,
          retention_until: RETENTION,
        },
        request() as never,
        response() as never,
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(gateway.createStimulusAsset).not.toHaveBeenCalled();
  });
});
