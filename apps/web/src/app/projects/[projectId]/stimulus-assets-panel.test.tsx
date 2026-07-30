import { createHash } from "node:crypto";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    createStimulusVisualProfile: vi.fn(),
    deleteStimulusAsset: vi.fn(),
    downloadStimulusAsset: vi.fn(),
    getStimulusVisualProfile: vi.fn(),
    listStimulusAssets: vi.fn(),
    reserveStimulusAsset: vi.fn(),
    uploadStimulusAsset: vi.fn(),
  };
});

import {
  ApiProblem,
  createStimulusVisualProfile,
  deleteStimulusAsset,
  downloadStimulusAsset,
  getStimulusVisualProfile,
  listStimulusAssets,
  reserveStimulusAsset,
  uploadStimulusAsset,
} from "@/lib/api";

import { StimulusAssetsPanel } from "./stimulus-assets-panel";

const STIMULUS_ID = "018f274b-3c77-7b22-b749-c9274230efa6";
const ASSET_ID = "018f274b-3c77-7b22-b749-c9274230efa4";
const ORGANIZATION_ID = "018f274b-3c77-7b22-b749-c9274230efa5";
const CONTENT = new TextEncoder().encode("safe");
const CHECKSUM = createHash("sha256").update(CONTENT).digest("hex");

function asset(status: "pending_upload" | "available" | "deleted") {
  return {
    asset_id: ASSET_ID,
    byte_size: status === "pending_upload" ? null : CONTENT.byteLength,
    content_sha256: status === "pending_upload" ? null : CHECKSUM,
    created_at: "2026-07-29T10:00:00.000Z",
    expected_byte_size: CONTENT.byteLength,
    expected_content_sha256: CHECKSUM,
    filename: "campaign-concept.png",
    media_type: "image/png" as const,
    organization_id: ORGANIZATION_ID,
    replayed: false,
    retention_until: "2099-08-28T10:00:00.000Z",
    status,
    stimulus_id: STIMULUS_ID,
  };
}

function uploadFile(): File {
  const file = new File([CONTENT], "campaign-concept.png", {
    type: "image/png",
  });
  Object.defineProperty(file, "arrayBuffer", {
    configurable: true,
    value: async () => CONTENT.buffer,
  });
  return file;
}

