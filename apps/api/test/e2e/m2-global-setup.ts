import "reflect-metadata";

import { randomBytes, randomUUID } from "node:crypto";

import type { FullConfig } from "@playwright/test";
import Redis from "ioredis";
import { Pool } from "pg";

import type { RuntimeEnvironment } from "../../src/config/redis-connection";
import { LoopbackAuthS3 } from "../support/loopback-auth-s3";

const AUTH_PORT = 52_140;
const API_PORT = 52_141;
const WEB_ORIGIN = "http://127.0.0.1:52142";
const OWNER_A = "00000000-0000-4000-8000-000000000001";
const OWNER_B = "00000000-0000-4000-8000-000000000003";
const OWNER_A_EMAIL = "m2-owner-a@simula.local";
const OWNER_B_EMAIL = "m2-owner-b@simula.local";
const AUTH_PASSWORD = "LocalOnlyM2BrowserPassword_7xP2mQ9v";
const FOREIGN_ORGANIZATION_NAME = "Foreign tenant confidential workspace";
const FOREIGN_PROJECT_NAME = "Foreign tenant confidential project";
const FOREIGN_PROJECT_OBJECTIVE =
  "Private fixture text that must never appear to another tenant.";
const DELETION_ORGANIZATION_NAME = "Disposable deletion proof workspace";

type ApplicationModule = typeof import("../../src/application");

type CreatedOrganization = Readonly<{ id: string }>;
type CreatedProject = Readonly<{ id: string }>;

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function responseJson<T>(response: Response): Promise<T> {
  const value = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(
      `fixture request ${response.status}: ${JSON.stringify(value)}`,
    );
  }
  return value as T;
}

async function command<T>(
  path: string,
  token: string,
  idempotencyKey: string,
  body: unknown,
): Promise<T> {
  return responseJson<T>(
    await fetch(`http://127.0.0.1:${API_PORT}${path}`, {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      method: "POST",
    }),
  );
}

