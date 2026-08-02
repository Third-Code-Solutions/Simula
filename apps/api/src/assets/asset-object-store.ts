export const ASSET_BUCKET = "simula-private-assets";
export const MAX_ASSET_BYTES = 16_777_216;
export const ASSET_MEDIA_TYPES = Object.freeze([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
] as const);

export type AssetMediaType = (typeof ASSET_MEDIA_TYPES)[number];

export interface AssetObjectIdentity {
  readonly bucket: typeof ASSET_BUCKET;
  readonly objectName: string;
}

export interface AssetObjectMetadata {
  readonly byteSize: number;
  readonly contentSha256: string;
  readonly mediaType: AssetMediaType;
}

export interface AssetObject extends AssetObjectMetadata {
  readonly content: Buffer;
}

export interface AssetObjectStore {
  readonly configured: boolean;
  isReady(): Promise<boolean>;
  stat(identity: AssetObjectIdentity): Promise<AssetObjectMetadata | null>;
  put(
    identity: AssetObjectIdentity,
    metadata: AssetObjectMetadata & { readonly filename: string },
    content: Buffer,
  ): Promise<void>;
  get(identity: AssetObjectIdentity): Promise<AssetObject | null>;
  delete(identity: AssetObjectIdentity): Promise<void>;
}
