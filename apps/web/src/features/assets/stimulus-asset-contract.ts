import type { ControlPlaneComponents } from "@simula/contracts";

type ControlPlaneSchemas = ControlPlaneComponents["schemas"];

export type StimulusAsset = ControlPlaneSchemas["StimulusAssetResponseDto"];
export type StimulusAssetMediaType = StimulusAsset["media_type"];
export type StimulusAssetReserveInput =
  ControlPlaneSchemas["StimulusAssetReserveDto"];

export const STIMULUS_ASSET_MAX_BYTES = 16 * 1024 * 1024;
export const STIMULUS_ASSET_MEDIA_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
] as const satisfies readonly StimulusAssetMediaType[];

const ASSET_KEYS = new Set([
  "asset_id",
  "organization_id",
  "stimulus_id",
  "filename",
  "media_type",
  "expected_byte_size",
  "expected_content_sha256",
  "byte_size",
  "content_sha256",
  "status",
  "retention_until",
  "created_at",
  "replayed",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_FILENAME_PATTERN = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9_. -]{0,119}$/;
const STATUSES = new Set<StimulusAsset["status"]>([
  "pending_upload",
  "available",
  "deletion_requested",
  "deleted",
]);
const MEDIA_TYPES = new Set<string>(STIMULUS_ASSET_MEDIA_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validDateTime(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validOptionalSize(value: unknown): value is number | null {
  return (
    value === null ||
    (Number.isSafeInteger(value) &&
      Number(value) >= 1 &&
      Number(value) <= STIMULUS_ASSET_MAX_BYTES)
  );
}

export function parseStimulusAsset(value: unknown): StimulusAsset {
  if (!isRecord(value)) {
    throw new Error("stimulus asset must be an object");
  }
  if (
    Object.keys(value).length !== ASSET_KEYS.size ||
    Object.keys(value).some((key) => !ASSET_KEYS.has(key)) ||
    typeof value.asset_id !== "string" ||
    !UUID_PATTERN.test(value.asset_id) ||
    typeof value.organization_id !== "string" ||
    !UUID_PATTERN.test(value.organization_id) ||
    typeof value.stimulus_id !== "string" ||
    !UUID_PATTERN.test(value.stimulus_id) ||
    typeof value.filename !== "string" ||
    !SAFE_FILENAME_PATTERN.test(value.filename) ||
    typeof value.media_type !== "string" ||
    !MEDIA_TYPES.has(value.media_type) ||
    !Number.isSafeInteger(value.expected_byte_size) ||
    Number(value.expected_byte_size) < 1 ||
    Number(value.expected_byte_size) > STIMULUS_ASSET_MAX_BYTES ||
    typeof value.expected_content_sha256 !== "string" ||
    !SHA256_PATTERN.test(value.expected_content_sha256) ||
    !validOptionalSize(value.byte_size) ||
    !(
      value.content_sha256 === null ||
      (typeof value.content_sha256 === "string" &&
        SHA256_PATTERN.test(value.content_sha256))
    ) ||
    typeof value.status !== "string" ||
    !STATUSES.has(value.status as StimulusAsset["status"]) ||
    !validDateTime(value.retention_until) ||
    !validDateTime(value.created_at) ||
    typeof value.replayed !== "boolean"
  ) {
    throw new Error("stimulus asset violates its public contract");
  }
  if (
    (value.byte_size === null) !== (value.content_sha256 === null) ||
    (value.byte_size !== null &&
      (value.byte_size !== value.expected_byte_size ||
        value.content_sha256 !== value.expected_content_sha256)) ||
    (value.status === "available" && value.byte_size === null) ||
    (value.status === "pending_upload" && value.byte_size !== null)
  ) {
    throw new Error("stimulus asset lifecycle is inconsistent");
  }

  return Object.freeze({
    asset_id: value.asset_id,
    byte_size: value.byte_size,
    content_sha256: value.content_sha256,
    created_at: value.created_at,
    expected_byte_size: value.expected_byte_size as number,
    expected_content_sha256: value.expected_content_sha256,
    filename: value.filename,
    media_type: value.media_type as StimulusAssetMediaType,
    organization_id: value.organization_id,
    replayed: value.replayed,
    retention_until: value.retention_until,
    status: value.status as StimulusAsset["status"],
    stimulus_id: value.stimulus_id,
  });
}

export function parseStimulusAssetCommand(value: unknown): StimulusAsset {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    !("data" in value)
  ) {
    throw new Error("stimulus asset command response is invalid");
  }
  return parseStimulusAsset(value.data);
}

export function parseStimulusAssetCollection(
  value: unknown,
): readonly StimulusAsset[] {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    !Array.isArray(value.items)
  ) {
    throw new Error("stimulus asset collection response is invalid");
  }
  return Object.freeze(value.items.map(parseStimulusAsset));
}
