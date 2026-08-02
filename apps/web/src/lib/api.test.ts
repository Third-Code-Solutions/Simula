import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const getSession = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  getBrowserSupabaseClient: () => ({
    auth: { getSession },
  }),
}));

import {
  appendStimulusVersion,
  createBehavioralDemoRun,
  createOrganization,
  createStimulusVisualProfile,
  deleteStimulusAsset,
  downloadReportExport,
  downloadStimulusAsset,
  getBehavioralComparison,
  getMethodologyRegistry,
  getOrganizationDashboard,
  getRunAuditHistory,
  getStimulusVisualProfile,
  listOrganizations,
  listStimulusAssets,
  reserveStimulusAsset,
  revokeReportShare,
  uploadStimulusAsset,
} from "./api";
import {
  BEHAVIORAL_BASELINE_RUN_ID,
  BEHAVIORAL_PROJECT_ID,
  BEHAVIORAL_RUN_ID,
  behavioralComparisonFixture,
} from "@/test/behavioral-fixtures";

const STIMULUS_ID = "018f274b-3c77-7b22-b749-c9274230efa6";
const ASSET_ID = "018f274b-3c77-7b22-b749-c9274230efa4";
const ASSET_ORGANIZATION_ID = "018f274b-3c77-7b22-b749-c9274230efa5";

function stimulusAsset(
  status: "pending_upload" | "available" | "deletion_requested" | "deleted",
  content: Uint8Array,
) {
  const checksum = createHash("sha256").update(content).digest("hex");
  return {
    asset_id: ASSET_ID,
    byte_size: status === "pending_upload" ? null : content.byteLength,
    content_sha256: status === "pending_upload" ? null : checksum,
    created_at: "2026-07-29T10:00:00.000Z",
    expected_byte_size: content.byteLength,
    expected_content_sha256: checksum,
    filename: "campaign-concept.png",
    media_type: "image/png" as const,
    organization_id: ASSET_ORGANIZATION_ID,
    replayed: false,
    retention_until: "2099-08-28T10:00:00.000Z",
    status,
    stimulus_id: STIMULUS_ID,
  };
}

function visualProfileResponse(content: Uint8Array) {
  const available = stimulusAsset("available", content);
  const analysisId = "018f274b-3c77-5b22-b749-c9274230efa7";
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
  const profile = {
    schema_version: "1.0.0",
    analysis_id: analysisId,
    asset: {
      asset_id: ASSET_ID,
      organization_id: ASSET_ORGANIZATION_ID,
      stimulus_id: STIMULUS_ID,
      media_type: "image/png",
      byte_size: content.byteLength,
      content_sha256: available.content_sha256,
    },
    provider: {
      provider_id: "simula_technical_image_signals",
      provider_version: "1.0.0",
      model_id: "pillow-12.3.0",
      template_id: "technical_image_signals_v1",
      analysis_kind: "image_signal_profile",
    },
    methodology_version: "technical_image_signals_v1",
    analysis_scope: "technical_image_signals_only",
    validation_label: "experimental",
    dimensions: {
      width_px: 4,
      height_px: 2,
      pixel_count: 8,
      aspect_ratio: 2,
      orientation: "landscape",
    },
    sampling: {
      algorithm: "exif_transpose_lanczos_rgba_v1",
      sample_width_px: 4,
      sample_height_px: 2,
      sampled_pixel_count: 8,
    },
    signals: signals.map((key) => ({
      key,
      value: 0.5,
      unit: "normalized_0_1",
      kind:
        key === "edge_density" || key === "luminance_entropy"
          ? "heuristic_technical_signal"
          : "measured_technical_signal",
      method: "bounded fixture",
    })),
    behavioral_interpretation: false,
    population_inference: false,
    retained_embedded_metadata: false,
    limitations: [
      "Measures technical image signals only; it does not identify objects, text, brand meaning, emotion, persuasion, or aesthetic quality.",
      "It is not observed human evidence or evidence of campaign performance.",
    ],
    checksum_sha256: "b".repeat(64),
  };
  return {
    data: {
      analysis_id: analysisId,
      asset_content_sha256: available.content_sha256,
      asset_id: ASSET_ID,
      created_at: "2026-07-30T01:00:00.000Z",
      organization_id: ASSET_ORGANIZATION_ID,
      profile,
      profile_checksum_sha256: profile.checksum_sha256,
      replayed: false,
      stimulus_id: STIMULUS_ID,
    },
  };
}

