import type { Pool, PoolClient } from "pg";
import { createHash } from "node:crypto";

import type { EnabledDomainRuntime } from "../domain/domain-runtime";
import { REQUIRED_DATABASE_MIGRATION_HEAD } from "../config/production-admission";
import { PgOrganizationGateway } from "./pg-organization-gateway";

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
  rateLimitKeyPrefix: "simula:test:organizations",
  behavioralEngineUrl: "http://127.0.0.1:8010",
  behavioralEngineToken: "t".repeat(32),
};
const IDENTITY = Object.freeze({
  userId: "018f274b-3c77-7b22-b749-c9274230ef9a",
  issuer: CONFIG.supabaseIssuer,
  expiresAt: 1_800_000_000,
  sessionId: "018f274b-3c77-7b22-b749-c9274230ef9b",
});
const ORGANIZATION_ID = "018f274b-3c77-7b22-b749-c9274230ef9c";
const PROJECT_ID = "018f274b-3c77-7b22-b749-c9274230ef9d";
const RUN_ID = "018f274b-3c77-7b22-b749-c9274230ef9e";
const EVENT_ID = "018f274b-3c77-7b22-b749-c9274230ef9f";

function behavioralReport(): Record<string, unknown> {
  return {
    action_shares: [
      ["attend", 0.2],
      ["resonate", 0.2],
      ["question", 0.1],
      ["reject", 0.1],
      ["share", 0.1],
      ["discuss", 0.1],
      ["reconsider", 0.1],
      ["ignore", 0.1],
    ],
    mean_attention: 72,
    mean_resonance: 61,
    mean_trust: 58,
    scores: [
      {
        key: "attention",
        score_type: "heuristic",
        value: 72,
        unit: "synthetic_points",
        method: "weighted_synthetic_agent_mean",
        evidence_event_ids: [EVENT_ID],
      },
      {
        key: "resonance",
        score_type: "heuristic",
        value: 61,
        unit: "synthetic_points",
        method: "weighted_synthetic_agent_mean",
        evidence_event_ids: [EVENT_ID],
      },
      {
        key: "trust",
        score_type: "heuristic",
        value: 58,
        unit: "synthetic_points",
        method: "weighted_synthetic_agent_mean",
        evidence_event_ids: [EVENT_ID],
      },
    ],
    uncertainty: {
      uncertainty_type: "synthetic_agent_dispersion_not_population_uncertainty",
      effective_agent_count: 20,
      attention_weighted_standard_deviation: 5,
      resonance_weighted_standard_deviation: 6,
      trust_weighted_standard_deviation: 7,
      limitations: ["Synthetic dispersion only."],
    },
    findings: [
      {
        finding_id: "resonance_signal",
        output_type: "heuristic",
        title: "Synthetic resonance signal",
        detail: "Replayable synthetic evidence.",
        evidence_event_ids: [EVENT_ID],
      },
    ],
    synthesis: {
      output_type: "qualitative",
      claim_scope: "synthetic_agent_explanation",
      summary: "Synthetic explanation.",
      evidence_finding_ids: ["resonance_signal"],
      limitations: ["Not human testimony."],
    },
    validation_label: "experimental",
    limitations: ["Not observed human evidence."],
  };
}

function candidateBehavioralReport(): Record<string, unknown> {
  const report = structuredClone(behavioralReport());
  report.mean_attention = 74;
  (
    (report.scores as { key: string; value: number }[])[0] as {
      key: string;
      value: number;
    }
  ).value = 74;
  return report;
}

function contentSha256(content: string): string {
  return createHash("sha256")
    .update(JSON.stringify(content), "utf8")
    .digest("hex");
}

function contextGraph(): Record<string, unknown> {
  return {
    graph_id: PROJECT_ID,
    organization_id: ORGANIZATION_ID,
    version: 1,
    nodes: [
      {
        node_id: "a_stimulus",
        kind: "stimulus_fact",
        title: "Authored stimulus",
        content: "A bounded campaign message.",
        content_sha256: contentSha256("A bounded campaign message."),
        provenance: {
          source_id: "authored_stimulus",
          source_version: "1",
          owner: "SIMULA fixture",
          license: "authored",
          allowed_use: "Synthetic behavioral demo.",
          collected_at: "2026-07-29",
          transformation: "No transformation.",
          validation_status: "experimental",
        },
      },
      {
        node_id: "b_constraint",
        kind: "brand_constraint",
        title: "Brand constraint",
        content: "Avoid unsupported performance claims.",
        content_sha256: contentSha256("Avoid unsupported performance claims."),
        provenance: {
          source_id: "authored_constraint",
          source_version: "1",
          owner: "SIMULA fixture",
          license: "authored",
          allowed_use: "Synthetic behavioral demo.",
          collected_at: "2026-07-29",
          transformation: "No transformation.",
          validation_status: "experimental",
        },
      },
    ],
    edges: [
      {
        source_node_id: "a_stimulus",
        target_node_id: "b_constraint",
        relationship: "constrains",
        evidence_strength: 1,
      },
    ],
    checksum_sha256: "a".repeat(64),
    limitations: ["Synthetic context only."],
  };
}