function visualProfile() {
  const signals = [
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
  const analysisId = "018f274b-3c77-5b22-b749-c9274230efa7";
  const profile = {
    schema_version: "1.0.0" as const,
    analysis_id: analysisId,
    asset: {
      asset_id: ASSET_ID,
      organization_id: ORGANIZATION_ID,
      stimulus_id: STIMULUS_ID,
      media_type: "image/png" as const,
      byte_size: CONTENT.byteLength,
      content_sha256: CHECKSUM,
    },
    provider: {
      provider_id: "simula_technical_image_signals" as const,
      provider_version: "1.0.0" as const,
      model_id: "pillow-12.3.0" as const,
      template_id: "technical_image_signals_v1" as const,
      analysis_kind: "image_signal_profile" as const,
    },
    methodology_version: "technical_image_signals_v1" as const,
    analysis_scope: "technical_image_signals_only" as const,
    validation_label: "experimental" as const,
    dimensions: {
      width_px: 4,
      height_px: 2,
      pixel_count: 8,
      aspect_ratio: 2,
      orientation: "landscape" as const,
    },
    sampling: {
      algorithm: "exif_transpose_lanczos_rgba_v1" as const,
      sample_width_px: 4,
      sample_height_px: 2,
      sampled_pixel_count: 8,
    },
    signals: signals.map((key) => ({
      key,
      value: 0.5,
      unit: "normalized_0_1" as const,
      kind:
        key === "edge_density" || key === "luminance_entropy"
          ? ("heuristic_technical_signal" as const)
          : ("measured_technical_signal" as const),
      method: "bounded fixture",
    })),
    behavioral_interpretation: false as const,
    population_inference: false as const,
    retained_embedded_metadata: false as const,
    limitations: [
      "Measures technical image signals only; it does not identify objects, text, brand meaning, emotion, persuasion, or aesthetic quality.",
      "It is not observed human evidence or evidence of campaign performance.",
    ],
    checksum_sha256: "b".repeat(64),
  };
  return {
    analysis_id: analysisId,
    asset_content_sha256: CHECKSUM,
    asset_id: ASSET_ID,
    created_at: "2026-07-30T01:00:00.000Z",
    organization_id: ORGANIZATION_ID,
    profile,
    profile_checksum_sha256: profile.checksum_sha256,
    replayed: false,
    stimulus_id: STIMULUS_ID,
  };
}

describe("StimulusAssetsPanel", () => {
  beforeEach(() => {
    vi.mocked(listStimulusAssets).mockReset();
    vi.mocked(createStimulusVisualProfile).mockReset();
    vi.mocked(reserveStimulusAsset).mockReset();
    vi.mocked(uploadStimulusAsset).mockReset();
    vi.mocked(downloadStimulusAsset).mockReset();
    vi.mocked(deleteStimulusAsset).mockReset();
    vi.mocked(getStimulusVisualProfile).mockReset();
    vi.mocked(listStimulusAssets).mockResolvedValue([]);
    vi.mocked(reserveStimulusAsset).mockResolvedValue(asset("pending_upload"));
    vi.mocked(uploadStimulusAsset).mockResolvedValue(asset("available"));
    vi.mocked(downloadStimulusAsset).mockResolvedValue({
      blob: new Blob([CONTENT], { type: "image/png" }),
      filename: "campaign-concept.png",
    });
    vi.mocked(deleteStimulusAsset).mockResolvedValue(asset("deleted"));
    vi.mocked(createStimulusVisualProfile).mockResolvedValue(visualProfile());
    vi.mocked(getStimulusVisualProfile).mockResolvedValue(visualProfile());
    let sequence = 0;
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => `asset-operation-${++sequence}`),
      subtle: {
        digest: vi.fn(async (_algorithm: string, bytes: ArrayBuffer) => {
          const digest = createHash("sha256")
            .update(new Uint8Array(bytes))
            .digest();
          return Uint8Array.from(digest).buffer;
        }),
      },
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:private-asset"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("reserves, hashes, uploads, and labels a file without analysis claims", async () => {
    const user = userEvent.setup();
    render(
      <StimulusAssetsPanel
        canMutate
        stimulusId={STIMULUS_ID}
        stimulusName="Launch concept"
      />,
    );

    expect(
      screen.getByText(/has not analyzed, interpreted, or scored/i),
    ).toBeInTheDocument();
    const input = await screen.findByLabelText("Attach file to Launch concept");
    await user.upload(input, uploadFile());
    expect((input as HTMLInputElement).files).toHaveLength(1);
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(reserveStimulusAsset).toHaveBeenCalledWith(
        STIMULUS_ID,
        expect.objectContaining({
          byte_size: CONTENT.byteLength,
          content_sha256: CHECKSUM,
          filename: "campaign-concept.png",
          media_type: "image/png",
        }),
        "asset-operation-1",
      );
      expect(uploadStimulusAsset).toHaveBeenCalledWith(
        expect.objectContaining({ status: "pending_upload" }),
        CONTENT.buffer,
        "asset-operation-2",
      );
    });
    expect(await screen.findByText("Available")).toBeInTheDocument();
    expect(screen.getByText(/verified and available/i)).toBeInTheDocument();
  });

  it("reuses reservation and upload idempotency after an ambiguous failure", async () => {
    const user = userEvent.setup();
    vi.mocked(uploadStimulusAsset)
      .mockRejectedValueOnce(
        new ApiProblem(503, "api_unavailable", "Temporary interruption."),
      )
      .mockResolvedValueOnce(asset("available"));
    render(
      <StimulusAssetsPanel
        canMutate
        stimulusId={STIMULUS_ID}
        stimulusName="Launch concept"
      />,
    );
    const input = await screen.findByLabelText("Attach file to Launch concept");
    const file = uploadFile();
    await user.upload(input, file);
    expect((input as HTMLInputElement).files).toHaveLength(1);
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Temporary interruption.",
    );

    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(uploadStimulusAsset).toHaveBeenCalledTimes(2);
    });
    expect(reserveStimulusAsset).toHaveBeenCalledTimes(1);
    expect(vi.mocked(uploadStimulusAsset).mock.calls[0]?.[2]).toBe(
      vi.mocked(uploadStimulusAsset).mock.calls[1]?.[2],
    );
  });

  it("verifies an image before preview and requires deletion confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(listStimulusAssets).mockResolvedValue([asset("available")]);
    render(
      <StimulusAssetsPanel
        canMutate
        stimulusId={STIMULUS_ID}
        stimulusName="Launch concept"
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: "Verify and preview" }),
    );
    expect(
      await screen.findByRole("img", {
        name: "Private preview of campaign-concept.png",
      }),
    ).toHaveAttribute("src", "blob:private-asset");
    expect(downloadStimulusAsset).toHaveBeenCalledWith(
      expect.objectContaining({ asset_id: ASSET_ID }),
    );

    await user.click(screen.getByRole("button", { name: "Delete file" }));
    expect(deleteStimulusAsset).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm deletion" }));

    await waitFor(() => {
      expect(deleteStimulusAsset).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:private-asset");
    });
    expect(await screen.findByText("Deleted")).toBeInTheDocument();
  });

  it("keeps viewer access read-only while allowing verified preview", async () => {
    vi.mocked(listStimulusAssets).mockResolvedValue([asset("available")]);
    render(
      <StimulusAssetsPanel
        canMutate={false}
        stimulusId={STIMULUS_ID}
        stimulusName="Launch concept"
      />,
    );

    expect(
      await screen.findByRole("button", { name: "Verify and preview" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Attach file to Launch concept"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete file" }),
    ).not.toBeInTheDocument();
  });

  it("creates and labels a technical image profile without behavioral claims", async () => {
    const user = userEvent.setup();
    vi.mocked(listStimulusAssets).mockResolvedValue([asset("available")]);
    render(
      <StimulusAssetsPanel
        canMutate
        stimulusId={STIMULUS_ID}
        stimulusName="Launch concept"
        visualProfileEnabled
      />,
    );

    expect(
      await screen.findByText(/performs no OCR, object recognition/i),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Profile technical signals" }),
    );

    await waitFor(() => {
      expect(createStimulusVisualProfile).toHaveBeenCalledWith(
        expect.objectContaining({ asset_id: ASSET_ID }),
        "asset-operation-1",
      );
    });
    expect(
      await screen.findByRole("heading", { name: /image signals · 4×2/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("50.0%")).toHaveLength(9);
    expect(
      screen.getByText(/No objects, text, meaning, emotion, persuasion/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not observed human evidence/i),
    ).toBeInTheDocument();
  });
});