describe("SIMULA domain API client", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SIMULA_API_URL = "http://127.0.0.1:8000";
    delete process.env.NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION;
    getSession.mockReset();
    getSession.mockResolvedValue({
      data: { session: { access_token: "local-user-token" } },
      error: null,
    });
    vi.stubGlobal("fetch", vi.fn());
  });

  it("uses the user bearer token and an idempotency key for a domain command", async () => {
    const responseBody = {
      created_at: "2026-07-17T00:00:00Z",
      id: "00000000-0000-4000-8000-000000000001",
      name: "Northstar",
      role: "owner",
      status: "active",
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        headers: { "content-type": "application/json" },
        status: 201,
      }),
    );

    await expect(createOrganization("Northstar")).resolves.toEqual(
      responseBody,
    );

    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/organizations",
      expect.objectContaining({
        method: "POST",
        headers: expect.any(Headers),
      }),
    );
    const request = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    const headers = request.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer local-user-token");
    expect(headers.get("idempotency-key")).toMatch(/^.{16,128}$/);
    expect(headers.get("content-type")).toBe("application/json");
    expect(request.body).toBe(JSON.stringify({ name: "Northstar" }));
  });

  it("renders safe RFC 9457 details and correlation for a denied request", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "forbidden",
          correlation_id: "00000000-0000-4000-8000-000000000999",
          detail: "You do not have permission to mutate this organization.",
          instance: "/api/v1/organizations",
          status: 403,
          title: "Forbidden",
          type: "https://simula.local/problems/forbidden",
        }),
        {
          headers: { "content-type": "application/problem+json" },
          status: 403,
        },
      ),
    );

    await expect(listOrganizations()).rejects.toMatchObject({
      code: "forbidden",
      correlationId: "00000000-0000-4000-8000-000000000999",
      message: "You do not have permission to mutate this organization.",
      status: 403,
    });
  });

  it("preserves a bounded Retry-After delay for rate-limited guidance", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "rate_limited",
          detail: "Too many requests.",
          status: 429,
          title: "Rate limited",
        }),
        {
          headers: {
            "content-type": "application/problem+json",
            "retry-after": "17",
          },
          status: 429,
        },
      ),
    );

    await expect(listOrganizations()).rejects.toMatchObject({
      code: "rate_limited",
      message: "Too many requests. Retry after 17 seconds.",
      retryAfterSeconds: 17,
      status: 429,
    });
  });

  it("fails closed when the Auth session is absent", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(listOrganizations()).rejects.toMatchObject({
      code: "unauthenticated",
      status: 401,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("moves only the parity-reviewed domain surface to v2 behind one rollback flag", async () => {
    process.env.NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION = "v2";
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [], next_cursor: null }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await listOrganizations();

    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v2/organizations",
      expect.any(Object),
    );
  });

  it("moves the methodology registry to v2 behind the same rollback flag", async () => {
    process.env.NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION = "v2";
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          methodologies: [],
          population_frames: [],
          providers: [],
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await getMethodologyRegistry();

    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v2/methodology/registry",
      expect.any(Object),
    );
  });

  it("moves the organization dashboard to v2 behind the same rollback flag", async () => {
    process.env.NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION = "v2";
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          generated_at: "2026-07-29T06:05:00.123456Z",
          metrics: {
            active_runs: 1,
            audiences: 0,
            failed_runs: 0,
            feedback_records: 0,
            projects: 1,
            reports: 0,
            runs: 1,
            succeeded_runs: 0,
          },
          organization_id: ASSET_ORGANIZATION_ID,
          organization_name: "Example",
          organization_status: "active",
          permissions: {
            can_create_projects: true,
            can_create_runs: true,
            can_manage_settings: true,
            can_manage_team: true,
            can_view_audit: true,
          },
          platform_role: null,
          recent_projects: [],
          recent_reports: [],
          recent_runs: [],
          role: "owner",
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await getOrganizationDashboard(ASSET_ORGANIZATION_ID);

    expect(fetch).toHaveBeenCalledWith(
      `http://127.0.0.1:8000/api/v2/organizations/${ASSET_ORGANIZATION_ID}/dashboard`,
      expect.any(Object),
    );
  });

  it("downloads only a bounded export with a safe server filename", async () => {
    const content = '{"schema_version":"2.0.0"}\n';
    vi.mocked(fetch).mockResolvedValue(
      new Response(content, {
        headers: {
          "content-disposition": 'attachment; filename="simula-baseline.json"',
          "content-length": String(new TextEncoder().encode(content).length),
          "content-type": "application/json",
          etag: `"${createHash("sha256").update(content).digest("hex")}"`,
        },
        status: 200,
      }),
    );

    const downloaded = await downloadReportExport(
      "018f274b-3c77-7b22-b749-c9274230efa4",
    );

    expect(downloaded.filename).toBe("simula-baseline.json");
    await expect(downloaded.blob.text()).resolves.toBe(content);
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/exports/018f274b-3c77-7b22-b749-c9274230efa4",
      expect.objectContaining({ cache: "no-store", method: "GET" }),
    );
  });

  it("rejects an export with an unsafe attachment filename", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("unsafe", {
        headers: {
          "content-disposition": 'attachment; filename="../unsafe.csv"',
          "content-length": "6",
          "content-type": "text/csv; charset=utf-8",
          etag: `"${"a".repeat(64)}"`,
        },
        status: 200,
      }),
    );

    await expect(
      downloadReportExport("018f274b-3c77-7b22-b749-c9274230efa4"),
    ).rejects.toMatchObject({
      code: "invalid_api_response",
      status: 502,
    });
  });

  it("rejects export bytes that do not match the server ETag", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("tampered", {
        headers: {
          "content-disposition": 'attachment; filename="simula-report.csv"',
          "content-length": "8",
          "content-type": "text/csv; charset=utf-8",
          etag: `"${"b".repeat(64)}"`,
        },
        status: 200,
      }),
    );

    await expect(
      downloadReportExport("018f274b-3c77-7b22-b749-c9274230efa4"),
    ).rejects.toMatchObject({
      code: "invalid_api_response",
      status: 502,
    });
  });

  it("rejects an unknown domain migration version before network access", async () => {
    process.env.NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION = "latest";

    expect(() => listOrganizations()).toThrow(
      expect.objectContaining({
        code: "api_unconfigured",
        status: 503,
      }),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("creates behavioral runs only through the explicit v2 admission route", async () => {
    const responseBody = {
      id: BEHAVIORAL_RUN_ID,
      organization_id: "018f274b-3c77-7b22-b749-c9274230ef93",
      project_id: BEHAVIORAL_PROJECT_ID,
      stimulus_version_id: "018f274b-3c77-7b22-b749-c9274230ef94",
      audience_version_id: "018f274b-3c77-7b22-b749-c9274230ef95",
      state: "queued",
      schema_version: 2,
      dispatch_generation: 1,
      job_id: `run-${BEHAVIORAL_RUN_ID}-generation-1`,
      version: 1,
      created_at: "2026-07-29T06:00:00.123456Z",
      failure: null,
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        headers: { "content-type": "application/json" },
        status: 202,
      }),
    );

    await expect(
      createBehavioralDemoRun(
        BEHAVIORAL_PROJECT_ID,
        responseBody.stimulus_version_id,
        "refined_copy",
        "behavioral-demo-idempotency-0001",
      ),
    ).resolves.toEqual(responseBody);

    const [url, request] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe(
      `http://127.0.0.1:8000/api/v2/projects/${BEHAVIORAL_PROJECT_ID}/behavioral-demo-runs`,
    );
    expect(request?.method).toBe("POST");
    expect(request?.body).toBe(
      JSON.stringify({
        stimulus_version_id: responseBody.stimulus_version_id,
        variant_key: "refined_copy",
      }),
    );
    expect((request?.headers as Headers).get("idempotency-key")).toBe(
      "behavioral-demo-idempotency-0001",
    );
  });

  it("reuses the caller refinement key for an immutable stimulus version", async () => {
    const stimulusId = "018f274b-3c77-7b22-b749-c9274230ef96";
    const responseBody = {
      id: "018f274b-3c77-7b22-b749-c9274230ef97",
      organization_id: "018f274b-3c77-7b22-b749-c9274230ef93",
      stimulus_id: stimulusId,
      version: 2,
      content: "Refined message.",
      content_sha256: "a".repeat(64),
      created_at: "2026-07-29T06:00:00.123456Z",
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        headers: { "content-type": "application/json" },
        status: 201,
      }),
    );

    await expect(
      appendStimulusVersion(
        stimulusId,
        responseBody.content,
        "stimulus-refinement-idempotency-0001",
      ),
    ).resolves.toEqual(responseBody);

    const [url, request] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe(
      `http://127.0.0.1:8000/api/v1/stimuli/${stimulusId}/versions`,
    );
    expect(request?.body).toBe(
      JSON.stringify({ content: responseBody.content }),
    );
    expect((request?.headers as Headers).get("idempotency-key")).toBe(
      "stimulus-refinement-idempotency-0001",
    );
  });

  it("loads only the strict v2 run audit history contract", async () => {
    const responseBody = {
      run_id: BEHAVIORAL_RUN_ID,
      events: [
        {
          event_id: "018f274b-3c77-7b22-b749-c9274230efa2",
          previous_state: null,
          new_state: "queued",
          attempt_number: null,
          safe_reason: null,
          actor_type: "user",
          correlation_id: "018f274b-3c77-7b22-b749-c9274230efa3",
          created_at: "2026-07-29T06:00:00.123456Z",
        },
      ],
      disclosure:
        "Run state evidence only. Actor identities, payloads, prompts, agent memory, rationale, and free-form metadata are excluded.",
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await expect(getRunAuditHistory(BEHAVIORAL_RUN_ID)).resolves.toEqual(
      responseBody,
    );
    expect(fetch).toHaveBeenCalledWith(
      `http://127.0.0.1:8000/api/v2/runs/${BEHAVIORAL_RUN_ID}/audit-history`,
      expect.any(Object),
    );
  });

  it("loads a comparison through the explicit matched v2 route", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(behavioralComparisonFixture()), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await expect(
      getBehavioralComparison(
        BEHAVIORAL_RUN_ID,
        BEHAVIORAL_BASELINE_RUN_ID,
        BEHAVIORAL_PROJECT_ID,
      ),
    ).resolves.toMatchObject({
      baseline_run_id: BEHAVIORAL_BASELINE_RUN_ID,
      candidate_run_id: BEHAVIORAL_RUN_ID,
      winner: null,
    });
    expect(fetch).toHaveBeenCalledWith(
      `http://127.0.0.1:8000/api/v2/runs/${BEHAVIORAL_RUN_ID}/behavioral-comparison?baseline_run_id=${BEHAVIORAL_BASELINE_RUN_ID}`,
      expect.any(Object),
    );
  });

  it("revokes a report share through an authenticated idempotent command", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: { replayed: false } }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await revokeReportShare("00000000-0000-4000-8000-000000000123");

    const [url, request] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe(
      "http://127.0.0.1:8000/api/v1/report-shares/00000000-0000-4000-8000-000000000123",
    );
    expect(request?.method).toBe("DELETE");
    expect((request?.headers as Headers).get("idempotency-key")).toMatch(
      /^.{16,128}$/,
    );
  });

  it("lists and reserves assets only through the explicit v2 contract", async () => {
    const content = new TextEncoder().encode("safe");
    const pending = stimulusAsset("pending_upload", content);
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [pending] }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: pending }), {
          headers: { "content-type": "application/json" },
          status: 201,
        }),
      );

    await expect(listStimulusAssets(STIMULUS_ID)).resolves.toEqual([pending]);
    await expect(
      reserveStimulusAsset(
        STIMULUS_ID,
        {
          byte_size: content.byteLength,
          content_sha256: pending.expected_content_sha256,
          filename: pending.filename,
          media_type: pending.media_type,
          retention_until: pending.retention_until,
        },
        "reserve-asset-operation",
      ),
    ).resolves.toEqual(pending);

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      `http://127.0.0.1:8000/api/v2/stimuli/${STIMULUS_ID}/assets`,
    );
    const reserveRequest = vi.mocked(fetch).mock.calls[1]?.[1] as RequestInit;
    expect((reserveRequest.headers as Headers).get("idempotency-key")).toBe(
      "reserve-asset-operation",
    );
  });

  it("uploads exact reserved bytes and parses the verified lifecycle", async () => {
    const content = new TextEncoder().encode("safe");
    const pending = stimulusAsset("pending_upload", content);
    const available = stimulusAsset("available", content);
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: available }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await expect(
      uploadStimulusAsset(
        pending,
        content.buffer as ArrayBuffer,
        "upload-asset-operation",
      ),
    ).resolves.toEqual(available);

    const [url, request] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe(
      `http://127.0.0.1:8000/api/v2/stimulus-assets/${ASSET_ID}/content`,
    );
    expect(request?.method).toBe("PUT");
    expect(request?.body).toBe(content.buffer);
    expect((request?.headers as Headers).get("content-type")).toBe("image/png");
    expect((request?.headers as Headers).get("idempotency-key")).toBe(
      "upload-asset-operation",
    );
  });

  it("downloads a private asset only after header and byte verification", async () => {
    const content = new TextEncoder().encode("safe");
    const available = stimulusAsset("available", content);
    vi.mocked(fetch).mockResolvedValue(
      new Response(content, {
        headers: {
          "cache-control": "private, no-store",
          "content-disposition": 'inline; filename="campaign-concept.png"',
          "content-length": String(content.byteLength),
          "content-security-policy": "sandbox",
          "content-type": "image/png",
          etag: `"${available.expected_content_sha256}"`,
          "x-content-type-options": "nosniff",
        },
        status: 200,
      }),
    );

    const downloaded = await downloadStimulusAsset(available);

    expect(downloaded.filename).toBe("campaign-concept.png");
    await expect(downloaded.blob.text()).resolves.toBe("safe");
  });

  it("rejects private asset bytes with a mismatched integrity header", async () => {
    const content = new TextEncoder().encode("safe");
    const available = stimulusAsset("available", content);
    vi.mocked(fetch).mockResolvedValue(
      new Response(content, {
        headers: {
          "cache-control": "private, no-store",
          "content-disposition": 'inline; filename="campaign-concept.png"',
          "content-length": String(content.byteLength),
          "content-security-policy": "sandbox",
          "content-type": "image/png",
          etag: `"${"b".repeat(64)}"`,
          "x-content-type-options": "nosniff",
        },
        status: 200,
      }),
    );

    await expect(downloadStimulusAsset(available)).rejects.toMatchObject({
      code: "invalid_api_response",
      status: 502,
    });
  });

  it("deletes through an explicit idempotent v2 command", async () => {
    const content = new TextEncoder().encode("safe");
    const available = stimulusAsset("available", content);
    const deleted = stimulusAsset("deleted", content);
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: deleted }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await expect(
      deleteStimulusAsset(available, "delete-asset-operation"),
    ).resolves.toEqual(deleted);

    const [url, request] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe(
      `http://127.0.0.1:8000/api/v2/stimulus-assets/${ASSET_ID}/deletion`,
    );
    expect(request?.method).toBe("POST");
    expect(request?.body).toBe("{}");
    expect((request?.headers as Headers).get("idempotency-key")).toBe(
      "delete-asset-operation",
    );
  });

  it("creates and reloads only a bound technical visual profile", async () => {
    const content = new TextEncoder().encode("safe");
    const available = stimulusAsset("available", content);
    const response = visualProfileResponse(content);
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(response), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(response), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );

    await expect(
      createStimulusVisualProfile(available, "visual-profile-operation"),
    ).resolves.toMatchObject({
      asset_id: ASSET_ID,
      profile: {
        analysis_scope: "technical_image_signals_only",
        behavioral_interpretation: false,
      },
    });
    await expect(getStimulusVisualProfile(available)).resolves.toMatchObject({
      asset_id: ASSET_ID,
    });

    const [createUrl, createRequest] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(createUrl).toBe(
      `http://127.0.0.1:8000/api/v2/stimulus-assets/${ASSET_ID}/visual-profile`,
    );
    expect(createRequest?.method).toBe("POST");
    expect(createRequest?.body).toBe(
      '{"methodology_version":"technical_image_signals_v1"}',
    );
    expect((createRequest?.headers as Headers).get("idempotency-key")).toBe(
      "visual-profile-operation",
    );
    expect(vi.mocked(fetch).mock.calls[1]?.[1]?.method).toBe("GET");
  });
});