function poolFor(query: jest.Mock): Pool {
  const client = {
    query,
    release: jest.fn(),
  } as unknown as PoolClient;
  return {
    connect: jest.fn().mockResolvedValue(client),
    end: jest.fn(),
  } as unknown as Pool;
}

describe("PgOrganizationGateway", () => {
  it("installs transaction-local claims and returns strict RLS rows", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "018f274b-3c77-7b22-b749-c9274230ef9c",
            name: "Example",
            role: "owner",
            status: "active",
            created_at: "2026-07-29T06:00:00.123456Z",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn();
    const client = { query, release } as unknown as PoolClient;
    const pool = {
      connect: jest.fn().mockResolvedValue(client),
      end: jest.fn(),
    } as unknown as Pool;
    const gateway = new PgOrganizationGateway(CONFIG, pool);

    await expect(
      gateway.listOrganizations(IDENTITY, null, 26),
    ).resolves.toEqual([
      {
        id: "018f274b-3c77-7b22-b749-c9274230ef9c",
        name: "Example",
        role: "owner",
        status: "active",
        created_at: "2026-07-29T06:00:00.123456Z",
      },
    ]);
    expect(query).toHaveBeenNthCalledWith(1, "begin");
    expect(query.mock.calls[1]?.[1]).toEqual([
      JSON.stringify({
        sub: IDENTITY.userId,
        role: "authenticated",
        iss: IDENTITY.issuer,
        aud: "authenticated",
        exp: IDENTITY.expiresAt,
      }),
      CONFIG.releaseSha,
    ]);
    expect(query.mock.calls[2]?.[0]).toContain("private.verified_subject()");
    expect(query.mock.calls[2]?.[1]).toEqual([26]);
    expect(query).toHaveBeenNthCalledWith(4, "commit");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("returns a strict durable organization-deletion manifest", async () => {
    const objectName = `${ORGANIZATION_ID}/${PROJECT_ID}/${RUN_ID}/${"a".repeat(64)}`;
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            payload: {
              request_id: EVENT_ID,
              organization_id: ORGANIZATION_ID,
              status: "pending",
              resource_manifest: {
                run_ids: [RUN_ID],
                storage_objects: [objectName],
              },
              requested_at: "2026-07-30T06:00:00.123456Z",
              completed_at: null,
              replayed: false,
            },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const gateway = new PgOrganizationGateway(CONFIG, poolFor(query));

    await expect(
      gateway.requestOrganizationDeletion(
        IDENTITY,
        ORGANIZATION_ID,
        "Example",
        "organization-delete-key-0001",
        "b".repeat(64),
        PROJECT_ID,
      ),
    ).resolves.toEqual({
      request_id: EVENT_ID,
      organization_id: ORGANIZATION_ID,
      status: "pending",
      storage_objects: [objectName],
      run_ids: [RUN_ID],
      requested_at: "2026-07-30T06:00:00.123456Z",
      completed_at: null,
      replayed: false,
    });
    expect(query).toHaveBeenNthCalledWith(3, expect.any(String), [
      ORGANIZATION_ID,
      "Example",
      "organization-delete-key-0001",
      "b".repeat(64),
      PROJECT_ID,
    ]);
    expect(query).toHaveBeenNthCalledWith(4, "commit");
  });

  it("fails closed on a cross-tenant deletion object path", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            payload: {
              request_id: EVENT_ID,
              organization_id: ORGANIZATION_ID,
              status: "pending",
              resource_manifest: {
                run_ids: [],
                storage_objects: [
                  `018f274b-3c77-7b22-b749-c9274230ef90/${"a".repeat(64)}`,
                ],
              },
              requested_at: "2026-07-30T06:00:00.123456Z",
              completed_at: null,
              replayed: false,
            },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const gateway = new PgOrganizationGateway(CONFIG, poolFor(query));

    await expect(
      gateway.requestOrganizationDeletion(
        IDENTITY,
        ORGANIZATION_ID,
        "Example",
        "organization-delete-key-0001",
        "b".repeat(64),
        PROJECT_ID,
      ),
    ).rejects.toMatchObject({ code: "internal_error", status: 500 });
    expect(query).toHaveBeenNthCalledWith(4, "rollback");
  });

  it("maps non-terminal run rejection to a safe conflict", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce({
        code: "55000",
        message: "organization_deletion_active_runs",
      })
      .mockResolvedValueOnce({ rows: [] });
    const gateway = new PgOrganizationGateway(CONFIG, poolFor(query));

    await expect(
      gateway.requestOrganizationDeletion(
        IDENTITY,
        ORGANIZATION_ID,
        "Example",
        "organization-delete-key-0001",
        "b".repeat(64),
        PROJECT_ID,
      ),
    ).rejects.toMatchObject({
      code: "version_conflict",
      status: 409,
      title: "Workspace has active runs",
    });
    expect(query).toHaveBeenNthCalledWith(4, "rollback");
  });

  it("returns the complete tenant-scoped dashboard projection", async () => {
    const generatedAt = "2026-07-29T06:05:00.123456Z";
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            payload: {
              organization_id: ORGANIZATION_ID,
              organization_name: "Example",
              organization_status: "active",
              role: "owner",
              platform_role: null,
              permissions: {
                can_create_projects: true,
                can_create_runs: true,
                can_manage_team: true,
                can_manage_settings: true,
                can_view_audit: true,
              },
              metrics: {
                projects: 1,
                audiences: 0,
                runs: 1,
                active_runs: 1,
                succeeded_runs: 0,
                failed_runs: 0,
                reports: 0,
                feedback_records: 0,
              },
              recent_projects: [
                {
                  id: PROJECT_ID,
                  name: "Campaign",
                  objective: "Test a bounded message.",
                  status: "active",
                  version: 1,
                  updated_at: generatedAt,
                },
              ],
              recent_runs: [
                {
                  id: RUN_ID,
                  project_id: PROJECT_ID,
                  project_name: "Campaign",
                  state: "queued",
                  created_at: generatedAt,
                },
              ],
              recent_reports: [],
              generated_at: generatedAt,
            },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const gateway = new PgOrganizationGateway(CONFIG, poolFor(query));

    await expect(
      gateway.getOrganizationDashboard(IDENTITY, ORGANIZATION_ID),
    ).resolves.toEqual({
      organization_id: ORGANIZATION_ID,
      organization_name: "Example",
      organization_status: "active",
      role: "owner",
      platform_role: null,
      permissions: {
        can_create_projects: true,
        can_create_runs: true,
        can_manage_team: true,
        can_manage_settings: true,
        can_view_audit: true,
      },
      metrics: {
        projects: 1,
        audiences: 0,
        runs: 1,
        active_runs: 1,
        succeeded_runs: 0,
        failed_runs: 0,
        reports: 0,
        feedback_records: 0,
      },
      recent_projects: [
        {
          id: PROJECT_ID,
          name: "Campaign",
          objective: "Test a bounded message.",
          status: "active",
          version: 1,
          updated_at: generatedAt,
        },
      ],
      recent_runs: [
        {
          id: RUN_ID,
          project_id: PROJECT_ID,
          project_name: "Campaign",
          state: "queued",
          created_at: generatedAt,
        },
      ],
      recent_reports: [],
      generated_at: generatedAt,
    });
    expect(query.mock.calls[2]?.[0]).toContain(
      "private.is_platform_superadmin",
    );
    expect(query.mock.calls[2]?.[1]).toEqual([ORGANIZATION_ID]);
    expect(query).toHaveBeenNthCalledWith(4, "commit");
  });

  it("fails readiness closed and closes the pool", async () => {
    const pool = {
      query: jest.fn().mockRejectedValue(new Error("secret host")),
      end: jest.fn().mockResolvedValue(undefined),
    } as unknown as Pool;
    const gateway = new PgOrganizationGateway(CONFIG, pool);

    await expect(gateway.isReady()).resolves.toBe(false);
    await gateway.onModuleDestroy();
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it("requires the exact schema head and forced RLS for readiness", async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            migration_version: REQUIRED_DATABASE_MIGRATION_HEAD,
            rls_force_enabled: true,
          },
        ],
      }),
      end: jest.fn(),
    } as unknown as Pool;
    const gateway = new PgOrganizationGateway(CONFIG, pool);

    await expect(gateway.isReady()).resolves.toBe(true);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("private.runtime_schema_readiness()"),
    );

    (pool.query as unknown as jest.Mock).mockResolvedValueOnce({
      rows: [
        {
          migration_version: "20260730220000",
          rls_force_enabled: true,
        },
      ],
    });
    await expect(gateway.isReady()).resolves.toBe(false);
  });

  it("records a sign-in audit under transaction-local identity claims", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ recorded: true }] })
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn();
    const client = { query, release } as unknown as PoolClient;
    const pool = {
      connect: jest.fn().mockResolvedValue(client),
      end: jest.fn(),
    } as unknown as Pool;
    const gateway = new PgOrganizationGateway(CONFIG, pool);
    const correlationId = "018f274b-3c77-7b22-b749-c9274230ef9d";

    await expect(
      gateway.recordSignInSuccess(IDENTITY, correlationId),
    ).resolves.toBe(true);
    expect(query.mock.calls[2]).toEqual([
      expect.stringContaining("api.record_sign_in_success"),
      [IDENTITY.sessionId, correlationId],
    ]);
    expect(query).toHaveBeenNthCalledWith(4, "commit");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("maps a project command only after a committed RLS transaction", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: PROJECT_ID,
            organization_id: ORGANIZATION_ID,
            name: "Campaign",
            objective: "Test message resonance",
            market: "philippines",
            language: "en",
            category: "campaign_message",
            status: "active",
            version: 1,
            created_at: "2026-07-29T06:00:00.123456Z",
            updated_at: "2026-07-29T06:00:00.123456Z",
            replayed: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const gateway = new PgOrganizationGateway(CONFIG, poolFor(query));

    await expect(
      gateway.createProject(
        IDENTITY,
        ORGANIZATION_ID,
        {
          name: "Campaign",
          objective: "Test message resonance",
          market: "philippines",
          language: "en",
          category: "campaign_message",
        },
        "project-key",
        "a".repeat(64),
        RUN_ID,
      ),
    ).resolves.toEqual({
      value: {
        id: PROJECT_ID,
        organization_id: ORGANIZATION_ID,
        name: "Campaign",
        objective: "Test message resonance",
        market: "philippines",
        language: "en",
        category: "campaign_message",
        status: "active",
        version: 1,
        created_at: "2026-07-29T06:00:00.123456Z",
        updated_at: "2026-07-29T06:00:00.123456Z",
      },
      replayed: false,
    });
    expect(query.mock.calls[2]?.[0]).toContain("api.create_project");
    expect(query).toHaveBeenNthCalledWith(4, "commit");
  });

  it("maps a schema-v2 run to its deterministic BullMQ job id", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: RUN_ID,
            organization_id: ORGANIZATION_ID,
            project_id: PROJECT_ID,
            stimulus_version_id: "018f274b-3c77-7b22-b749-c9274230ef91",
            audience_version_id: "018f274b-3c77-7b22-b749-c9274230ef92",
            state: "queued",
            schema_version: 2,
            dispatch_generation: 1,
            version: 1,
            created_at: "2026-07-29T06:00:00.123456Z",
            correlation_id: RUN_ID,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const gateway = new PgOrganizationGateway(CONFIG, poolFor(query));

    await expect(
      gateway.getSimulationRun(IDENTITY, RUN_ID),
    ).resolves.toMatchObject({
      id: RUN_ID,
      schema_version: 2,
      job_id: `run-${RUN_ID}-generation-1`,
    });
    expect(query).toHaveBeenNthCalledWith(4, "commit");
  });

  it("creates a behavioral demo through the dedicated database command", async () => {
    const stimulusVersionId = "018f274b-3c77-7b22-b749-c9274230ef91";
    const audienceVersionId = "018f274b-3c77-7b22-b749-c9274230ef92";
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            run_id: RUN_ID,
            organization_id: ORGANIZATION_ID,
            project_id: PROJECT_ID,
            stimulus_version_id: stimulusVersionId,
            audience_version_id: audienceVersionId,
            run_state: "queued",
            schema_version: 2,
            dispatch_generation: 1,
            job_id: `run-${RUN_ID}-generation-1`,
            run_version: 1,
            created_at: "2026-07-29T06:00:00.123456Z",
            replayed: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const gateway = new PgOrganizationGateway(CONFIG, poolFor(query));

    await expect(
      gateway.createBehavioralDemoRun(
        IDENTITY,
        PROJECT_ID,
        stimulusVersionId,
        "baseline",
        "behavioral-demo-0001",
        "b".repeat(64),
        RUN_ID,
        "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
      ),
    ).resolves.toMatchObject({
      replayed: false,
      value: {
        id: RUN_ID,
        schema_version: 2,
        job_id: `run-${RUN_ID}-generation-1`,
      },
    });
    expect(query.mock.calls[2]).toEqual([
      expect.stringContaining("api.create_behavioral_demo_run"),
      [
        PROJECT_ID,
        stimulusVersionId,
        "baseline",
        "behavioral-demo-0001",
        "b".repeat(64),
        RUN_ID,
        "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
      ],
    ]);
    expect(query).toHaveBeenNthCalledWith(4, "commit");
  });

  it("normalizes schema-v2 cancellation to the BullMQ job contract", async () => {
    const stimulusVersionId = "018f274b-3c77-7b22-b749-c9274230ef91";
    const audienceVersionId = "018f274b-3c77-7b22-b749-c9274230ef92";
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            run_id: RUN_ID,
            organization_id: ORGANIZATION_ID,
            project_id: PROJECT_ID,
            stimulus_version_id: stimulusVersionId,
            audience_version_id: audienceVersionId,
            run_state: "cancel_requested",
            schema_version: 2,
            dispatch_generation: 1,
            job_id: `run-${RUN_ID}-generation-1`,
            run_version: 2,
            created_at: "2026-07-29T06:00:00.123456Z",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const gateway = new PgOrganizationGateway(CONFIG, poolFor(query));

    await expect(
      gateway.requestSimulationRunCancel(IDENTITY, RUN_ID, PROJECT_ID),
    ).resolves.toMatchObject({
      id: RUN_ID,
      state: "cancel_requested",
      schema_version: 2,
      job_id: `run-${RUN_ID}-generation-1`,
    });
    expect(query.mock.calls[2]?.[0]).toContain(
      "when command.schema_version = 2",
    );
    expect(query).toHaveBeenNthCalledWith(4, "commit");
  });

  it("returns only the schema-validated behavioral report projection", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            run_id: RUN_ID,
            study_id: PROJECT_ID,
            variant_key: "baseline",
            schema_version: 1,
            methodology_version: "behavioral_demo_v1",
            validation_label: "experimental",
            provider_id: "deterministic_tiered",
            provider_version: "1",
            model_id: "deterministic_behavior_fixture_v1",
            template_id: "behavioral_action_v1",
            provider_calls: 40,
            input_tokens: "0",
            output_tokens: "0",
            cost_microusd: "0",
            context_graph_sha256: "a".repeat(64),
            agent_fleet_sha256: "b".repeat(64),
            input_sha256: "c".repeat(64),
            stimulus_sha256: "d".repeat(64),
            output_sha256: "e".repeat(64),
            artifact_sha256: "f".repeat(64),
            artifact_size_bytes: 4096,
            report: behavioralReport(),
            created_at: "2026-07-29T06:00:00.123456Z",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const gateway = new PgOrganizationGateway(CONFIG, poolFor(query));

    await expect(
      gateway.getBehavioralResult(IDENTITY, RUN_ID),
    ).resolves.toMatchObject({
      run_id: RUN_ID,
      study_id: PROJECT_ID,
      validation_label: "experimental",
      input_tokens: "0",
      artifact_size_bytes: 4096,
      report: {
        validation_label: "experimental",
        mean_attention: 72,
      },
    });
    expect(query.mock.calls[2]?.[0]).toContain(
      "from api.behavioral_run_results",
    );
    expect(query.mock.calls[2]?.[0]).not.toContain(
      "private.behavioral_result_payloads",
    );
    expect(query).toHaveBeenNthCalledWith(4, "commit");
  });

  it("returns governed context and bounded evidence without private rows", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            run_id: RUN_ID,
            organization_id: ORGANIZATION_ID,
            graph_id: PROJECT_ID,
            graph_version: 1,
            checksum_sha256: "a".repeat(64),
            node_count: 2,
            edge_count: 1,
            manifest: contextGraph(),
            limitations: ["Synthetic context only."],
            result_context_graph_sha256: "a".repeat(64),
            result_provider_calls: 40,
            result_report: behavioralReport(),
            created_at: "2026-07-29T06:00:00.123456Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            evidence_kind: "finding",
            evidence_key: "resonance_signal",
            output_type: "heuristic",
            event_count: 2,
            sample_event_ids: [
              EVENT_ID,
              "018f274b-3c77-7b22-b749-c9274230efa0",
            ],
          },
          {
            evidence_kind: "score",
            evidence_key: "attention",
            output_type: "heuristic",
            event_count: 1,
            sample_event_ids: [EVENT_ID],
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            agent_count: 20,
            llm_agent_count: 4,
            rule_agent_count: 16,
            cohort_count: 2,
            relationship_count: 20,
            synthetic_identity: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [1, 2].map((roundIndex) => ({
          round_index: roundIndex,
          event_count: 20,
          action_shares: behavioralReport().action_shares,
          mean_valence: 0.1,
          mean_attention: 72,
          mean_resonance: 61,
          mean_trust: 58,
          evidence_node_ids: ["a_stimulus", "b_constraint"],
          checksum_sha256: String(roundIndex).repeat(64),
        })),
      })
      .mockResolvedValueOnce({
        rows: Array.from({ length: 10 }, (_, index) => {
          const suffix = index.toString(16).padStart(2, "0");
          return {
            agent_id: `018f274b-3c77-7b22-b749-c9274230e1${suffix}`,
            tier: index < 2 ? "llm" : "rule",
            round_count: 2,
            latest_action: "attend",
            evidence_event_ids: [
              `018f274b-3c77-7b22-b749-c9274230e2${suffix}`,
              `018f274b-3c77-7b22-b749-c9274230e3${suffix}`,
            ],
          };
        }),
      })
      .mockResolvedValueOnce({ rows: [] });
    const gateway = new PgOrganizationGateway(CONFIG, poolFor(query));

    await expect(
      gateway.getBehavioralEvidence(IDENTITY, RUN_ID),
    ).resolves.toMatchObject({
      run_id: RUN_ID,
      context_graph: {
        graph_id: PROJECT_ID,
        organization_id: ORGANIZATION_ID,
        version: 1,
      },
      context_graph_created_at: "2026-07-29T06:00:00.123456Z",
      evidence_summary: [
        {
          evidence_kind: "finding",
          evidence_key: "resonance_signal",
          event_count: 2,
        },
        {
          evidence_kind: "score",
          evidence_key: "attention",
          event_count: 1,
        },
      ],
      fleet_summary: {
        agent_count: 20,
        llm_agent_count: 4,
        rule_agent_count: 16,
        synthetic_identity: true,
      },
      rounds: [
        {
          round_index: 1,
          event_count: 20,
        },
        {
          round_index: 2,
          event_count: 20,
        },
      ],
      synthetic_interviews: expect.arrayContaining([
        expect.objectContaining({
          interview_kind: "fixed_replay_summary",
          tier: "llm",
          latest_action: "attend",
        }),
      ]),
    });
    expect(query.mock.calls[2]?.[0]).toContain(
      "from api.context_graph_versions",
    );
    expect(query.mock.calls[3]?.[0]).toContain(
      "from api.behavioral_report_evidence",
    );
    expect(query.mock.calls[4]?.[0]).toContain(
      "from api.behavioral_fleet_summaries",
    );
    expect(query.mock.calls[5]?.[0]).toContain(
      "from api.behavioral_round_summaries",
    );
    expect(query.mock.calls[6]?.[0]).toContain(
      "from api.behavioral_agent_public_summaries",
    );
    for (const callIndex of [2, 3, 4, 5, 6]) {
      expect(query.mock.calls[callIndex]?.[0]).not.toContain("private.");
    }
    expect(query).toHaveBeenNthCalledWith(8, "commit");
  });

  it("returns bounded run state history without private identity or payload fields", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            event_id: EVENT_ID,
            previous_state: null,
            new_state: "queued",
            attempt_number: null,
            safe_reason: null,
            actor_type: "user",
            correlation_id: "018f274b-3c77-7b22-b749-c9274230efa1",
            created_at: "2026-07-29T06:00:00.123456Z",
          },
          {
            event_id: "018f274b-3c77-7b22-b749-c9274230efa2",
            previous_state: "queued",
            new_state: "running",
            attempt_number: 1,
            safe_reason: null,
            actor_type: "worker",
            correlation_id: "018f274b-3c77-7b22-b749-c9274230efa3",
            created_at: "2026-07-29T06:00:01.123456Z",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const gateway = new PgOrganizationGateway(CONFIG, poolFor(query));

    await expect(gateway.getRunAuditHistory(IDENTITY, RUN_ID)).resolves.toEqual(
      {
        run_id: RUN_ID,
        events: [
          {
            event_id: EVENT_ID,
            previous_state: null,
            new_state: "queued",
            attempt_number: null,
            safe_reason: null,
            actor_type: "user",
            correlation_id: "018f274b-3c77-7b22-b749-c9274230efa1",
            created_at: "2026-07-29T06:00:00.123456Z",
          },
          {
            event_id: "018f274b-3c77-7b22-b749-c9274230efa2",
            previous_state: "queued",
            new_state: "running",
            attempt_number: 1,
            safe_reason: null,
            actor_type: "worker",
            correlation_id: "018f274b-3c77-7b22-b749-c9274230efa3",
            created_at: "2026-07-29T06:00:01.123456Z",
          },
        ],
        disclosure:
          "Run state evidence only. Actor identities, payloads, prompts, agent memory, rationale, and free-form metadata are excluded.",
      },
    );
    expect(query.mock.calls[2]?.[0]).toContain(
      "from api.get_run_audit_history",
    );
    expect(query.mock.calls[2]?.[0]).not.toContain("actor_user_id");
    expect(query.mock.calls[2]?.[0]).not.toContain("metadata");
    expect(query.mock.calls[2]?.[1]).toEqual([RUN_ID, 50]);
    expect(query).toHaveBeenNthCalledWith(4, "commit");
  });

  it("returns only the explicit legacy provenance disclosure", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: RUN_ID,
            created_at: "2026-07-29T06:00:00.123456Z",
            terminal_at: null,
            result_created_at: null,
            frozen_manifest: {},
            frozen_manifest_sha256: "b".repeat(64),
            deterministic_seed: "42",
            receipt_version: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const gateway = new PgOrganizationGateway(CONFIG, poolFor(query));

    await expect(
      gateway.getSimulationProvenance(IDENTITY, RUN_ID),
    ).resolves.toMatchObject({
      availability: "legacy_unavailable",
      unavailable_reason: "frozen_provenance_not_captured",
      run_id: RUN_ID,
      frozen_manifest_sha256: "b".repeat(64),
      deterministic_seed: "42",
      stimulus: null,
      audience: null,
      execution: null,
      limits: null,
      provider_receipt: null,
    });
    expect(query).toHaveBeenNthCalledWith(4, "commit");
  });

  it("returns only matched synthetic deltas and never a winner", async () => {
    const baselineRunId = "018f274b-3c77-7b22-b749-c9274230ef80";
    const agentIds = Array.from({ length: 20 }, (_, index) => {
      const suffix = index.toString(16).padStart(2, "0");
      return `018f274b-3c77-7b22-b749-c9274230e1${suffix}`;
    });
    const resultRow = {
      organization_id: ORGANIZATION_ID,
      study_id: PROJECT_ID,
      methodology_version: "behavioral_demo_v1",
      provider_id: "deterministic_tiered",
      provider_version: "1",
      model_id: "deterministic_behavior_fixture_v1",
      template_id: "behavioral_action_v1",
      provider_calls: 40,
      context_graph_sha256: "a".repeat(64),
      agent_fleet_sha256: "b".repeat(64),
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            ...resultRow,
            run_id: baselineRunId,
            variant_key: "baseline",
            report: behavioralReport(),
          },
          {
            ...resultRow,
            run_id: RUN_ID,
            variant_key: "candidate",
            report: candidateBehavioralReport(),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { run_id: baselineRunId, agent_ids: agentIds },
          { run_id: RUN_ID, agent_ids: agentIds },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const gateway = new PgOrganizationGateway(CONFIG, poolFor(query));

    await expect(
      gateway.getBehavioralComparison(IDENTITY, baselineRunId, RUN_ID),
    ).resolves.toMatchObject({
      study_id: PROJECT_ID,
      baseline_run_id: baselineRunId,
      candidate_run_id: RUN_ID,
      paired_agents: 20,
      metric_deltas: [
        { key: "attention", candidate_minus_baseline: 2 },
        { key: "resonance", candidate_minus_baseline: 0 },
        { key: "trust", candidate_minus_baseline: 0 },
      ],
      interpretation: "experimental_matched_synthetic_difference",
      winner: null,
    });
    expect(query.mock.calls[2]?.[0]).toContain(
      "from api.behavioral_run_results",
    );
    expect(query.mock.calls[3]?.[0]).toContain(
      "from api.behavioral_agent_public_summaries",
    );
    expect(query.mock.calls[2]?.[0]).not.toContain("private.");
    expect(query.mock.calls[3]?.[0]).not.toContain("private.");
    expect(query).toHaveBeenNthCalledWith(5, "commit");
  });

  it("creates a bounded ordered variant group through the Phase 4 command", async () => {
    const firstStimulus = "018f274b-3c77-7b22-b749-c9274230ef91";
    const secondStimulus = "018f274b-3c77-7b22-b749-c9274230ef92";
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            payload: {
              variant_group_id: EVENT_ID,
              project_id: PROJECT_ID,
              name: "Message variants",
              members: [
                {
                  id: "018f274b-3c77-7b22-b749-c9274230ef93",
                  stimulus_version_id: firstStimulus,
                  variant_key: "baseline",
                  label: "Baseline",
                  sort_order: 1,
                },
                {
                  id: "018f274b-3c77-7b22-b749-c9274230ef94",
                  stimulus_version_id: secondStimulus,
                  variant_key: "candidate",
                  label: "Candidate",
                  sort_order: 2,
                },
              ],
              created_at: "2026-07-29T06:00:00.123456Z",
              replayed: false,
            },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const gateway = new PgOrganizationGateway(CONFIG, poolFor(query));

    await expect(
      gateway.createVariantGroup(
        IDENTITY,
        PROJECT_ID,
        {
          name: "Message variants",
          members: [
            {
              stimulus_version_id: firstStimulus,
              variant_key: "baseline",
              label: "Baseline",
            },
            {
              stimulus_version_id: secondStimulus,
              variant_key: "candidate",
              label: "Candidate",
            },
          ],
        },
        "variant-group-0001",
        "b".repeat(64),
        RUN_ID,
      ),
    ).resolves.toMatchObject({
      replayed: false,
      value: {
        variant_group_id: EVENT_ID,
        members: [
          { variant_key: "baseline", sort_order: 1 },
          { variant_key: "candidate", sort_order: 2 },
        ],
      },
    });
    expect(query.mock.calls[2]).toEqual([
      expect.stringContaining("api.create_variant_group"),
      [
        PROJECT_ID,
        "Message variants",
        JSON.stringify([
          {
            stimulus_version_id: firstStimulus,
            variant_key: "baseline",
            label: "Baseline",
            sort_order: 1,
          },
          {
            stimulus_version_id: secondStimulus,
            variant_key: "candidate",
            label: "Candidate",
            sort_order: 2,
          },
        ]),
        "variant-group-0001",
        "b".repeat(64),
        RUN_ID,
      ],
    ]);
  });

  it("returns a report only when its artifact identity is bound to the row", async () => {
    const reportId = "018f274b-3c77-7b22-b749-c9274230ef91";
    const artifact = {
      schema_version: "2.0.0",
      identity: { report_id: reportId, run_id: RUN_ID },
      content_sha256: "c".repeat(64),
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            report_id: reportId,
            run_id: RUN_ID,
            schema_version: "2.0.0",
            artifact,
            content_sha256: "d".repeat(64),
            created_at: "2026-07-29T06:00:00.123456Z",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const gateway = new PgOrganizationGateway(CONFIG, poolFor(query));

    await expect(gateway.getRunReport(IDENTITY, RUN_ID)).resolves.toEqual({
      report_id: reportId,
      run_id: RUN_ID,
      schema_version: "2.0.0",
      artifact,
      content_sha256: "d".repeat(64),
      created_at: "2026-07-29T06:00:00.123456Z",
    });
  });

  it("binds a private stimulus-asset reservation to its immutable object path", async () => {
    const assetId = "018f274b-3c77-7b22-b749-c9274230ef91";
    const stimulusId = "018f274b-3c77-7b22-b749-c9274230ef92";
    const checksum = "f".repeat(64);
    const payload = {
      asset_id: assetId,
      organization_id: ORGANIZATION_ID,
      stimulus_id: stimulusId,
      storage_bucket_id: "simula-private-assets",
      storage_object_name: `${ORGANIZATION_ID}/${stimulusId}/${assetId}/${checksum}`,
      filename: "concept.png",
      media_type: "image/png",
      expected_byte_size: 4096,
      expected_content_sha256: checksum,
      byte_size: null,
      content_sha256: null,
      status: "pending_upload",
      retention_until: "2026-08-15T00:00:00.000000Z",
      created_at: "2026-07-29T06:00:00.123456Z",
      replayed: false,
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ payload }] })
      .mockResolvedValueOnce({ rows: [] });
    const gateway = new PgOrganizationGateway(CONFIG, poolFor(query));

    await expect(
      gateway.createStimulusAsset(
        IDENTITY,
        stimulusId,
        {
          filename: "concept.png",
          media_type: "image/png",
          byte_size: 4096,
          content_sha256: checksum,
          retention_until: "2026-08-15T00:00:00.000000Z",
        },
        "stimulus-asset-0001",
        "a".repeat(64),
        RUN_ID,
      ),
    ).resolves.toEqual({ value: payload, replayed: false });
    expect(query.mock.calls[2]).toEqual([
      expect.stringContaining("api.create_stimulus_asset"),
      [
        stimulusId,
        "concept.png",
        "image/png",
        4096,
        checksum,
        "2026-08-15T00:00:00.000000Z",
        "stimulus-asset-0001",
        "a".repeat(64),
        RUN_ID,
      ],
    ]);
  });

  it("fails closed when asset metadata points outside its bound object path", async () => {
    const assetId = "018f274b-3c77-7b22-b749-c9274230ef91";
    const stimulusId = "018f274b-3c77-7b22-b749-c9274230ef92";
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            asset_id: assetId,
            organization_id: ORGANIZATION_ID,
            stimulus_id: stimulusId,
            storage_bucket_id: "simula-private-assets",
            storage_object_name: "attacker/object",
            filename: "concept.png",
            media_type: "image/png",
            expected_byte_size: 4096,
            expected_content_sha256: "f".repeat(64),
            byte_size: null,
            content_sha256: null,
            status: "pending_upload",
            retention_until: "2026-08-15T00:00:00.000000Z",
            created_at: "2026-07-29T06:00:00.123456Z",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const gateway = new PgOrganizationGateway(CONFIG, poolFor(query));

    await expect(
      gateway.getStimulusAsset(IDENTITY, assetId),
    ).rejects.toMatchObject({ code: "internal_error", status: 500 });
    expect(query).toHaveBeenNthCalledWith(4, "rollback");
  });

  it("fails closed when stored export bytes do not match their checksum", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            format: "json",
            filename: "simula-baseline.json",
            content: Buffer.from("tampered", "utf8"),
            content_sha256: "e".repeat(64),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const gateway = new PgOrganizationGateway(CONFIG, poolFor(query));

    await expect(
      gateway.getReportExport(IDENTITY, EVENT_ID),
    ).rejects.toMatchObject({
      code: "internal_error",
      status: 500,
    });
    expect(query).toHaveBeenNthCalledWith(4, "rollback");
  });
});
