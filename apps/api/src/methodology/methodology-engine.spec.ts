import { createHash } from "node:crypto";

import { REQUIRED_DATABASE_MIGRATION_HEAD } from "../config/production-admission";
import type { EnabledDomainRuntime } from "../domain/domain-runtime";
import type {
  MethodologyPreviewCommand,
  ReportExportRenderCommand,
  VariantComparisonCommand,
} from "../organizations/organization-gateway.port";
import { PrivateMethodologyEngine } from "./methodology-engine";

const CONFIG: EnabledDomainRuntime = {
  enabled: true,
  environment: "test",
  releaseSha: "a".repeat(40),
  migrationHead: REQUIRED_DATABASE_MIGRATION_HEAD,
  databaseUrl: "postgresql://simula_api:password@127.0.0.1:54322/postgres",
  databaseCaPem: null,
  supabaseIssuer: "http://127.0.0.1:54321/auth/v1",
  supabaseJwksUrl: "http://127.0.0.1:54321/auth/v1/.well-known/jwks.json",
  supabasePublishableKey: "sb_publishable_test",
  cursorSecret: "0123456789abcdef0123456789abcdef",
  redisConnection: {
    db: 14,
    enableOfflineQueue: false,
    host: "127.0.0.1",
    maxRetriesPerRequest: 1,
    port: 6379,
  },
  rateLimitKeyPrefix: "simula:test:methodology",
  behavioralEngineUrl: "http://127.0.0.1:8010",
  behavioralEngineToken: "t".repeat(32),
};
const RUN_ID = "018f274b-3c77-7b22-b749-c9274230ef9a";
const REPORT_ID = "018f274b-3c77-7b22-b749-c9274230ef9b";
const PROJECT_ID = "018f274b-3c77-7b22-b749-c9274230ef9c";
const STIMULUS_ID = "018f274b-3c77-7b22-b749-c9274230ef9d";
const COMMAND: MethodologyPreviewCommand = {
  run_id: RUN_ID,
  stimulus: "A fictional campaign message.",
  population: {},
  audience: {},
  configuration: {},
  methodology_version: "phase3_cohort_v1",
  cost_ceiling_microusd: 0,
  report: {
    report_id: REPORT_ID,
    project_id: PROJECT_ID,
    stimulus_version_id: STIMULUS_ID,
    variant_key: "baseline",
    variant_label: "Baseline",
    created_at: "2026-07-29T06:00:00.123456Z",
  },
};
const CANDIDATE_REPORT_ID = "018f274b-3c77-7b22-b749-c9274230ef9e";
const COMPARISON_COMMAND: VariantComparisonCommand = {
  reports: [
    {
      variant_key: "baseline",
      artifact: { identity: { report_id: REPORT_ID } },
    },
    {
      variant_key: "candidate",
      artifact: { identity: { report_id: CANDIDATE_REPORT_ID } },
    },
  ],
};
const EXPORT_COMMAND: ReportExportRenderCommand = {
  report: {
    schema_version: "2.0.0",
    identity: { report_id: REPORT_ID },
  },
  format: "json",
};

function result(runId = RUN_ID): Record<string, unknown> {
  return {
    methodology_result: {
      schema_version: 2,
      run_id: runId,
      validation_label: "experimental",
    },
    report: {
      schema_version: "2.0.0",
      identity: {
        report_id: REPORT_ID,
        run_id: runId,
        project_id: PROJECT_ID,
        stimulus_version_id: STIMULUS_ID,
      },
      transparency: {
        validation_label: "experimental",
        numerical_output_kind: "heuristic_score",
      },
    },
    replayed: false,
  };
}

describe("PrivateMethodologyEngine", () => {
  it("authenticates, bounds, and binds the private result", async () => {
    const fetcher = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(result()), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    const engine = new PrivateMethodologyEngine(CONFIG, fetcher);

    await expect(engine.execute(COMMAND)).resolves.toEqual(result());
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:8010/internal/v1/methodology-previews:execute",
      expect.objectContaining({
        method: "POST",
        redirect: "manual",
      }),
    );
    const headers = fetcher.mock.calls[0]?.[1]?.headers as HeadersInit;
    expect(headers).toMatchObject({
      Authorization: `Bearer ${"t".repeat(32)}`,
      "Content-Type": "application/json",
    });
  });

  it("fails closed on a result bound to another run", async () => {
    const fetcher = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify(result("018f274b-3c77-7b22-b749-c9274230ef9e")),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );
    const engine = new PrivateMethodologyEngine(CONFIG, fetcher);

    await expect(engine.execute(COMMAND)).rejects.toMatchObject({
      code: "dependency_unavailable",
      status: 503,
    });
  });

  it("binds every compatible comparison to its requested report pair", async () => {
    const response = {
      items: [
        {
          baseline_variant_key: "baseline",
          candidate_variant_key: "candidate",
          comparison: {
            schema_version: "1.0.0",
            baseline_report_id: REPORT_ID,
            candidate_report_id: CANDIDATE_REPORT_ID,
            compatibility: "compatible",
          },
        },
      ],
    };
    const fetcher = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(response), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    const engine = new PrivateMethodologyEngine(CONFIG, fetcher);

    await expect(engine.compare(COMPARISON_COMMAND)).resolves.toEqual(
      response.items,
    );
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:8010/internal/v1/methodology-reports:compare",
      expect.objectContaining({ method: "POST", redirect: "manual" }),
    );
  });

  it("rejects a comparison bound to another candidate report", async () => {
    const fetcher = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              baseline_variant_key: "baseline",
              candidate_variant_key: "candidate",
              comparison: {
                schema_version: "1.0.0",
                baseline_report_id: REPORT_ID,
                candidate_report_id: RUN_ID,
                compatibility: "compatible",
              },
            },
          ],
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );
    const engine = new PrivateMethodologyEngine(CONFIG, fetcher);

    await expect(engine.compare(COMPARISON_COMMAND)).rejects.toMatchObject({
      code: "dependency_unavailable",
      status: 503,
    });
  });

  it("decodes only a canonical export whose bytes match the declared hash", async () => {
    const content = Buffer.from('{"schema_version":"2.0.0"}\n', "utf8");
    const response = {
      format: "json",
      media_type: "application/json",
      filename: "simula-baseline.json",
      content_base64: content.toString("base64"),
      content_sha256: createHash("sha256").update(content).digest("hex"),
    };
    const fetcher = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(response), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    const engine = new PrivateMethodologyEngine(CONFIG, fetcher);

    await expect(engine.renderExport(EXPORT_COMMAND)).resolves.toEqual({
      format: "json",
      media_type: "application/json",
      filename: "simula-baseline.json",
      content,
      content_sha256: response.content_sha256,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:8010/internal/v1/report-exports:render",
      expect.objectContaining({ method: "POST", redirect: "manual" }),
    );
  });

  it("rejects export bytes whose hash is not bound to the response", async () => {
    const content = Buffer.from("unsafe", "utf8");
    const fetcher = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          format: "json",
          media_type: "application/json",
          filename: "simula-baseline.json",
          content_base64: content.toString("base64"),
          content_sha256: "f".repeat(64),
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );
    const engine = new PrivateMethodologyEngine(CONFIG, fetcher);

    await expect(engine.renderExport(EXPORT_COMMAND)).rejects.toMatchObject({
      code: "dependency_unavailable",
      status: 503,
    });
  });
});