export default async function globalSetup(
  _config: FullConfig,
): Promise<() => Promise<void>> {
  const adminDatabaseUrl = process.env.SIMULA_TEST_ADMIN_DATABASE_URL;
  if (!adminDatabaseUrl) {
    throw new Error(
      "SIMULA_TEST_ADMIN_DATABASE_URL is required for M2 browser proof.",
    );
  }

  const admin = new Pool({
    connectionString: adminDatabaseUrl,
    connectionTimeoutMillis: 2_000,
    max: 1,
  });
  const boundary = new LoopbackAuthS3();
  const apiPassword = randomBytes(24).toString("hex");
  const ratePrefix = `simula:test:m2-browser:${randomUUID()}`;
  const setupStartedAt = new Date();
  let app: Awaited<ReturnType<ApplicationModule["createApplication"]>> | null =
    null;
  let organizationId: string | null = null;
  let deletionOrganizationId: string | null = null;
  let originalPassword: string | null = null;
  let passwordChanged = false;

  const cleanup = async (): Promise<void> => {
    let cleanupError: unknown;
    const attempt = async (operation: () => Promise<void>): Promise<void> => {
      try {
        await operation();
      } catch (error) {
        cleanupError ??= error;
      }
    };

    await attempt(async () => {
      if (app !== null) await app.close();
    });
    await attempt(async () => {
      await boundary.stop();
    });
    await attempt(async () => {
      const redis = new Redis("redis://127.0.0.1:6379/13", {
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
        if (redis.status === "ready") await redis.quit();
        else redis.disconnect(false);
      }
    });
    await attempt(async () => {
      if (organizationId !== null) {
        await admin.query("delete from api.organizations where id = $1::uuid", [
          organizationId,
        ]);
      }
      if (deletionOrganizationId !== null) {
        await admin.query("delete from api.organizations where id = $1::uuid", [
          deletionOrganizationId,
        ]);
        await admin.query(
          `
          delete from private.organization_deletion_requests
          where organization_id = $1::uuid
          `,
          [deletionOrganizationId],
        );
      }
      await admin.query(
        `
        delete from private.audit_events
        where actor_user_id = $1::uuid
          and action = 'auth.sign_in'
          and created_at >= $2::timestamptz
        `,
        [OWNER_B, setupStartedAt.toISOString()],
      );
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
    if (cleanupError !== undefined) throw cleanupError;
  };

  try {
    const catalog = await admin.query<{
      migrated: string | null;
      owner_a: boolean;
      owner_b: boolean;
      role_password: string | null;
    }>(`
      select
        pg_catalog.to_regprocedure('private.verified_subject()')::text
          as migrated,
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
      throw new Error("PostgreSQL is not a disposable SIMULA fixture.");
    }
    originalPassword = row.role_password;
    await admin.query(
      `alter role simula_api password ${sqlLiteral(apiPassword)}`,
    );
    passwordChanged = true;

    boundary.registerAuthUser({
      email: OWNER_A_EMAIL,
      password: AUTH_PASSWORD,
      userId: OWNER_A,
    });
    boundary.registerAuthUser({
      email: OWNER_B_EMAIL,
      password: AUTH_PASSWORD,
      userId: OWNER_B,
    });
    await boundary.start(AUTH_PORT);

    const apiUrl = new URL(adminDatabaseUrl);
    apiUrl.username = "simula_api";
    apiUrl.password = apiPassword;
    const environment: RuntimeEnvironment = {
      SIMULA_ASSET_STORAGE_ENABLED: "false",
      SIMULA_BEHAVIORAL_ENGINE_TOKEN:
        "LocalOnlyM2BrowserEngineToken_9rK2mP7xC4vN8sT6",
      SIMULA_BEHAVIORAL_ENGINE_URL: "http://127.0.0.1:9",
      SIMULA_CORS_ORIGINS: WEB_ORIGIN,
      SIMULA_CURSOR_SECRET: "LocalOnlyM2BrowserCursor_7xP2mQ9vK4cN8sT6",
      SIMULA_DATABASE_URL: apiUrl.toString(),
      SIMULA_ENVIRONMENT: "test",
      SIMULA_NEST_DOMAIN_ENABLED: "true",
      SIMULA_RATE_LIMIT_KEY_PREFIX: ratePrefix,
      SIMULA_REDIS_URL: "redis://127.0.0.1:6379/13",
      SIMULA_RELEASE_SHA: "a".repeat(40),
      SIMULA_SUPABASE_JWKS_URL: `${boundary.issuer}/.well-known/jwks.json`,
      SIMULA_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_m2_browser_local",
      SIMULA_SUPABASE_URL: boundary.origin,
      SIMULA_TECHNICAL_VISUAL_PROFILE_ENABLED: "false",
    };
    const { createApplication } =
      require("../../dist/application.js") as ApplicationModule;
    app = await createApplication(environment);
    await app.listen(API_PORT, "127.0.0.1");

    const suffix = randomUUID();
    const ownerToken = boundary.token(OWNER_A);
    const organization = await command<CreatedOrganization>(
      "/api/v2/organizations",
      ownerToken,
      `m2-browser-organization-${suffix}`,
      { name: FOREIGN_ORGANIZATION_NAME },
    );
    organizationId = organization.id;
    const project = await command<CreatedProject>(
      `/api/v2/organizations/${organization.id}/projects`,
      ownerToken,
      `m2-browser-project-${suffix}`,
      {
        category: "campaign_message",
        language: "en",
        market: "philippines",
        name: FOREIGN_PROJECT_NAME,
        objective: FOREIGN_PROJECT_OBJECTIVE,
      },
    );
    const deletionFixture = await admin.query<{ id: string }>(
      `
      with organization as (
        insert into api.organizations (name, created_by)
        values ($1, $2::uuid)
        returning id
      ),
      membership as (
        insert into api.organization_memberships (
          organization_id,
          user_id,
          role,
          created_by
        )
        select id, $2::uuid, 'owner', $2::uuid
        from organization
      )
      select id::text as id
      from organization
      `,
      [DELETION_ORGANIZATION_NAME, OWNER_A],
    );
    deletionOrganizationId = deletionFixture.rows[0]?.id ?? null;
    if (deletionOrganizationId === null) {
      throw new Error("Deletion browser fixture was not created.");
    }

    process.env.SIMULA_M2_BROWSER_OWNER_EMAIL = OWNER_A_EMAIL;
    process.env.SIMULA_M2_BROWSER_EMAIL = OWNER_B_EMAIL;
    process.env.SIMULA_M2_BROWSER_PASSWORD = AUTH_PASSWORD;
    process.env.SIMULA_M2_DELETION_ORGANIZATION_ID = deletionOrganizationId;
    process.env.SIMULA_M2_DELETION_ORGANIZATION_NAME =
      DELETION_ORGANIZATION_NAME;
    process.env.SIMULA_M2_FOREIGN_ORGANIZATION_ID = organization.id;
    process.env.SIMULA_M2_FOREIGN_ORGANIZATION_NAME = FOREIGN_ORGANIZATION_NAME;
    process.env.SIMULA_M2_FOREIGN_PROJECT_ID = project.id;
    process.env.SIMULA_M2_FOREIGN_PROJECT_NAME = FOREIGN_PROJECT_NAME;
    process.env.SIMULA_M2_FOREIGN_PROJECT_OBJECTIVE = FOREIGN_PROJECT_OBJECTIVE;
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}
