import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";

import type { EnabledDomainRuntime } from "../domain/domain-runtime";
import { AppProblem } from "../domain/problem";
import { ASSET_BUCKET } from "./asset-object-store";
import { S3AssetObjectStore } from "./s3-asset-object-store";

const CONTENT = Buffer.from("asset");
const CHECKSUM = createHash("sha256").update(CONTENT).digest("hex");
const OBJECT_NAME =
  "018f274b-3c77-7b22-b749-c9274230efa1/" +
  "018f274b-3c77-7b22-b749-c9274230efa2/" +
  "018f274b-3c77-7b22-b749-c9274230efa3/" +
  CHECKSUM;
const METADATA = Object.freeze({
  byteSize: CONTENT.length,
  contentSha256: CHECKSUM,
  mediaType: "image/png" as const,
});
const RUNTIME = Object.freeze({
  enabled: true,
  assetStorage: {
    endpoint: "http://127.0.0.1:54321/storage/v1/s3",
    region: "local",
    accessKeyId: "local-access-key",
    secretAccessKey: "s".repeat(32),
  },
} as EnabledDomainRuntime);

describe("S3AssetObjectStore", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses only bounded supported S3 operations and metadata", async () => {
    const send = jest.spyOn(S3Client.prototype, "send") as unknown as jest.Mock;
    send.mockImplementation(async (command: unknown) => {
      if (command instanceof HeadBucketCommand) return {};
      if (command instanceof HeadObjectCommand) {
        return {
          ContentLength: CONTENT.length,
          ContentType: "image/png",
          Metadata: { "simula-content-sha256": CHECKSUM },
        };
      }
      if (command instanceof GetObjectCommand) {
        return {
          Body: {
            transformToByteArray: async () => Uint8Array.from(CONTENT),
          },
          ContentLength: CONTENT.length,
          ContentType: "image/png",
          Metadata: { "simula-content-sha256": CHECKSUM },
        };
      }
      if (
        command instanceof PutObjectCommand ||
        command instanceof DeleteObjectCommand
      ) {
        return {};
      }
      throw new Error("unexpected command");
    });
    const store = new S3AssetObjectStore(RUNTIME);
    const identity = { bucket: ASSET_BUCKET, objectName: OBJECT_NAME } as const;

    await expect(store.isReady()).resolves.toBe(true);
    await expect(store.stat(identity)).resolves.toEqual(METADATA);
    await store.put(
      identity,
      { ...METADATA, filename: "concept.png" },
      CONTENT,
    );
    await expect(store.get(identity)).resolves.toEqual({
      ...METADATA,
      content: CONTENT,
    });
    await store.delete(identity);

    const put = (send.mock.calls as unknown[][])
      .map((call) => call[0])
      .find(
        (command): command is PutObjectCommand =>
          command instanceof PutObjectCommand,
      );
    expect(put?.input).toMatchObject({
      Bucket: ASSET_BUCKET,
      Key: OBJECT_NAME,
      ContentLength: CONTENT.length,
      ContentType: "image/png",
      CacheControl: "private, no-store",
      Metadata: { "simula-content-sha256": CHECKSUM },
    });
    await store.onModuleDestroy();
  });

  it("maps missing objects to null and malformed metadata to a safe 503", async () => {
    const send = jest.spyOn(S3Client.prototype, "send") as unknown as jest.Mock;
    send.mockRejectedValueOnce({ name: "NotFound" });
    const store = new S3AssetObjectStore(RUNTIME);
    const identity = { bucket: ASSET_BUCKET, objectName: OBJECT_NAME } as const;

    await expect(store.stat(identity)).resolves.toBeNull();
    send.mockResolvedValueOnce({
      ContentLength: 0,
      ContentType: "text/html",
      Metadata: {},
    } as never);
    await expect(store.stat(identity)).rejects.toBeInstanceOf(AppProblem);
    await store.onModuleDestroy();
  });

  it("rejects out-of-scope keys and content mismatches before S3 access", async () => {
    const send = jest.spyOn(S3Client.prototype, "send") as unknown as jest.Mock;
    const store = new S3AssetObjectStore(RUNTIME);

    await expect(
      store.stat({
        bucket: ASSET_BUCKET,
        objectName: "../another-bucket/object",
      }),
    ).rejects.toBeInstanceOf(AppProblem);
    await expect(
      store.put(
        { bucket: ASSET_BUCKET, objectName: OBJECT_NAME },
        { ...METADATA, filename: "concept.png" },
        Buffer.from("different"),
      ),
    ).rejects.toBeInstanceOf(AppProblem);
    expect(send).not.toHaveBeenCalled();
    await store.onModuleDestroy();
  });
});
