import { createHash, randomBytes, randomUUID } from "node:crypto";

import { Pool } from "pg";

import type { EnabledDomainRuntime } from "../../src/domain/domain-runtime";
import type { VerifiedIdentity } from "../../src/auth/identity";
import { canonicalRequestSha256 } from "../../src/http/request-contract";
import {
  createDomainPool,
  PgOrganizationGateway,
} from "../../src/organizations/pg-organization-gateway";
import type { VisualStimulusProfile } from "../../src/organizations/organization-gateway.port";

const OWNER_A = "00000000-0000-4000-8000-000000000001";
const OWNER_B = "00000000-0000-4000-8000-000000000003";
const SESSION_ID = "00000000-0000-4000-8000-000000000011";

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function identity(userId: string): VerifiedIdentity {
  return {
    userId,
    issuer: "http://127.0.0.1:54321/auth/v1",
    expiresAt: Math.floor(Date.now() / 1000) + 300,
    sessionId: SESSION_ID,
  };
}

function visualProfile(input: {
  analysisId: string;
  assetId: string;
  assetSha256: string;
  byteSize: number;
  organizationId: string;
  stimulusId: string;
}): VisualStimulusProfile {
  const signalKeys = [
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
  const payload: Omit<VisualStimulusProfile, "checksum_sha256"> = {
    schema_version: "1.0.0",
    analysis_id: input.analysisId,
    asset: {
      asset_id: input.assetId,
      organization_id: input.organizationId,
      stimulus_id: input.stimulusId,
      media_type: "image/png",
      byte_size: input.byteSize,
      content_sha256: input.assetSha256,
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
      width_px: 1,
      height_px: 2,
      pixel_count: 2,
      aspect_ratio: 0.5,
      orientation: "portrait",
    },
    sampling: {
      algorithm: "exif_transpose_lanczos_rgba_v1",
      sample_width_px: 1,
      sample_height_px: 2,
      sampled_pixel_count: 2,
    },
    signals: signalKeys.map((key) => ({
      key,
      value: 0.5,
      unit: "normalized_0_1" as const,
      kind:
        key === "edge_density" || key === "luminance_entropy"
          ? ("heuristic_technical_signal" as const)
          : ("measured_technical_signal" as const),
      method: "bounded database integration fixture",
    })),
    behavioral_interpretation: false,
    population_inference: false,
    retained_embedded_metadata: false,
    limitations: [
      "Measures technical image signals only; it does not identify objects, text, brand meaning, emotion, persuasion, or aesthetic quality.",
      "It is not observed human evidence or evidence of campaign performance.",
    ] as const,
  };
  return {
    ...payload,
    checksum_sha256: canonicalRequestSha256(payload),
  };
}

describe("PgOrganizationGateway disposable PostgreSQL integration", () => {
  const adminDatabaseUrl = process.env.SIMULA_TEST_ADMIN_DATABASE_URL;
  if (adminDatabaseUrl === undefined || adminDatabaseUrl === "") {
    throw new Error(
      "SIMULA_TEST_ADMIN_DATABASE_URL is required for this explicit local integration.",
    );
  }

  const admin = new Pool({
    connectionString: adminDatabaseUrl,
    connectionTimeoutMillis: 2_000,
    max: 1,
  });
  const organizationId = randomUUID();
  const auditCorrelationId = randomUUID();
  const apiPassword = randomBytes(24).toString("hex");
  let originalPassword: string | null = null;
  let passwordChanged = false;
  let fixtureCreated = false;
  let gateway: PgOrganizationGateway | null = null;
  let apiPool: Pool | null = null;

  beforeAll(async () => {
    const catalog = await admin.query<{
      migrated: string | null;
      owner_a: boolean;
      owner_b: boolean;
      role_password: string | null;
    }>(`
      select
        pg_catalog.to_regprocedure(
          'private.verified_subject()'
        )::text as migrated,
        exists(
          select 1 from auth.users where id = '${OWNER_A}'::uuid
        ) as owner_a,
        exists(
          select 1 from auth.users where id = '${OWNER_B}'::uuid
        ) as owner_b,
        (
          select rolpassword
          from pg_catalog.pg_authid
          where rolname = 'simula_api'
        ) as role_password
    `);
    const row = catalog.rows[0];
    if (
      row?.migrated === null ||
      row?.owner_a !== true ||
      row.owner_b !== true
    ) {
      throw new Error(
        "Local PostgreSQL is not the reset SIMULA fixture database.",
      );
    }
    originalPassword = row.role_password;
    await admin.query(
      `alter role simula_api password ${sqlLiteral(apiPassword)}`,
    );
    passwordChanged = true;
    await admin.query(
      `
      insert into api.organizations (id, name, created_by)
      values ($1::uuid, 'NestJS RLS integration fixture', $2::uuid)
      `,
      [organizationId, OWNER_A],
    );
    fixtureCreated = true;
    await admin.query(
      `
      insert into api.organization_memberships
        (organization_id, user_id, role, created_by)
      values ($1::uuid, $2::uuid, 'owner', $2::uuid)
      `,
      [organizationId, OWNER_A],
    );

    const apiUrl = new URL(adminDatabaseUrl);
    apiUrl.username = "simula_api";
    apiUrl.password = apiPassword;
    const config: EnabledDomainRuntime = {
      enabled: true,
      environment: "test",
      releaseSha: "a".repeat(40),
      databaseUrl: apiUrl.toString(),
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
      rateLimitKeyPrefix: `simula:test:database:${organizationId}`,
      behavioralEngineUrl: "http://127.0.0.1:8010",
      behavioralEngineToken: "t".repeat(32),
    };
    apiPool = createDomainPool(config);
    gateway = new PgOrganizationGateway(config, apiPool);
  });

  afterAll(async () => {
    if (gateway !== null) {
      await gateway.onModuleDestroy();
    }
    if (fixtureCreated) {
      await admin.query(
        `
        delete from private.audit_events
        where correlation_id = $1::uuid
          and action = 'auth.sign_in'
        `,
        [auditCorrelationId],
      );
      await admin.query("delete from api.organizations where id = $1::uuid", [
        organizationId,
      ]);
    }
    if (passwordChanged) {
      if (originalPassword === null) {
        await admin.query("alter role simula_api password null");
      } else {
        await admin.query(
          `alter role simula_api password ${sqlLiteral(originalPassword)}`,
        );
      }
    }
    await admin.end();
  });

  it("returns the owner row and denies it to another tenant subject", async () => {
    if (gateway === null) {
      throw new Error("gateway setup did not complete");
    }
    const ownerA = identity(OWNER_A);
    const ownerB = identity(OWNER_B);

    const visible = await gateway.listOrganizations(ownerA, null, 100);
    expect(visible).toContainEqual(
      expect.objectContaining({
        id: organizationId,
        name: "NestJS RLS integration fixture",
        role: "owner",
        status: "active",
      }),
    );
    await expect(
      gateway.listOrganizations(ownerB, null, 100),
    ).resolves.not.toContainEqual(
      expect.objectContaining({ id: organizationId }),
    );
  });

  it("records and deduplicates the sign-in audit command", async () => {
    if (gateway === null) {
      throw new Error("gateway setup did not complete");
    }
    const ownerA = identity(OWNER_A);

    await expect(
      gateway.recordSignInSuccess(ownerA, auditCorrelationId),
    ).resolves.toBe(true);
    await expect(
      gateway.recordSignInSuccess(ownerA, auditCorrelationId),
    ).resolves.toBe(false);
    const recorded = await admin.query<{ count: string }>(
      `
      select pg_catalog.count(*)::text as count
      from private.audit_events
      where correlation_id = $1::uuid
        and actor_user_id = $2::uuid
        and action = 'auth.sign_in'
      `,
      [auditCorrelationId, OWNER_A],
    );
    expect(recorded.rows[0]?.count).toBe("1");
  });

  it("clears transaction-local claims before returning a pooled connection", async () => {
    if (apiPool === null) {
      throw new Error("pool setup did not complete");
    }
    const result = await apiPool.query<{
      claims: string;
      release_sha: string;
      session_user: string;
    }>(`
      select
        pg_catalog.current_setting('request.jwt.claims', true) as claims,
        pg_catalog.current_setting('simula.release_sha', true) as release_sha,
        session_user::text as session_user
    `);
    expect(result.rows[0]).toEqual({
      claims: "",
      release_sha: "",
      session_user: "simula_api",
    });
  });

  it("persists, replays, tenant-isolates, audits, and retires a visual profile", async () => {
    if (gateway === null) {
      throw new Error("gateway setup did not complete");
    }
    const ownerA = identity(OWNER_A);
    const ownerB = identity(OWNER_B);
    const project = await gateway.createProject(
      ownerA,
      organizationId,
      {
        name: "Visual profile integration",
        objective: "Prove asset-bound technical profile persistence.",
        market: "philippines",
        language: "en",
        category: "campaign_message",
      },
      "database-project-0001",
      "1".repeat(64),
      randomUUID(),
    );
    const stimulus = await gateway.createStimulus(
      ownerA,
      project.value.id,
      "Technical image fixture",
      "A deterministic database integration fixture.",
      "database-stimulus-001",
      "2".repeat(64),
      randomUUID(),
    );
    const content = Buffer.from("database-visual-profile-fixture", "utf8");
    const assetSha256 = createHash("sha256").update(content).digest("hex");
    const reserved = await gateway.createStimulusAsset(
      ownerA,
      stimulus.value.id,
      {
        filename: "database-fixture.png",
        media_type: "image/png",
        byte_size: content.length,
        content_sha256: assetSha256,
        retention_until: new Date(Date.now() + 86_400_000).toISOString(),
      },
      "database-asset-000001",
      "3".repeat(64),
      randomUUID(),
    );
    const available = await gateway.confirmStimulusAssetUpload(
      ownerA,
      reserved.value.asset_id,
      content.length,
      assetSha256,
      randomUUID(),
    );
    expect(available.status).toBe("available");

    const analysisId = randomUUID();
    const profile = visualProfile({
      analysisId,
      assetId: available.asset_id,
      assetSha256,
      byteSize: content.length,
      organizationId,
      stimulusId: stimulus.value.id,
    });
    const created = await gateway.createVisualStimulusProfile(
      ownerA,
      available.asset_id,
      analysisId,
      profile,
      "database-visual-profile-01",
      "4".repeat(64),
      randomUUID(),
    );
    expect(created).toMatchObject({
      replayed: false,
      value: {
        analysis_id: analysisId,
        asset_id: available.asset_id,
        profile_checksum_sha256: profile.checksum_sha256,
      },
    });

    const replayed = await gateway.createVisualStimulusProfile(
      ownerA,
      available.asset_id,
      analysisId,
      profile,
      "database-visual-profile-01",
      "4".repeat(64),
      randomUUID(),
    );
    expect(replayed).toMatchObject({
      replayed: true,
      value: {
        analysis_id: analysisId,
        profile_checksum_sha256: profile.checksum_sha256,
      },
    });
    await expect(
      gateway.getVisualStimulusProfile(ownerA, available.asset_id),
    ).resolves.toMatchObject({
      analysis_id: analysisId,
      profile: {
        analysis_scope: "technical_image_signals_only",
        behavioral_interpretation: false,
        population_inference: false,
      },
    });
    await expect(
      gateway.getVisualStimulusProfile(ownerB, available.asset_id),
    ).resolves.toBeNull();

    const durable = await admin.query<{
      audit_count: string;
      receipt_count: string;
    }>(
      `
      select
        (
          select pg_catalog.count(*)::text
          from private.audit_events
          where organization_id = $1::uuid
            and action = 'stimulus_visual_profile.created'
            and object_id = $2::uuid
        ) as audit_count,
        (
          select pg_catalog.count(*)::text
          from private.phase4_command_receipts
          where organization_id = $1::uuid
            and scope = 'stimulus_visual_profile.create'
            and resource_id = $2::uuid
        ) as receipt_count
      `,
      [organizationId, analysisId],
    );
    expect(durable.rows[0]).toEqual({
      audit_count: "1",
      receipt_count: "1",
    });

    const retirement = await gateway.requestStimulusAssetDeletion(
      ownerA,
      available.asset_id,
      "database-delete-asset-01",
      "5".repeat(64),
      randomUUID(),
    );
    expect(retirement.value.status).toBe("deletion_requested");
    await expect(
      gateway.getVisualStimulusProfile(ownerA, available.asset_id),
    ).resolves.toBeNull();
    const retired = await admin.query<{ count: string }>(
      `
      select pg_catalog.count(*)::text as count
      from api.stimulus_visual_profiles
      where asset_id = $1::uuid
      `,
      [available.asset_id],
    );
    expect(retired.rows[0]?.count).toBe("0");
  });
});
