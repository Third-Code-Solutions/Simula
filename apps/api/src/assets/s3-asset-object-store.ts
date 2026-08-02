import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { createHash } from "node:crypto";

import { DOMAIN_RUNTIME_CONFIG } from "../domain/domain.constants";
import type {
  AssetStorageRuntime,
  EnabledDomainRuntime,
} from "../domain/domain-runtime";
import { dependencyUnavailable } from "../domain/problem";
import {
  ASSET_BUCKET,
  MAX_ASSET_BYTES,
  type AssetMediaType,
  type AssetObject,
  type AssetObjectIdentity,
  type AssetObjectMetadata,
  type AssetObjectStore,
} from "./asset-object-store";

const STORAGE_TIMEOUT_MS = 8_000;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const OBJECT_NAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{64}$/;
const SAFE_FILENAME_PATTERN = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9_. -]{0,119}$/;

function storageProblem(): never {
  throw dependencyUnavailable(
    "Private campaign-asset storage is temporarily unavailable.",
  );
}

function isMissing(error: unknown): boolean {
  const value = error as {
    readonly name?: unknown;
    readonly $metadata?: { readonly httpStatusCode?: unknown };
  };
  return (
    value.name === "NotFound" ||
    value.name === "NoSuchKey" ||
    value.$metadata?.httpStatusCode === 404
  );
}

function assertIdentity(identity: AssetObjectIdentity): void {
  if (
    identity.bucket !== ASSET_BUCKET ||
    !OBJECT_NAME_PATTERN.test(identity.objectName)
  ) {
    storageProblem();
  }
}

function boundedMetadata(
  byteSize: unknown,
  mediaType: unknown,
  contentSha256: unknown,
): AssetObjectMetadata {
  if (
    typeof byteSize !== "number" ||
    !Number.isSafeInteger(byteSize) ||
    byteSize < 1 ||
    byteSize > MAX_ASSET_BYTES ||
    typeof mediaType !== "string" ||
    !(
      mediaType === "application/pdf" ||
      mediaType === "image/jpeg" ||
      mediaType === "image/png" ||
      mediaType === "image/webp" ||
      mediaType === "video/mp4"
    ) ||
    typeof contentSha256 !== "string" ||
    !SHA256_PATTERN.test(contentSha256)
  ) {
    storageProblem();
  }
  return Object.freeze({
    byteSize,
    mediaType: mediaType as AssetMediaType,
    contentSha256,
  });
}

function clientConfig(runtime: AssetStorageRuntime): S3ClientConfig {
  return {
    credentials: {
      accessKeyId: runtime.accessKeyId,
      secretAccessKey: runtime.secretAccessKey,
    },
    endpoint: runtime.endpoint,
    forcePathStyle: true,
    maxAttempts: 2,
    region: runtime.region,
  };
}

@Injectable()
export class S3AssetObjectStore implements AssetObjectStore, OnModuleDestroy {
  readonly configured = true;
  private readonly client: S3Client;

  constructor(
    @Inject(DOMAIN_RUNTIME_CONFIG)
    runtime: EnabledDomainRuntime | AssetStorageRuntime,
  ) {
    const assetStorage = "endpoint" in runtime ? runtime : runtime.assetStorage;
    if (assetStorage === undefined) {
      throw new Error("asset storage runtime is unavailable");
    }
    this.client = new S3Client(clientConfig(assetStorage));
  }

  async onModuleDestroy(): Promise<void> {
    this.client.destroy();
  }

  private async send<T>(
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STORAGE_TIMEOUT_MS);
    try {
      return await operation(controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  }

  async isReady(): Promise<boolean> {
    try {
      await this.send((signal) =>
        this.client.send(new HeadBucketCommand({ Bucket: ASSET_BUCKET }), {
          abortSignal: signal,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async stat(
    identity: AssetObjectIdentity,
  ): Promise<AssetObjectMetadata | null> {
    assertIdentity(identity);
    try {
      const result = await this.send((signal) =>
        this.client.send(
          new HeadObjectCommand({
            Bucket: identity.bucket,
            Key: identity.objectName,
          }),
          { abortSignal: signal },
        ),
      );
      return boundedMetadata(
        result.ContentLength,
        result.ContentType,
        result.Metadata?.["simula-content-sha256"],
      );
    } catch (error) {
      if (isMissing(error)) return null;
      storageProblem();
    }
  }

  async put(
    identity: AssetObjectIdentity,
    metadata: AssetObjectMetadata & { readonly filename: string },
    content: Buffer,
  ): Promise<void> {
    assertIdentity(identity);
    const bounded = boundedMetadata(
      metadata.byteSize,
      metadata.mediaType,
      metadata.contentSha256,
    );
    if (
      !SAFE_FILENAME_PATTERN.test(metadata.filename) ||
      content.length !== bounded.byteSize ||
      createHash("sha256").update(content).digest("hex") !==
        bounded.contentSha256
    ) {
      storageProblem();
    }
    try {
      await this.send((signal) =>
        this.client.send(
          new PutObjectCommand({
            Body: content,
            Bucket: identity.bucket,
            CacheControl: "private, no-store",
            ContentDisposition: `inline; filename="${metadata.filename}"`,
            ContentLength: bounded.byteSize,
            ContentType: bounded.mediaType,
            Key: identity.objectName,
            Metadata: {
              "simula-content-sha256": bounded.contentSha256,
            },
          }),
          { abortSignal: signal },
        ),
      );
    } catch {
      storageProblem();
    }
  }

  async get(identity: AssetObjectIdentity): Promise<AssetObject | null> {
    assertIdentity(identity);
    try {
      const result = await this.send((signal) =>
        this.client.send(
          new GetObjectCommand({
            Bucket: identity.bucket,
            Key: identity.objectName,
          }),
          { abortSignal: signal },
        ),
      );
      if (result.Body === undefined) storageProblem();
      const bytes = await result.Body.transformToByteArray();
      const metadata = boundedMetadata(
        result.ContentLength,
        result.ContentType,
        result.Metadata?.["simula-content-sha256"],
      );
      if (bytes.byteLength !== metadata.byteSize) storageProblem();
      if (
        createHash("sha256").update(bytes).digest("hex") !==
        metadata.contentSha256
      ) {
        storageProblem();
      }
      return Object.freeze({
        ...metadata,
        content: Buffer.from(bytes),
      });
    } catch (error) {
      if (isMissing(error)) return null;
      storageProblem();
    }
  }

  async delete(identity: AssetObjectIdentity): Promise<void> {
    assertIdentity(identity);
    try {
      await this.send((signal) =>
        this.client.send(
          new DeleteObjectCommand({
            Bucket: identity.bucket,
            Key: identity.objectName,
          }),
          { abortSignal: signal },
        ),
      );
    } catch {
      storageProblem();
    }
  }
}

@Injectable()
export class UnavailableAssetObjectStore implements AssetObjectStore {
  readonly configured = false;

  async isReady(): Promise<boolean> {
    return false;
  }

  async stat(): Promise<null> {
    storageProblem();
  }

  async put(): Promise<void> {
    storageProblem();
  }

  async get(): Promise<null> {
    storageProblem();
  }

  async delete(): Promise<void> {
    storageProblem();
  }
}
