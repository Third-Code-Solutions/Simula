import { createRoot } from "react-dom/client";

import {
  type StimulusAssetClient,
  StimulusAssetsPanel,
} from "../../../../apps/web/src/app/projects/[projectId]/stimulus-assets-panel";
import "../../../../apps/web/src/app/globals.css";

type Asset = Awaited<ReturnType<StimulusAssetClient["listAssets"]>>[number];
type VisualProfile = Awaited<
  ReturnType<StimulusAssetClient["createVisualProfile"]>
>;

declare global {
  interface Window {
    __simulaAssetFixtureEvents: string[];
  }
}

const STIMULUS_ID = "018f274b-3c77-7b22-b749-c9274230efa6";
const ORGANIZATION_ID = "018f274b-3c77-7b22-b749-c9274230efa5";
const events: string[] = [];
const contentByAsset = new Map<string, ArrayBuffer>();
const profilesByAsset = new Map<string, VisualProfile>();
let assets: Asset[] = [];
window.__simulaAssetFixtureEvents = events;

function hex(bytes: ArrayBuffer): Promise<string> {
  return crypto.subtle
    .digest("SHA-256", bytes)
    .then((digest) =>
      Array.from(new Uint8Array(digest), (value) =>
        value.toString(16).padStart(2, "0"),
      ).join(""),
    );
}

function replace(next: Asset): Asset {
  assets = assets.some((asset) => asset.asset_id === next.asset_id)
    ? assets.map((asset) => (asset.asset_id === next.asset_id ? next : asset))
    : [next, ...assets];
  return next;
}

const client: StimulusAssetClient = {
  async createVisualProfile(asset, idempotencyKey) {
    if (!idempotencyKey || asset.content_sha256 === null) {
      throw new Error("visual profile identity missing");
    }
    events.push("profile");
    const analysisId = crypto.randomUUID();
    const keys = [
      "alpha_coverage",
      "blue_mean",
      "edge_density",
      "green_mean",
      "luminance_contrast",
      "luminance_entropy",
      "luminance_mean",
      "red_mean",
      "saturation_mean",
    ] as const;
    const profile: VisualProfile = {
      analysis_id: analysisId,
      asset_content_sha256: asset.content_sha256,
      asset_id: asset.asset_id,
      created_at: new Date().toISOString(),
      organization_id: asset.organization_id,
      profile: {
        analysis_id: analysisId,
        analysis_scope: "technical_image_signals_only",
        asset: {
          asset_id: asset.asset_id,
          byte_size: asset.byte_size!,
          content_sha256: asset.content_sha256,
          media_type: "image/png",
          organization_id: asset.organization_id,
          stimulus_id: asset.stimulus_id,
        },
        behavioral_interpretation: false,
        checksum_sha256: "b".repeat(64),
        dimensions: {
          aspect_ratio: 1,
          height_px: 1,
          orientation: "square",
          pixel_count: 1,
          width_px: 1,
        },
        limitations: [
          "Measures technical image signals only; it does not identify objects, text, brand meaning, emotion, persuasion, or aesthetic quality.",
          "It is not observed human evidence or evidence of campaign performance.",
        ],
        methodology_version: "technical_image_signals_v1",
        population_inference: false,
        provider: {
          analysis_kind: "image_signal_profile",
          model_id: "pillow-12.3.0",
          provider_id: "simula_technical_image_signals",
          provider_version: "1.0.0",
          template_id: "technical_image_signals_v1",
        },
        retained_embedded_metadata: false,
        sampling: {
          algorithm: "exif_transpose_lanczos_rgba_v1",
          sample_height_px: 1,
          sampled_pixel_count: 1,
          sample_width_px: 1,
        },
        schema_version: "1.0.0",
        signals: keys.map((key) => ({
          key,
          kind:
            key === "edge_density" || key === "luminance_entropy"
              ? "heuristic_technical_signal"
              : "measured_technical_signal",
          method: "fixture technical signal",
          unit: "normalized_0_1",
          value: 0.5,
        })),
        validation_label: "experimental",
      },
      profile_checksum_sha256: "b".repeat(64),
      replayed: false,
      stimulus_id: asset.stimulus_id,
    };
    profilesByAsset.set(asset.asset_id, profile);
    return profile;
  },
  async deleteAsset(asset, idempotencyKey) {
    if (!idempotencyKey) throw new Error("deletion key required");
    events.push("delete");
    contentByAsset.delete(asset.asset_id);
    profilesByAsset.delete(asset.asset_id);
    return replace({ ...asset, status: "deleted" });
  },
  async downloadAsset(asset) {
    events.push("download");
    const bytes = contentByAsset.get(asset.asset_id);
    if (!bytes) throw new Error("fixture object missing");
    if ((await hex(bytes)) !== asset.expected_content_sha256) {
      throw new Error("fixture checksum mismatch");
    }
    return {
      blob: new Blob([bytes], { type: asset.media_type }),
      filename: asset.filename,
    };
  },
  async listAssets(stimulusId) {
    if (stimulusId !== STIMULUS_ID) throw new Error("stimulus mismatch");
    events.push("list");
    return assets;
  },
  async getVisualProfile(asset) {
    events.push("load-profile");
    const profile = profilesByAsset.get(asset.asset_id);
    if (!profile) throw new Error("fixture profile missing");
    return profile;
  },
  async reserveAsset(stimulusId, input, idempotencyKey) {
    if (stimulusId !== STIMULUS_ID || !idempotencyKey) {
      throw new Error("reservation identity missing");
    }
    events.push("reserve");
    return replace({
      asset_id: crypto.randomUUID(),
      byte_size: null,
      content_sha256: null,
      created_at: new Date().toISOString(),
      expected_byte_size: input.byte_size,
      expected_content_sha256: input.content_sha256,
      filename: input.filename,
      media_type: input.media_type,
      organization_id: ORGANIZATION_ID,
      replayed: false,
      retention_until: input.retention_until,
      status: "pending_upload",
      stimulus_id: STIMULUS_ID,
    });
  },
  async uploadAsset(asset, bytes, idempotencyKey) {
    if (!idempotencyKey || bytes.byteLength !== asset.expected_byte_size) {
      throw new Error("upload envelope mismatch");
    }
    if ((await hex(bytes)) !== asset.expected_content_sha256) {
      throw new Error("upload checksum mismatch");
    }
    events.push("upload");
    contentByAsset.set(asset.asset_id, bytes.slice(0));
    return replace({
      ...asset,
      byte_size: bytes.byteLength,
      content_sha256: asset.expected_content_sha256,
      status: "available",
    });
  },
};

createRoot(document.getElementById("root")!).render(
  <main id="main-content" style={{ margin: "2rem auto", maxWidth: "52rem" }}>
    <h1 style={{ fontSize: "2.5rem" }}>Project workspace</h1>
    <section aria-labelledby="fixture-stimuli" style={{ marginTop: "2rem" }}>
      <h2 id="fixture-stimuli">Text stimuli</h2>
      <article className="panel stimulus-card">
        <h3>Launch concept</h3>
        <StimulusAssetsPanel
          canMutate
          client={client}
          stimulusId={STIMULUS_ID}
          stimulusName="Launch concept"
          visualProfileEnabled
        />
      </article>
    </section>
  </main>,
);
