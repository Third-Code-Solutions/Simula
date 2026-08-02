import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import Redis from "ioredis";
import { Pool } from "pg";
import request from "supertest";

import { createApplication } from "../../src/application";
import type { AssetObjectStore } from "../../src/assets/asset-object-store";
import type { VerifiedIdentity } from "../../src/auth/identity";
import type { RuntimeEnvironment } from "../../src/config/redis-connection";
import {
  ASSET_OBJECT_STORE,
  ORGANIZATION_GATEWAY,
} from "../../src/domain/domain.constants";
import type { OrganizationGateway } from "../../src/organizations/organization-gateway.port";
import { LoopbackAuthS3 } from "../support/loopback-auth-s3";

const OWNER_A = "00000000-0000-4000-8000-000000000001";
const OWNER_B = "00000000-0000-4000-8000-000000000003";
const CONTENT = Buffer.from("bounded adversarial asset fixture", "utf8");
const CONTENT_SHA256 = createHash("sha256").update(CONTENT).digest("hex");

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function bearer(token: string): Readonly<Record<string, string>> {
  return { Authorization: `Bearer ${token}` };
}

describe("Stimulus asset adversarial HTTP integration", () => {
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
  const boundary = new LoopbackAuthS3();
  const apiPassword = randomBytes(24).toString("hex");
  const ratePrefix = `simula:test:http-assets:${randomUUID()}`;
  let app: INestApplication | null = null;
  let originalPassword: string | null = null;
  let passwordChanged = false;
  let organizationId: string | null = null;

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
    await boundary.start();

    const apiUrl = new URL(adminDatabaseUrl);
    apiUrl.username = "simula_api";
    apiUrl.password = apiPassword;
    const environment: RuntimeEnvironment = {
      SIMULA_ASSET_STORAGE_ACCESS_KEY_ID: "localtestaccess",
      SIMULA_ASSET_STORAGE_ENABLED: "true",
      SIMULA_ASSET_STORAGE_ENDPOINT: `${boundary.origin}/storage/v1/s3`,
      SIMULA_ASSET_STORAGE_REGION: "local",
      SIMULA_ASSET_STORAGE_SECRET_ACCESS_KEY:
        "LocalOnlyAssetSecret_7xP2mQ9vK4cN8sT6",
      SIMULA_BEHAVIORAL_ENGINE_TOKEN: "LocalOnlyEngineToken_9rK2mP7xC4vN8sT6",
      SIMULA_BEHAVIORAL_ENGINE_URL: "http://127.0.0.1:9",
      SIMULA_CORS_ORIGINS: "http://127.0.0.1:3000",
      SIMULA_CURSOR_SECRET: "LocalOnlyCursorSecret_7xP2mQ9vK4cN8sT6",
      SIMULA_DATABASE_URL: apiUrl.toString(),
      SIMULA_ENVIRONMENT: "test",
      SIMULA_NEST_DOMAIN_ENABLED: "true",
      SIMULA_RATE_LIMIT_KEY_PREFIX: ratePrefix,
      SIMULA_REDIS_URL: "redis://127.0.0.1:6379/14",
      SIMULA_RELEASE_SHA: "a".repeat(40),
      SIMULA_SUPABASE_JWKS_URL: `${boundary.issuer}/.well-known/jwks.json`,
      SIMULA_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_http_integration",
      SIMULA_SUPABASE_URL: boundary.origin,
      SIMULA_TECHNICAL_VISUAL_PROFILE_ENABLED: "false",
    };
    app = await createApplication(environment);
    await app.init();
  });

  afterAll(async () => {
    let cleanupError: unknown;
    const attempt = async (cleanup: () => Promise<void>): Promise<void> => {
      try {
        await cleanup();
      } catch (error) {
        cleanupError ??= error;
      }
    };

    await attempt(async () => {
      if (app === null) return;
      const redis = new Redis("redis://127.0.0.1:6379/14", {
        enableOfflineQueue: false,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
      try {
        await redis.connect();
        let cursor = "0";
        do {
          const [next, keys] = await redis.scan(
            cursor,
            "MATCH",
            `${ratePrefix}:*`,
            "COUNT",
            100,
          );
          if (keys.length > 0) await redis.del(...keys);
          cursor = next;
        } while (cursor !== "0");
      } finally {
        try {
          if (redis.status === "ready") await redis.quit();
          else redis.disconnect(false);
        } finally {
          await app.close();
        }
      }
    });
    await attempt(async () => {
      if (organizationId === null) return;
      await admin.query("delete from api.organizations where id = $1::uuid", [
        organizationId,
      ]);
    });
    await attempt(async () => {
      await boundary.stop();
    });
    await attempt(async () => {
      if (!passwordChanged) return;
      if (originalPassword === null) {
        await admin.query("alter role simula_api password null");
      } else {
        await admin.query(
          `alter role simula_api password ${sqlLiteral(originalPassword)}`,
        );
      }
    });
    await attempt(async () => {
      await admin.end();
    });
    if (cleanupError !== undefined) {
      throw cleanupError;
    }
  });

  it("conceals foreign assets, denies expired bytes, and recovers deletion", async () => {
    if (app === null) throw new Error("application was not initialized");
    const http = app.getHttpServer();
    const ownerToken = boundary.token(OWNER_A);
    const foreignToken = boundary.token(OWNER_B);
    const suffix = randomUUID();
    const ownerIdentity: VerifiedIdentity = Object.freeze({
      expiresAt: Math.floor(Date.now() / 1_000) + 3_600,
      issuer: boundary.issuer,
      sessionId: randomUUID(),
      userId: OWNER_A,
    });

    const organization = await request(http)
      .post("/api/v2/organizations")
      .set(bearer(ownerToken))
      .set("Idempotency-Key", `http-organization-${suffix}`)
      .send({ name: "Adversarial asset integration" })
      .expect(201);
    organizationId = organization.body.id as string;

    const gateway = app.get<OrganizationGateway>(ORGANIZATION_GATEWAY);
    const project = await gateway.createProject(
      ownerIdentity,
      organizationId,
      {
        category: "campaign_message",
        language: "en",
        market: "philippines",
        name: "Private asset boundary",
        objective: "Prove tenant, retention, and deletion controls.",
      },
      `gateway-project-${suffix}`,
      createHash("sha256").update(`project:${suffix}`).digest("hex"),
      randomUUID(),
    );
    const stimulus = await gateway.createStimulus(
      ownerIdentity,
      project.value.id,
      "Bounded fixture",
      "No personal data. Adversarial integration fixture.",
      `gateway-stimulus-${suffix}`,
      createHash("sha256").update(`stimulus:${suffix}`).digest("hex"),
      randomUUID(),
    );
    const stimulusId = stimulus.value.id;

    const retained = await request(http)
      .post(`/api/v2/stimuli/${stimulusId}/assets`)
      .set(bearer(ownerToken))
      .set("Idempotency-Key", `http-retained-reserve-${suffix}`)
      .send({
        byte_size: CONTENT.length,
        content_sha256: CONTENT_SHA256,
        filename: "retained.png",
        media_type: "image/png",
        retention_until: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(201);
    const retainedAssetId = retained.body.data.asset_id as string;
    await request(http)
      .put(`/api/v2/stimulus-assets/${retainedAssetId}/content`)
      .set(bearer(ownerToken))
      .set("Content-Type", "image/png")
      .set("Idempotency-Key", `http-retained-upload-${suffix}`)
      .send(CONTENT)
      .expect(200);
    expect(boundary.objectCount).toBe(1);

    const objectGetsBeforeForeignRead = boundary.objectGetRequests;
    const foreignRead = await request(http)
      .get(`/api/v2/stimulus-assets/${retainedAssetId}/content`)
      .set(bearer(foreignToken))
      .expect(404);
    expect(foreignRead.body).toMatchObject({
      code: "not_found",
      detail: "The requested resource was not found.",
      status: 404,
      title: "Resource not found",
    });
    expect(foreignRead.body).not.toHaveProperty("data");
    expect(boundary.objectGetRequests).toBe(objectGetsBeforeForeignRead);

    const foreignDelete = await request(http)
      .post(`/api/v2/stimulus-assets/${retainedAssetId}/deletion`)
      .set(bearer(foreignToken))
      .set("Idempotency-Key", `http-foreign-delete-${suffix}`)
      .send({})
      .expect(404);
    expect(foreignDelete.body).toMatchObject({
      code: "not_found",
      status: 404,
    });
    expect(boundary.objectCount).toBe(1);

    const deleteKey = `http-owner-delete-${suffix}`;
    boundary.retainNextDelete();
    const interruptedDelete = await request(http)
      .post(`/api/v2/stimulus-assets/${retainedAssetId}/deletion`)
      .set(bearer(ownerToken))
      .set("Idempotency-Key", deleteKey)
      .send({})
      .expect(503);
    expect(interruptedDelete.body).toMatchObject({
      code: "dependency_unavailable",
      status: 503,
    });
    expect(boundary.objectCount).toBe(1);
    await expect(
      admin.query<{ status: string }>(
        "select status::text from api.stimulus_assets where id = $1::uuid",
        [retainedAssetId],
      ),
    ).resolves.toMatchObject({
      rows: [{ status: "deletion_requested" }],
    });

    const recoveredDelete = await request(http)
      .post(`/api/v2/stimulus-assets/${retainedAssetId}/deletion`)
      .set(bearer(ownerToken))
      .set("Idempotency-Key", deleteKey)
      .send({})
      .expect(200);
    expect(recoveredDelete.headers["idempotent-replayed"]).toBe("true");
    expect(recoveredDelete.body.data.status).toBe("deleted");
    expect(boundary.objectCount).toBe(0);

    const expiring = await request(http)
      .post(`/api/v2/stimuli/${stimulusId}/assets`)
      .set(bearer(ownerToken))
      .set("Idempotency-Key", `http-expiring-reserve-${suffix}`)
      .send({
        byte_size: CONTENT.length,
        content_sha256: CONTENT_SHA256,
        filename: "expiring.png",
        media_type: "image/png",
        retention_until: new Date(Date.now() + 390_000).toISOString(),
      })
      .expect(201);
    const expiringAssetId = expiring.body.data.asset_id as string;
    const expiringRecord = await gateway.getStimulusAsset(
      ownerIdentity,
      expiringAssetId,
    );
    const objectStore = app.get<AssetObjectStore>(ASSET_OBJECT_STORE);
    await objectStore.put(
      {
        bucket: expiringRecord.storage_bucket_id,
        objectName: expiringRecord.storage_object_name,
      },
      {
        byteSize: CONTENT.length,
        contentSha256: CONTENT_SHA256,
        filename: expiringRecord.filename,
        mediaType: "image/png",
      },
      CONTENT,
    );
    await gateway.confirmStimulusAssetUpload(
      ownerIdentity,
      expiringAssetId,
      CONTENT.length,
      CONTENT_SHA256,
      randomUUID(),
    );
    expect(boundary.objectCount).toBe(1);
    const realNow = Date.now();
    const objectGetsBeforeExpiry = boundary.objectGetRequests;
    const dateNow = jest.spyOn(Date, "now").mockReturnValue(realNow + 420_000);
    try {
      const expiredRead = await request(http)
        .get(`/api/v2/stimulus-assets/${expiringAssetId}/content`)
        .set(bearer(ownerToken))
        .expect(404);
      expect(expiredRead.body).toMatchObject({
        code: "not_found",
        status: 404,
      });
      expect(boundary.objectGetRequests).toBe(objectGetsBeforeExpiry);
    } finally {
      dateNow.mockRestore();
    }
  });
});
