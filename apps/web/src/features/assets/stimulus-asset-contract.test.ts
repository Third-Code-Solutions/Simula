import { describe, expect, it } from "vitest";

import {
  parseStimulusAsset,
  parseStimulusAssetCollection,
} from "./stimulus-asset-contract";

const ASSET = {
  asset_id: "018f274b-3c77-7b22-b749-c9274230efa4",
  byte_size: 4,
  content_sha256: "a".repeat(64),
  created_at: "2026-07-29T10:00:00.000Z",
  expected_byte_size: 4,
  expected_content_sha256: "a".repeat(64),
  filename: "campaign-concept.png",
  media_type: "image/png",
  organization_id: "018f274b-3c77-7b22-b749-c9274230efa5",
  replayed: false,
  retention_until: "2026-08-28T10:00:00.000Z",
  status: "available",
  stimulus_id: "018f274b-3c77-7b22-b749-c9274230efa6",
} as const;

describe("stimulus asset public contract", () => {
  it("accepts an exact generated-contract lifecycle projection", () => {
    expect(parseStimulusAssetCollection({ items: [ASSET] })).toEqual([ASSET]);
  });

  it("rejects private storage coordinates", () => {
    expect(() =>
      parseStimulusAsset({
        ...ASSET,
        storage_object_name: "private/path",
      }),
    ).toThrow(/contract/i);
  });

  it("rejects available bytes that do not match the reservation", () => {
    expect(() =>
      parseStimulusAsset({
        ...ASSET,
        content_sha256: "b".repeat(64),
      }),
    ).toThrow(/lifecycle/i);
  });
});
