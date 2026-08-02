import { createHash, randomBytes, randomUUID } from "node:crypto";
import { type ChildProcessByStdio, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Readable, Writable } from "node:stream";

import type { INestApplication } from "@nestjs/common";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { Pool } from "pg";
import request from "supertest";

import { createApplication } from "../../src/application";
import type { VerifiedIdentity } from "../../src/auth/identity";
import { parseRedisConnection } from "../../src/config/redis-connection";
import type { RuntimeEnvironment } from "../../src/config/redis-connection";
import { ORGANIZATION_GATEWAY } from "../../src/domain/domain.constants";
import type { OrganizationGateway } from "../../src/organizations/organization-gateway.port";
import { BullMqSimulationQueue } from "../../src/queue/bullmq-simulation-queue";
import {
  SIMULATION_JOB_NAME,
  SIMULATION_JOB_OPTIONS,
  SIMULATION_QUEUE_NAME,
  SIMULATION_QUEUE_PORT,
} from "../../src/queue/queue.constants";
import type { SimulationJobData } from "../../src/queue/simulation-job";
import type { SimulationQueuePort } from "../../src/queue/simulation-queue.port";
import {
  createDispatcherPool,
  PgRunOutboxDatabase,
} from "../../src/dispatcher/pg-run-outbox-database";
import { RunOutboxDispatcher } from "../../src/dispatcher/run-outbox-dispatcher";
import { LoopbackAuthS3 } from "../support/loopback-auth-s3";

const OWNER_A = "00000000-0000-4000-8000-000000000001";
const RELEASE_SHA = "a".repeat(40);
const RESULT_PREFIX = "SIMULA_BULLMQ_RESULT=";
const ARQ_RESULT_PREFIX = "SIMULA_ARQ_RESULT=";

type WorkerResult = Readonly<{
  attempts_started: number;
  job_id: string;
  state: "completed";
}>;
type ArqWorkerResult = Readonly<{
  claimed: number;
  confirmed: number;
  job_id: string;
  run_id: string;
  state: "completed";
}>;
type BatchWorkerResult = Readonly<{
  attempts_started: Readonly<Record<string, number>>;
  claimed_job_ids: readonly string[];
  job_ids: readonly string[];
  replica_id: string;
  state: "completed";
}>;
type WorkerProcess = ChildProcessByStdio<Writable, Readable, Readable>;
type WorkerMode =
  | "behavioral"
  | "crash_after_claim"
  | "pause_in_provider"
  | "settle"
  | "settle_batch"
  | "settle_stalled";
type RunKind = "behavioral" | "deterministic";
type RunIdentity = Readonly<{
  idempotencyKey: string;
  jobId: string;
  runId: string;
}>;
type RunFixture = Readonly<{
  idempotencyKey: string;
  jobId: string;
  ownerToken: string;
  projectId: string;
  runId: string;
  stimulusVersionId: string;
}>;
type QueueCutoverEvidence = Readonly<{
  activeTransport: string;
  admissionEnabled: boolean;
  auditCount: number;
  changed: boolean;
  defaultTransport: string;
}>;

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function bearer(token: string): Readonly<Record<string, string>> {
  return { Authorization: `Bearer ${token}` };
}

function pythonExecutable(): string {
  const configured = process.env.SIMULA_TEST_PYTHON_EXECUTABLE;
  if (configured !== undefined && configured.trim() !== "") {
    return configured;
  }
  const relative =
    process.platform === "win32"
      ? [".venv", "Scripts", "python.exe"]
      : [".venv", "bin", "python"];
  const executable = resolve(__dirname, "../../../..", ...relative);
  if (!existsSync(executable)) {
    throw new Error(
      "SIMULA_TEST_PYTHON_EXECUTABLE is required when the workspace virtual environment is absent.",
    );
  }
  return executable;
}

function startWorker(
  databaseUrl: string,
  redisUrl: string,
  jobId: string,
  mode: WorkerMode = "settle",
): WorkerProcess {
  const helper = resolve(
    __dirname,
    "../../../..",
    "tests",
    "integration",
    "bullmq_worker_once.py",
  );
  return spawn(pythonExecutable(), [helper], {
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      SIMULA_ENVIRONMENT: "test",
      SIMULA_RELEASE_SHA: RELEASE_SHA,
      SIMULA_REDIS_URL: redisUrl,
      SIMULA_TEST_BULLMQ_JOB_ID: jobId,
      SIMULA_TEST_BULLMQ_WORKER_MODE: mode,
      SIMULA_WORKER_DATABASE_URL: databaseUrl,
      SIMULA_WORKER_QUEUE_TRANSPORT: "bullmq",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function startArqWorker(
  databaseUrl: string,
  redisUrl: string,
  runId: string,
): WorkerProcess {
  const helper = resolve(
    __dirname,
    "../../../..",
    "tests",
    "integration",
    "arq_worker_once.py",
  );
  return spawn(pythonExecutable(), [helper], {
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      SIMULA_ENVIRONMENT: "test",
      SIMULA_RELEASE_SHA: RELEASE_SHA,
      SIMULA_REDIS_URL: redisUrl,
      SIMULA_TEST_ARQ_RUN_ID: runId,
      SIMULA_WORKER_DATABASE_URL: databaseUrl,
      SIMULA_WORKER_QUEUE_TRANSPORT: "arq",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function startBatchWorker(
  databaseUrl: string,
  redisUrl: string,
  jobIds: readonly string[],
  replicaId: string,
): WorkerProcess {
  const firstJobId = jobIds[0];
  if (firstJobId === undefined) {
    throw new Error("BullMQ batch worker requires at least one job.");
  }
  const helper = resolve(
    __dirname,
    "../../../..",
    "tests",
    "integration",
    "bullmq_worker_once.py",
  );
  return spawn(pythonExecutable(), [helper], {
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      SIMULA_ENVIRONMENT: "test",
      SIMULA_RELEASE_SHA: RELEASE_SHA,
      SIMULA_REDIS_URL: redisUrl,
      SIMULA_TEST_BULLMQ_JOB_ID: firstJobId,
      SIMULA_TEST_BULLMQ_JOB_IDS: JSON.stringify(jobIds),
      SIMULA_TEST_BULLMQ_REPLICA_ID: replicaId,
      SIMULA_TEST_BULLMQ_WORKER_MODE: "settle_batch",
      SIMULA_WORKER_DATABASE_URL: databaseUrl,
      SIMULA_WORKER_QUEUE_TRANSPORT: "bullmq",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
}

async function workerCrash(child: WorkerProcess, jobId: string): Promise<void> {
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const exitCode = await new Promise<number | null>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", resolveExit);
  });
  if (
    exitCode !== 97 ||
    !stdout.includes(
      `SIMULA_BULLMQ_CRASH={"job_id":"${jobId}","status":"claimed"}`,
    )
  ) {
    throw new Error(
      `Python BullMQ crash probe exited ${String(exitCode)}.\n${stdout}\n${stderr}`,
    );
  }
}

async function completedWorkerPayload(
  child: WorkerProcess,
  resultPrefix = RESULT_PREFIX,
  runtime = "BullMQ",
): Promise<unknown> {
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const exitCode = await new Promise<number | null>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", resolveExit);
  });
  if (exitCode !== 0) {
    throw new Error(
      `Python ${runtime} worker exited ${String(exitCode)}.\n${stdout}\n${stderr}`,
    );
  }
  const line = stdout
    .split(/\r?\n/)
    .reverse()
    .find((candidate) => candidate.startsWith(resultPrefix));
  if (line === undefined) {
    throw new Error(
      `Python ${runtime} worker emitted no result.\n${stdout}\n${stderr}`,
    );
  }
  return JSON.parse(line.slice(resultPrefix.length)) as unknown;
}

async function workerResult(child: WorkerProcess): Promise<WorkerResult> {
  const parsed = (await completedWorkerPayload(child)) as Partial<WorkerResult>;
  if (
    parsed.state !== "completed" ||
    typeof parsed.job_id !== "string" ||
    parsed.job_id === "" ||
    !Number.isSafeInteger(parsed.attempts_started) ||
    (parsed.attempts_started as number) < 1
  ) {
    throw new Error("Python BullMQ worker emitted an invalid result.");
  }
  return parsed as WorkerResult;
}

async function arqWorkerResult(child: WorkerProcess): Promise<ArqWorkerResult> {
  const parsed = (await completedWorkerPayload(
    child,
    ARQ_RESULT_PREFIX,
    "ARQ",
  )) as Partial<ArqWorkerResult>;
  if (
    parsed.state !== "completed" ||
    typeof parsed.job_id !== "string" ||
    typeof parsed.run_id !== "string" ||
    parsed.job_id !== `run:${parsed.run_id}:dispatch:1` ||
    parsed.claimed !== 1 ||
    parsed.confirmed !== 1
  ) {
    throw new Error("Python ARQ worker emitted an invalid result.");
  }
  return parsed as ArqWorkerResult;
}

async function batchWorkerResult(
  child: WorkerProcess,
): Promise<BatchWorkerResult> {
  const parsed = (await completedWorkerPayload(
    child,
  )) as Partial<BatchWorkerResult>;
  const attempts = parsed.attempts_started;
  if (
    parsed.state !== "completed" ||
    typeof parsed.replica_id !== "string" ||
    parsed.replica_id === "" ||
    !Array.isArray(parsed.job_ids) ||
    parsed.job_ids.length === 0 ||
    parsed.job_ids.some((jobId) => typeof jobId !== "string") ||
    new Set(parsed.job_ids).size !== parsed.job_ids.length ||
    !Array.isArray(parsed.claimed_job_ids) ||
    parsed.claimed_job_ids.some((jobId) => typeof jobId !== "string") ||
    new Set(parsed.claimed_job_ids).size !== parsed.claimed_job_ids.length ||
    attempts === null ||
    typeof attempts !== "object" ||
    Array.isArray(attempts) ||
    Object.entries(attempts).some(
      ([jobId, count]) =>
        !parsed.job_ids?.includes(jobId) ||
        !Number.isSafeInteger(count) ||
        count < 1,
    )
  ) {
    throw new Error("Python BullMQ batch worker emitted an invalid result.");
  }
  return parsed as BatchWorkerResult;
}

async function waitForWorkerOutput(
  child: WorkerProcess,
  expected: string,
): Promise<void> {
  await new Promise<void>((resolveOutput, reject) => {
    let stdout = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(`Python worker emitted no expected marker: ${expected}`),
      );
    }, 10_000);
    const onData = (chunk: string): void => {
      stdout += chunk;
      if (stdout.includes(expected)) {
        cleanup();
        resolveOutput();
      }
    };
    const onExit = (code: number | null): void => {
      cleanup();
      reject(
        new Error(
          `Python worker exited ${String(code)} before expected marker: ${expected}`,
        ),
      );
    };
    const cleanup = (): void => {
      clearTimeout(timeout);
      child.stdout.off("data", onData);
      child.off("exit", onExit);
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", onData);
    child.once("exit", onExit);
  });
}

async function waitForDelayedDelivery(
  queue: Queue<SimulationJobData, void, typeof SIMULATION_JOB_NAME>,
  jobId: string,
  child: WorkerProcess,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      await workerResult(child);
      throw new Error(
        "Python worker completed before outbox confirmation was admitted.",
      );
    }
    const stored = await queue.getJob(jobId);
    if (
      stored !== undefined &&
      stored !== null &&
      stored.attemptsStarted === 1 &&
      (await stored.getState()) === "delayed"
    ) {
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error("Python worker did not defer the unconfirmed BullMQ job.");
}

describe("BullMQ v2 durable cross-language run pipeline", () => {
  const adminDatabaseUrl = process.env.SIMULA_TEST_ADMIN_DATABASE_URL;
  if (adminDatabaseUrl === undefined || adminDatabaseUrl === "") {
    throw new Error(
      "SIMULA_TEST_ADMIN_DATABASE_URL is required for this explicit local integration.",
    );
  }
  const redisUrl =
    process.env.SIMULA_TEST_REDIS_URL ?? "redis://127.0.0.1:6379/13";
  const redisConnection = parseRedisConnection({
    SIMULA_ENVIRONMENT: "test",
    SIMULA_REDIS_URL: redisUrl,
  });
  if (redisConnection === null) {
    throw new Error("SIMULA_TEST_REDIS_URL is required.");
  }
  const failureRedisUrl =
    process.env.SIMULA_TEST_FAILURE_REDIS_URL ?? "redis://127.0.0.1:6384/13";
  const failureRedisConnection = parseRedisConnection({
    SIMULA_ENVIRONMENT: "test",
    SIMULA_REDIS_URL: failureRedisUrl,
  });
  if (failureRedisConnection === null) {
    throw new Error("SIMULA_TEST_FAILURE_REDIS_URL is required.");
  }

  const admin = new Pool({
    connectionString: adminDatabaseUrl,
    connectionTimeoutMillis: 2_000,
    max: 1,
  });
  const boundary = new LoopbackAuthS3();
  const apiPassword = randomBytes(24).toString("hex");
  const workerPassword = randomBytes(24).toString("hex");
  const ratePrefix = `simula:test:bullmq-http:${randomUUID()}`;
  const queue = new Queue<SimulationJobData, void, typeof SIMULATION_JOB_NAME>(
    SIMULATION_QUEUE_NAME,
    {
      connection: redisConnection,
      prefix: "simula:v2",
    },
  );
  const activeWorkers = new Set<WorkerProcess>();
  let app: INestApplication | null = null;
  let apiDatabaseUrl = "";
  let dispatcherPool: Pool | null = null;
  let originalApiPassword: string | null = null;
  let originalWorkerPassword: string | null = null;
  let passwordsChanged = false;
  let queueCutoverEvidence: QueueCutoverEvidence | null = null;
  let workerDatabaseUrl = "";

  async function createRunFixture(
    label: string,
    kind: RunKind = "deterministic",
  ): Promise<RunFixture> {
    if (app === null) {
      throw new Error("integration application was not initialized");
    }
    const suffix = randomUUID();
    const ownerUserId = randomUUID();
    await admin.query(
      `
      insert into auth.users (id, email)
      values ($1::uuid, $2::text)
      `,
      [ownerUserId, `bullmq-${label}-${suffix}@example.test`],
    );
    const ownerToken = boundary.token(ownerUserId);
    const ownerIdentity: VerifiedIdentity = Object.freeze({
      expiresAt: Math.floor(Date.now() / 1_000) + 3_600,
      issuer: boundary.issuer,
      sessionId: randomUUID(),
      userId: ownerUserId,
    });
    const http = app.getHttpServer();
    const gateway = app.get<OrganizationGateway>(ORGANIZATION_GATEWAY);
    const organization = await gateway.createOrganization(
      ownerIdentity,
      `${label} BullMQ integration`,
      `bullmq-${label}-organization-${suffix}`,
      createHash("sha256")
        .update(`organization:${label}:${suffix}`)
        .digest("hex"),
      randomUUID(),
    );
    const project = await gateway.createProject(
      ownerIdentity,
      organization.value.id,
      {
        category: "campaign_message",
        language: "en",
        market: "philippines",
        name: `${label} durable queue boundary`,
        objective: `Prove the ${label} durable execution boundary.`,
      },
      `bullmq-${label}-project-${suffix}`,
      createHash("sha256").update(`project:${label}:${suffix}`).digest("hex"),
      randomUUID(),
    );
    const stimulus = await gateway.createStimulus(
      ownerIdentity,
      project.value.id,
      `${label} deterministic queue fixture`,
      "Bounded fictional campaign message. No personal data.",
      `bullmq-${label}-stimulus-${suffix}`,
      createHash("sha256").update(`stimulus:${label}:${suffix}`).digest("hex"),
      randomUUID(),
    );
    const stimulusVersionId = stimulus.value.versions[0]?.id;
    if (stimulusVersionId === undefined) {
      throw new Error("integration stimulus has no immutable version");
    }
    const idempotencyKey = `bullmq-${label}-run-${suffix}`;
    const created = await request(http)
      .post(
        kind === "behavioral"
          ? `/api/v2/projects/${project.value.id}/behavioral-demo-runs`
          : `/api/v2/projects/${project.value.id}/runs`,
      )
      .set(bearer(ownerToken))
      .set("Idempotency-Key", idempotencyKey)
      .send({
        stimulus_version_id: stimulusVersionId,
        ...(kind === "behavioral" ? { variant_key: "baseline" } : {}),
      })
      .expect(202);
    const runId = created.body.id as string;
    expect(created.body).toMatchObject({
      dispatch_generation: 1,
      id: runId,
      state: "queued",
    });
    return Object.freeze({
      idempotencyKey,
      jobId: `run-${runId}-generation-1`,
      ownerToken,
      projectId: project.value.id,
      runId,
      stimulusVersionId,
    });
  }

  async function createAdditionalRun(
    fixture: RunFixture,
    label: string,
  ): Promise<RunIdentity> {
    if (app === null) {
      throw new Error("integration application was not initialized");
    }
    const idempotencyKey = `bullmq-${label}-run-${randomUUID()}`;
    const created = await request(app.getHttpServer())
      .post(`/api/v2/projects/${fixture.projectId}/runs`)
      .set(bearer(fixture.ownerToken))
      .set("Idempotency-Key", idempotencyKey)
      .send({ stimulus_version_id: fixture.stimulusVersionId })
      .expect(202);
    const runId = created.body.id as string;
    expect(created.body).toMatchObject({
      dispatch_generation: 1,
      id: runId,
      state: "queued",
    });
    return Object.freeze({
      idempotencyKey,
      jobId: `run-${runId}-generation-1`,
      runId,
    });
  }

  async function resetRunCreateRateBuckets(): Promise<void> {
    const redis = new Redis(redisUrl, {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    try {
      await redis.connect();
      for (const pattern of [
        `${ratePrefix}:s2:run_create_user:*`,
        `${ratePrefix}:s2:run_create_organization:*`,
      ]) {
        let cursor = "0";
        do {
          const [next, keys] = await redis.scan(
            cursor,
            "MATCH",
            pattern,
            "COUNT",
            100,
          );
          if (keys.length > 0) await redis.del(...keys);
          cursor = next;
        } while (cursor !== "0");
      }
    } finally {
      if (redis.status === "ready") await redis.quit();
      else redis.disconnect(false);
    }
  }

  async function removeQueueJobs(jobIds: readonly string[]): Promise<void> {
    for (const jobId of jobIds) {
      const job = await queue.getJob(jobId);
      if (job !== undefined && job !== null) {
        await job.remove();
      }
    }
  }

  async function deleteProjectRuns(projectId: string): Promise<void> {
    await admin.query(
      `
      delete from api.simulation_runs
      where project_id = $1::uuid
      `,
      [projectId],
    );
  }

  async function seedPendingRunCopies(
    sourceRunId: string,
    count: number,
  ): Promise<readonly string[]> {
    const inserted = await admin.query<{ run_id: string }>(
      `
      with source_run as (
        select *
        from api.simulation_runs
        where id = $1::uuid
      ),
      inserted_runs as (
        insert into api.simulation_runs (
          id,
          organization_id,
          project_id,
          stimulus_version_id,
          audience_version_id,
          state,
          frozen_manifest,
          frozen_manifest_sha256,
          schema_version,
          deterministic_seed,
          dispatch_generation,
          attempt_count,
          created_by,
          correlation_id
        )
        select
          pg_catalog.gen_random_uuid(),
          source_run.organization_id,
          source_run.project_id,
          source_run.stimulus_version_id,
          source_run.audience_version_id,
          'queued'::api.run_state,
          source_run.frozen_manifest,
          source_run.frozen_manifest_sha256,
          source_run.schema_version,
          source_run.deterministic_seed,
          1,
          0,
          source_run.created_by,
          pg_catalog.gen_random_uuid()
        from source_run
        cross join pg_catalog.generate_series(1, $2::integer)
        returning id, organization_id
      )
      insert into private.run_outbox (
        organization_id,
        run_id,
        generation,
        job_id,
        status
      )
      select
        inserted_runs.organization_id,
        inserted_runs.id,
        1,
        'run:' || inserted_runs.id::text || ':dispatch:1',
        'pending'::private.outbox_status
      from inserted_runs
      returning run_id::text
      `,
      [sourceRunId, count],
    );
    return Object.freeze(inserted.rows.map((row) => row.run_id));
  }

  async function addPressureJobs(
    count: number,
    timestamp = Date.now(),
  ): Promise<readonly string[]> {
    const jobs = await Promise.all(
      Array.from({ length: count }, async () => {
        const runId = randomUUID();
        const jobId = `run-${runId}-generation-1`;
        await queue.add(
          SIMULATION_JOB_NAME,
          {
            dispatch_generation: 1,
            run_id: runId,
            schema_version: 2,
          },
          {
            ...SIMULATION_JOB_OPTIONS,
            jobId,
            timestamp,
          },
        );
        return jobId;
      }),
    );
    return Object.freeze(jobs);
  }

  beforeAll(async () => {
    const catalog = await admin.query<{
      migrated: string | null;
      owner_a: boolean;
      api_password: string | null;
      queue_fence: string | null;
      worker_password: string | null;
    }>(`
      select
        pg_catalog.to_regprocedure(
          'private.claim_run_execution_v2_traced(uuid,smallint,text)'
        )::text as migrated,
        pg_catalog.to_regprocedure(
          'private.set_queue_transport(text,uuid)'
        )::text as queue_fence,
        exists(
          select 1 from auth.users where id = '${OWNER_A}'::uuid
        ) as owner_a,
        (
          select rolpassword from pg_catalog.pg_authid
          where rolname = 'simula_api'
        ) as api_password,
        (
          select rolpassword from pg_catalog.pg_authid
          where rolname = 'simula_worker'
        ) as worker_password
    `);
    const row = catalog.rows[0];
    if (
      row?.migrated === null ||
      row?.queue_fence === null ||
      row?.owner_a !== true
    ) {
      throw new Error(
        "Local PostgreSQL is not the reset SIMULA BullMQ fixture database.",
      );
    }
    originalApiPassword = row.api_password;
    originalWorkerPassword = row.worker_password;
    await admin.query(
      `alter role simula_api password ${sqlLiteral(apiPassword)}`,
    );
    await admin.query(
      `alter role simula_worker password ${sqlLiteral(workerPassword)}`,
    );
    passwordsChanged = true;
    await boundary.start();
    await queue.waitUntilReady();
    await queue.obliterate({ force: true });
    const defaultTransport = await admin.query<{
      active_transport: string;
    }>("select active_transport from private.get_queue_transport_control()");
    const cutoverCorrelationId = randomUUID();
    await admin.query(
      `
      select private.set_run_creation_control(
        false,
        'operator_manual',
        $1::uuid
      )
      `,
      [cutoverCorrelationId],
    );
    const cutover = await admin.query<{ changed: boolean }>(
      "select private.set_queue_transport('bullmq', $1::uuid) as changed",
      [cutoverCorrelationId],
    );
    await admin.query(
      `
      select private.set_run_creation_control(
        true,
        'operator_recovery_verified',
        $1::uuid
      )
      `,
      [cutoverCorrelationId],
    );
    const cutoverState = await admin.query<{
      active_transport: string;
      admission_enabled: boolean;
      audit_count: number;
    }>(
      `
      select
        transport.active_transport,
        controls.enabled as admission_enabled,
        (
          select pg_catalog.count(*)::integer
          from private.audit_events as audit
          where audit.action = 'operator.queue_transport_changed'
        ) as audit_count
      from private.get_queue_transport_control() as transport
      cross join private.runtime_controls as controls
      where controls.control_name = 'run_creation'
      `,
    );
    queueCutoverEvidence = Object.freeze({
      activeTransport: cutoverState.rows[0]?.active_transport ?? "",
      admissionEnabled: cutoverState.rows[0]?.admission_enabled ?? false,
      auditCount: cutoverState.rows[0]?.audit_count ?? 0,
      changed: cutover.rows[0]?.changed ?? false,
      defaultTransport: defaultTransport.rows[0]?.active_transport ?? "",
    });

    const apiUrl = new URL(adminDatabaseUrl);
    apiUrl.username = "simula_api";
    apiUrl.password = apiPassword;
    apiDatabaseUrl = apiUrl.toString();
    const workerUrl = new URL(adminDatabaseUrl);
    workerUrl.username = "simula_worker";
    workerUrl.password = workerPassword;
    workerDatabaseUrl = workerUrl.toString();

    const environment: RuntimeEnvironment = {
      SIMULA_ASSET_STORAGE_ENABLED: "false",
      SIMULA_BEHAVIORAL_ENGINE_TOKEN: "LocalOnlyEngineToken_9rK2mP7xC4vN8sT6",
      SIMULA_BEHAVIORAL_ENGINE_URL: "http://127.0.0.1:9",
      SIMULA_CORS_ORIGINS: "http://127.0.0.1:3000",
      SIMULA_CURSOR_SECRET: "LocalOnlyCursorSecret_7xP2mQ9vK4cN8sT6",
      SIMULA_DATABASE_URL: apiDatabaseUrl,
      SIMULA_ENVIRONMENT: "test",
      SIMULA_NEST_DOMAIN_ENABLED: "true",
      SIMULA_RATE_LIMIT_KEY_PREFIX: ratePrefix,
      SIMULA_REDIS_URL: redisUrl,
      SIMULA_RELEASE_SHA: RELEASE_SHA,
      SIMULA_SUPABASE_JWKS_URL: `${boundary.issuer}/.well-known/jwks.json`,
      SIMULA_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_bullmq_integration",
      SIMULA_SUPABASE_URL: boundary.origin,
      SIMULA_TECHNICAL_VISUAL_PROFILE_ENABLED: "false",
    };
    app = await createApplication(environment);
    await app.init();
    dispatcherPool = createDispatcherPool({
      databaseCaPem: null,
      databaseUrl: workerDatabaseUrl,
      environment: "test",
      redisConnection,
      releaseSha: RELEASE_SHA,
    });
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
    for (const child of activeWorkers) {
      if (child.exitCode === null) child.kill();
    }
    await attempt(async () => {
      await Promise.all(
        [...activeWorkers].map(
          (child) =>
            new Promise<void>((resolveExit) => {
              if (child.exitCode !== null) resolveExit();
              else child.once("exit", () => resolveExit());
            }),
        ),
      );
    });
    await attempt(async () => {
      if (app !== null) await app.close();
    });
    await attempt(async () => {
      if (dispatcherPool !== null) await dispatcherPool.end();
    });
    await attempt(async () => {
      await queue.obliterate({ force: true });
      await queue.close();
    });
    await attempt(async () => {
      const redis = new Redis(redisUrl, {
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
    // This integration requires a disposable fresh database. A completed run
    // spans tables owned by both command and worker roles; bypassing those
    // production ownership boundaries solely for test cleanup would weaken the
    // proof. The outer fixture destroys the complete database after the suite.
    await attempt(async () => {
      await boundary.stop();
    });
    await attempt(async () => {
      if (!passwordsChanged) return;
      if (originalApiPassword === null) {
        await admin.query("alter role simula_api password null");
      } else {
        await admin.query(
          `alter role simula_api password ${sqlLiteral(originalApiPassword)}`,
        );
      }
      if (originalWorkerPassword === null) {
        await admin.query("alter role simula_worker password null");
      } else {
        await admin.query(
          `alter role simula_worker password ${sqlLiteral(originalWorkerPassword)}`,
        );
      }
    });
    await attempt(async () => {
      await admin.end();
    });
    if (cleanupError !== undefined) throw cleanupError;
  });

  it("cuts over a drained default ARQ fixture to durable BullMQ ownership", async () => {
    expect(queueCutoverEvidence).toEqual({
      activeTransport: "bullmq",
      admissionEnabled: true,
      auditCount: 1,
      changed: true,
      defaultTransport: "arq",
    });
    if (dispatcherPool === null) {
      throw new Error("integration dispatcher was not initialized");
    }
    await expect(
      new PgRunOutboxDatabase(dispatcherPool).isReady(),
    ).resolves.toBe(true);
    const workerPool = new Pool({
      connectionString: workerDatabaseUrl,
      connectionTimeoutMillis: 2_000,
      max: 1,
    });
    try {
      await expect(
        workerPool.query(
          "select private.require_queue_transport('bullmq') as active",
        ),
      ).resolves.toMatchObject({ rows: [{ active: true }] });
      await expect(
        workerPool.query(
          "select private.require_queue_transport('arq') as active",
        ),
      ).rejects.toThrow("queue_transport_inactive");
    } finally {
      await workerPool.end();
    }
  });

  it("defers before outbox confirmation, completes once, and rejects duplicate delivery", async () => {
    if (app === null || dispatcherPool === null) {
      throw new Error("integration runtime was not initialized");
    }
    const { jobId, runId } = await createRunFixture("dedupe");

    const firstWorker = startWorker(workerDatabaseUrl, redisUrl, jobId);
    activeWorkers.add(firstWorker);
    await waitForDelayedDelivery(queue, jobId, firstWorker);

    const publisher = app.get<SimulationQueuePort>(SIMULATION_QUEUE_PORT);
    const dispatcher = new RunOutboxDispatcher(
      new PgRunOutboxDatabase(dispatcherPool),
      publisher,
      () => 0,
    );
    await expect(dispatcher.dispatchOnce()).resolves.toEqual({
      canceled: 0,
      claimed: 1,
      confirmed: 1,
      poisoned: 0,
      recovered: 0,
    });
    await expect(dispatcher.dispatchOnce()).resolves.toEqual({
      canceled: 0,
      claimed: 0,
      confirmed: 0,
      poisoned: 0,
      recovered: 0,
    });
    const first = await workerResult(firstWorker);
    activeWorkers.delete(firstWorker);
    expect(first).toEqual({
      attempts_started: 2,
      job_id: jobId,
      state: "completed",
    });

    const durable = await admin.query<{
      attempt_count: string;
      outbox_status: string;
      result_count: string;
      run_state: string;
    }>(
      `
        select
          runs.state::text as run_state,
          pg_catalog.count(distinct attempts.id)::text as attempt_count,
          pg_catalog.count(distinct results.id)::text as result_count,
          pg_catalog.min(outbox.status::text) as outbox_status
        from api.simulation_runs as runs
        left join private.run_attempts as attempts on attempts.run_id = runs.id
        left join api.simulation_results as results on results.run_id = runs.id
        left join private.run_outbox as outbox on outbox.run_id = runs.id
        where runs.id = $1::uuid
        group by runs.id
        `,
      [runId],
    );
    expect(durable.rows).toEqual([
      {
        attempt_count: "1",
        outbox_status: "dispatched",
        result_count: "1",
        run_state: "succeeded",
      },
    ]);

    const completed = await queue.getJob(jobId);
    expect(completed).not.toBeNull();
    await completed?.remove();
    await publisher.publish({
      dispatch_generation: 1,
      run_id: runId,
      schema_version: 2,
    });
    const duplicateWorker = startWorker(workerDatabaseUrl, redisUrl, jobId);
    activeWorkers.add(duplicateWorker);
    const duplicate = await workerResult(duplicateWorker);
    activeWorkers.delete(duplicateWorker);
    expect(duplicate).toEqual({
      attempts_started: 1,
      job_id: jobId,
      state: "completed",
    });
    await expect(
      admin.query<{
        attempt_count: string;
        result_count: string;
        run_state: string;
      }>(
        `
          select
            runs.state::text as run_state,
            pg_catalog.count(distinct attempts.id)::text as attempt_count,
            pg_catalog.count(distinct results.id)::text as result_count
          from api.simulation_runs as runs
          left join private.run_attempts as attempts on attempts.run_id = runs.id
          left join api.simulation_results as results on results.run_id = runs.id
          where runs.id = $1::uuid
          group by runs.id
          `,
        [runId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          attempt_count: "1",
          result_count: "1",
          run_state: "succeeded",
        },
      ],
    });
  }, 30_000);

  it("finalizes queued cancellation before the published job can execute", async () => {
    if (app === null || dispatcherPool === null) {
      throw new Error("integration runtime was not initialized");
    }
    const { jobId, ownerToken, runId } =
      await createRunFixture("queued-cancel");
    const canceled = await request(app.getHttpServer())
      .post(`/api/v2/runs/${runId}/cancel`)
      .set(bearer(ownerToken))
      .send({})
      .expect(202);
    expect(canceled.body).toMatchObject({
      id: runId,
      state: "cancel_requested",
    });

    const publisher = app.get<SimulationQueuePort>(SIMULATION_QUEUE_PORT);
    const dispatcher = new RunOutboxDispatcher(
      new PgRunOutboxDatabase(dispatcherPool),
      publisher,
      () => 0,
    );
    await expect(dispatcher.dispatchOnce()).resolves.toEqual({
      canceled: 1,
      claimed: 0,
      confirmed: 0,
      poisoned: 0,
      recovered: 0,
    });

    const worker = startWorker(workerDatabaseUrl, redisUrl, jobId);
    activeWorkers.add(worker);
    await expect(workerResult(worker)).resolves.toEqual({
      attempts_started: 4,
      job_id: jobId,
      state: "completed",
    });
    activeWorkers.delete(worker);
    await expect(
      admin.query<{
        attempt_count: string;
        outbox_error: string;
        outbox_status: string;
        result_count: string;
        run_state: string;
      }>(
        `
        select
          runs.state::text as run_state,
          pg_catalog.count(distinct attempts.id)::text as attempt_count,
          pg_catalog.count(distinct results.id)::text as result_count,
          pg_catalog.min(outbox.status::text) as outbox_status,
          pg_catalog.min(outbox.terminal_error_code) as outbox_error
        from api.simulation_runs as runs
        left join private.run_attempts as attempts on attempts.run_id = runs.id
        left join api.simulation_results as results on results.run_id = runs.id
        left join private.run_outbox as outbox on outbox.run_id = runs.id
        where runs.id = $1::uuid
        group by runs.id
        `,
        [runId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          attempt_count: "0",
          outbox_error: "canceled",
          outbox_status: "terminal",
          result_count: "0",
          run_state: "canceled",
        },
      ],
    });
  }, 30_000);

  it("recovers a hard worker crash through an expired lease and new generation", async () => {
    if (app === null || dispatcherPool === null) {
      throw new Error("integration runtime was not initialized");
    }
    const { jobId, runId } = await createRunFixture("hard-crash");
    const publisher = app.get<SimulationQueuePort>(SIMULATION_QUEUE_PORT);
    const initialDispatcher = new RunOutboxDispatcher(
      new PgRunOutboxDatabase(dispatcherPool),
      publisher,
      () => 0,
    );
    await expect(initialDispatcher.dispatchOnce()).resolves.toEqual({
      canceled: 0,
      claimed: 1,
      confirmed: 1,
      poisoned: 0,
      recovered: 0,
    });

    const crashed = startWorker(
      workerDatabaseUrl,
      redisUrl,
      jobId,
      "crash_after_claim",
    );
    activeWorkers.add(crashed);
    await workerCrash(crashed, jobId);
    activeWorkers.delete(crashed);
    const abandoned = await queue.getJob(jobId);
    expect(abandoned).not.toBeNull();
    await expect(abandoned?.getState()).resolves.toBe("active");
    await expect(
      admin.query<{
        attempt_count: number;
        run_state: string;
      }>(
        `
        select state::text as run_state, attempt_count
        from api.simulation_runs
        where id = $1::uuid
        `,
        [runId],
      ),
    ).resolves.toMatchObject({
      rows: [{ attempt_count: 1, run_state: "running" }],
    });

    await admin.query(
      `
      update api.simulation_runs
      set worker_lease_expires_at =
            pg_catalog.statement_timestamp() - interval '1 second',
          last_progress_at =
            pg_catalog.statement_timestamp() - interval '121 seconds'
      where id = $1::uuid
      `,
      [runId],
    );
    await admin.query(
      `
      update private.run_attempts
      set lease_expires_at =
            pg_catalog.statement_timestamp() - interval '1 second'
      where run_id = $1::uuid
        and status = 'running'
      `,
      [runId],
    );
    const recoveryDispatcher = new RunOutboxDispatcher(
      new PgRunOutboxDatabase(dispatcherPool),
      publisher,
      () => 0,
    );
    await expect(recoveryDispatcher.dispatchOnce()).resolves.toEqual({
      canceled: 0,
      claimed: 1,
      confirmed: 1,
      poisoned: 0,
      recovered: 1,
    });

    const recoveredJobId = `run-${runId}-generation-2`;
    const recoveryWorker = startWorker(
      workerDatabaseUrl,
      redisUrl,
      recoveredJobId,
    );
    activeWorkers.add(recoveryWorker);
    await expect(workerResult(recoveryWorker)).resolves.toEqual({
      attempts_started: 1,
      job_id: recoveredJobId,
      state: "completed",
    });
    activeWorkers.delete(recoveryWorker);

    const durable = await admin.query<{
      attempt_count: number;
      result_count: string;
      run_state: string;
    }>(
      `
      select
        runs.state::text as run_state,
        runs.attempt_count,
        pg_catalog.count(results.id)::text as result_count
      from api.simulation_runs as runs
      left join api.simulation_results as results on results.run_id = runs.id
      where runs.id = $1::uuid
      group by runs.id
      `,
      [runId],
    );
    expect(durable.rows).toEqual([
      {
        attempt_count: 2,
        result_count: "1",
        run_state: "succeeded",
      },
    ]);
    await expect(
      admin.query<{
        attempt_number: number;
        safe_error_code: string | null;
        status: string;
      }>(
        `
        select attempt_number, status::text, safe_error_code
        from private.run_attempts
        where run_id = $1::uuid
        order by attempt_number
        `,
        [runId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          attempt_number: 1,
          safe_error_code: "recovered_stale_dispatch",
          status: "superseded",
        },
        {
          attempt_number: 2,
          safe_error_code: null,
          status: "succeeded",
        },
      ],
    });
    await expect(
      admin.query<{
        generation: number;
        status: string;
        terminal_error_code: string | null;
      }>(
        `
        select generation, status::text, terminal_error_code
        from private.run_outbox
        where run_id = $1::uuid
        order by generation
        `,
        [runId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          generation: 1,
          status: "terminal",
          terminal_error_code: "recovery_replaced",
        },
        {
          generation: 2,
          status: "dispatched",
          terminal_error_code: null,
        },
      ],
    });
  }, 30_000);

  it("settles a running cancellation without persisting a provider result", async () => {
    if (app === null || dispatcherPool === null) {
      throw new Error("integration runtime was not initialized");
    }
    const { jobId, ownerToken, runId } =
      await createRunFixture("running-cancel");
    const dispatcher = new RunOutboxDispatcher(
      new PgRunOutboxDatabase(dispatcherPool),
      app.get<SimulationQueuePort>(SIMULATION_QUEUE_PORT),
      () => 0,
    );
    await expect(dispatcher.dispatchOnce()).resolves.toEqual({
      canceled: 0,
      claimed: 1,
      confirmed: 1,
      poisoned: 0,
      recovered: 0,
    });

    const worker = startWorker(
      workerDatabaseUrl,
      redisUrl,
      jobId,
      "pause_in_provider",
    );
    activeWorkers.add(worker);
    await waitForWorkerOutput(
      worker,
      `SIMULA_BULLMQ_PROVIDER_STARTED={"job_id":"${jobId}"}`,
    );
    await expect(
      admin.query<{
        attempt_count: number;
        attempt_status: string;
        run_state: string;
      }>(
        `
        select
          runs.state::text as run_state,
          runs.attempt_count,
          attempts.status::text as attempt_status
        from api.simulation_runs as runs
        join private.run_attempts as attempts on attempts.run_id = runs.id
        where runs.id = $1::uuid
        `,
        [runId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          attempt_count: 1,
          attempt_status: "running",
          run_state: "running",
        },
      ],
    });

    const canceled = await request(app.getHttpServer())
      .post(`/api/v2/runs/${runId}/cancel`)
      .set(bearer(ownerToken))
      .send({})
      .expect(202);
    expect(canceled.body).toMatchObject({
      id: runId,
      state: "cancel_requested",
    });
    worker.stdin.end("continue\n");
    await expect(workerResult(worker)).resolves.toEqual({
      attempts_started: 1,
      job_id: jobId,
      state: "completed",
    });
    activeWorkers.delete(worker);

    await expect(
      admin.query<{
        attempt_error: string;
        attempt_status: string;
        outbox_error: string;
        outbox_status: string;
        result_count: string;
        run_state: string;
      }>(
        `
        select
          runs.state::text as run_state,
          attempts.status::text as attempt_status,
          attempts.safe_error_code as attempt_error,
          outbox.status::text as outbox_status,
          outbox.terminal_error_code as outbox_error,
          pg_catalog.count(results.id)::text as result_count
        from api.simulation_runs as runs
        join private.run_attempts as attempts on attempts.run_id = runs.id
        join private.run_outbox as outbox on outbox.run_id = runs.id
        left join api.simulation_results as results on results.run_id = runs.id
        where runs.id = $1::uuid
        group by runs.id, attempts.id, outbox.id
        `,
        [runId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          attempt_error: "canceled_by_user",
          attempt_status: "canceled",
          outbox_error: "canceled",
          outbox_status: "terminal",
          result_count: "0",
          run_state: "canceled",
        },
      ],
    });
  }, 30_000);

  it("executes, replays, deduplicates, and deletes one governed behavioral run", async () => {
    if (app === null || dispatcherPool === null) {
      throw new Error("integration runtime was not initialized");
    }
    const {
      idempotencyKey,
      jobId,
      ownerToken,
      projectId,
      runId,
      stimulusVersionId,
    } = await createRunFixture("behavioral", "behavioral");
    const publisher = app.get<SimulationQueuePort>(SIMULATION_QUEUE_PORT);
    const dispatcher = new RunOutboxDispatcher(
      new PgRunOutboxDatabase(dispatcherPool),
      publisher,
      () => 0,
    );
    await expect(dispatcher.dispatchOnce()).resolves.toEqual({
      canceled: 0,
      claimed: 1,
      confirmed: 1,
      poisoned: 0,
      recovered: 0,
    });

    const worker = startWorker(
      workerDatabaseUrl,
      redisUrl,
      jobId,
      "behavioral",
    );
    activeWorkers.add(worker);
    await expect(workerResult(worker)).resolves.toEqual({
      attempts_started: 1,
      job_id: jobId,
      state: "completed",
    });
    activeWorkers.delete(worker);

    const response = await request(app.getHttpServer())
      .get(`/api/v2/runs/${runId}/behavioral-result`)
      .set(bearer(ownerToken))
      .expect(200);
    expect(response.body).toMatchObject({
      provider_calls: 10,
      provider_id: "deterministic_tiered",
      run_id: runId,
      validation_label: "experimental",
      report: {
        validation_label: "experimental",
      },
    });
    await expect(
      admin.query<{
        artifact_size_bytes: number;
        checksum_valid: boolean;
        payload_count: string;
        provider_calls: number;
        receipt_count: string;
        result_count: string;
        run_state: string;
      }>(
        `
        select
          runs.state::text as run_state,
          results.provider_calls,
          results.artifact_size_bytes,
          pg_catalog.count(distinct results.id)::text as result_count,
          pg_catalog.count(distinct receipts.run_id)::text as receipt_count,
          pg_catalog.count(distinct payloads.run_id)::text as payload_count,
          pg_catalog.bool_and(
            results.artifact_sha256 = pg_catalog.encode(
              extensions.digest(payloads.canonical_artifact, 'sha256'),
              'hex'
            )
          ) as checksum_valid
        from api.simulation_runs as runs
        join api.behavioral_run_results as results on results.run_id = runs.id
        join private.behavioral_result_payloads as payloads
          on payloads.run_id = runs.id
        join private.behavioral_provider_receipts as receipts
          on receipts.run_id = runs.id
        where runs.id = $1::uuid
        group by runs.id, results.id
        `,
        [runId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          checksum_valid: true,
          payload_count: "1",
          provider_calls: 10,
          receipt_count: "1",
          result_count: "1",
          run_state: "succeeded",
        },
      ],
    });

    const replayed = await request(app.getHttpServer())
      .post(`/api/v2/projects/${projectId}/behavioral-demo-runs`)
      .set(bearer(ownerToken))
      .set("Idempotency-Key", idempotencyKey)
      .send({
        stimulus_version_id: stimulusVersionId,
        variant_key: "baseline",
      })
      .expect(202);
    expect(replayed.headers["idempotent-replayed"]).toBe("true");
    expect(replayed.body).toMatchObject({
      dispatch_generation: 1,
      id: runId,
      state: "queued",
    });

    const replayedJob = await queue.getJob(jobId);
    expect(replayedJob).not.toBeNull();
    await expect(replayedJob?.getState()).resolves.toBe("completed");
    await replayedJob?.remove();
    await publisher.publish({
      dispatch_generation: 1,
      run_id: runId,
      schema_version: 2,
    });
    const duplicateWorker = startWorker(workerDatabaseUrl, redisUrl, jobId);
    activeWorkers.add(duplicateWorker);
    await expect(workerResult(duplicateWorker)).resolves.toEqual({
      attempts_started: 1,
      job_id: jobId,
      state: "completed",
    });
    activeWorkers.delete(duplicateWorker);

    await expect(
      admin.query<{
        one_action_set: boolean;
        one_agent_memory_set: boolean;
        one_agent_public_set: boolean;
        one_attempt: boolean;
        one_context_graph: boolean;
        one_fleet: boolean;
        one_fleet_summary: boolean;
        one_outbox: boolean;
        one_payload: boolean;
        one_receipt: boolean;
        one_report_evidence_set: boolean;
        one_result: boolean;
        one_round_summary: boolean;
      }>(
        `
        select
          (
            select pg_catalog.count(*) = 1
            from private.run_attempts where run_id = $1::uuid
          ) as one_attempt,
          (
            select pg_catalog.count(*) = 1
            from private.run_outbox where run_id = $1::uuid
          ) as one_outbox,
          (
            select pg_catalog.count(*) = 1
            from api.behavioral_run_results where run_id = $1::uuid
          ) as one_result,
          (
            select pg_catalog.count(*) = 1
            from private.behavioral_result_payloads where run_id = $1::uuid
          ) as one_payload,
          (
            select pg_catalog.count(*) = 1
            from private.behavioral_provider_receipts where run_id = $1::uuid
          ) as one_receipt,
          (
            select pg_catalog.count(*) = 1
            from api.context_graph_versions where run_id = $1::uuid
          ) as one_context_graph,
          (
            select pg_catalog.count(*) = 1
            from private.behavioral_agent_fleets where run_id = $1::uuid
          ) as one_fleet,
          (
            select pg_catalog.count(*) = 10
            from private.behavioral_action_events where run_id = $1::uuid
          ) as one_action_set,
          (
            select pg_catalog.count(*) = 10
            from private.behavioral_agent_memories where run_id = $1::uuid
          ) as one_agent_memory_set,
          (
            select pg_catalog.count(*) > 0
            from api.behavioral_report_evidence where run_id = $1::uuid
          ) as one_report_evidence_set,
          (
            select pg_catalog.count(*) = 1
            from api.behavioral_fleet_summaries where run_id = $1::uuid
          ) as one_fleet_summary,
          (
            select pg_catalog.count(*) = 1
            from api.behavioral_round_summaries where run_id = $1::uuid
          ) as one_round_summary,
          (
            select pg_catalog.count(*) = 10
            from api.behavioral_agent_public_summaries where run_id = $1::uuid
          ) as one_agent_public_set
        `,
        [runId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          one_action_set: true,
          one_agent_memory_set: true,
          one_agent_public_set: true,
          one_attempt: true,
          one_context_graph: true,
          one_fleet: true,
          one_fleet_summary: true,
          one_outbox: true,
          one_payload: true,
          one_receipt: true,
          one_report_evidence_set: true,
          one_result: true,
          one_round_summary: true,
        },
      ],
    });

    const duplicateJob = await queue.getJob(jobId);
    await duplicateJob?.remove();
    await expect(
      admin.query(
        `
        delete from api.simulation_runs
        where id = $1::uuid
        returning id
        `,
        [runId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      admin.query<{
        derived_count: string;
      }>(
        `
        select (
          (select pg_catalog.count(*) from api.simulation_runs
            where id = $1::uuid)
          + (select pg_catalog.count(*) from private.run_attempts
            where run_id = $1::uuid)
          + (select pg_catalog.count(*) from private.run_events
            where run_id = $1::uuid)
          + (select pg_catalog.count(*) from private.run_outbox
            where run_id = $1::uuid)
          + (select pg_catalog.count(*) from api.behavioral_run_results
            where run_id = $1::uuid)
          + (select pg_catalog.count(*) from private.behavioral_result_payloads
            where run_id = $1::uuid)
          + (select pg_catalog.count(*) from private.behavioral_provider_receipts
            where run_id = $1::uuid)
          + (select pg_catalog.count(*) from api.context_graph_versions
            where run_id = $1::uuid)
          + (select pg_catalog.count(*) from private.behavioral_agent_fleets
            where run_id = $1::uuid)
          + (select pg_catalog.count(*) from private.behavioral_action_events
            where run_id = $1::uuid)
          + (select pg_catalog.count(*) from private.behavioral_agent_memories
            where run_id = $1::uuid)
          + (select pg_catalog.count(*) from api.behavioral_report_evidence
            where run_id = $1::uuid)
          + (select pg_catalog.count(*) from api.behavioral_fleet_summaries
            where run_id = $1::uuid)
          + (select pg_catalog.count(*) from api.behavioral_round_summaries
            where run_id = $1::uuid)
          + (select pg_catalog.count(*)
            from api.behavioral_agent_public_summaries
            where run_id = $1::uuid)
        )::text as derived_count
        `,
        [runId],
      ),
    ).resolves.toMatchObject({ rows: [{ derived_count: "0" }] });
  }, 45_000);

  it("recovers a behavioral run after hard process loss before engine execution", async () => {
    if (app === null || dispatcherPool === null) {
      throw new Error("integration runtime was not initialized");
    }
    const { jobId, runId } = await createRunFixture(
      "behavioral-crash",
      "behavioral",
    );
    const publisher = app.get<SimulationQueuePort>(SIMULATION_QUEUE_PORT);
    const initialDispatcher = new RunOutboxDispatcher(
      new PgRunOutboxDatabase(dispatcherPool),
      publisher,
      () => 0,
    );
    await expect(initialDispatcher.dispatchOnce()).resolves.toEqual({
      canceled: 0,
      claimed: 1,
      confirmed: 1,
      poisoned: 0,
      recovered: 0,
    });

    const crashed = startWorker(
      workerDatabaseUrl,
      redisUrl,
      jobId,
      "crash_after_claim",
    );
    activeWorkers.add(crashed);
    await workerCrash(crashed, jobId);
    activeWorkers.delete(crashed);
    const abandoned = await queue.getJob(jobId);
    expect(abandoned).not.toBeNull();
    await expect(abandoned?.getState()).resolves.toBe("active");
    await expect(
      admin.query<{
        attempt_count: number;
        result_count: string;
        run_state: string;
      }>(
        `
        select
          runs.state::text as run_state,
          runs.attempt_count,
          pg_catalog.count(results.run_id)::text as result_count
        from api.simulation_runs as runs
        left join api.behavioral_run_results as results
          on results.run_id = runs.id
        where runs.id = $1::uuid
        group by runs.id
        `,
        [runId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          attempt_count: 1,
          result_count: "0",
          run_state: "running",
        },
      ],
    });

    await admin.query(
      `
      update api.simulation_runs
      set worker_lease_expires_at =
            pg_catalog.statement_timestamp() - interval '1 second',
          last_progress_at =
            pg_catalog.statement_timestamp() - interval '121 seconds'
      where id = $1::uuid
      `,
      [runId],
    );
    await admin.query(
      `
      update private.run_attempts
      set lease_expires_at =
            pg_catalog.statement_timestamp() - interval '1 second'
      where run_id = $1::uuid
        and status = 'running'
      `,
      [runId],
    );
    const recoveryDispatcher = new RunOutboxDispatcher(
      new PgRunOutboxDatabase(dispatcherPool),
      publisher,
      () => 0,
    );
    await expect(recoveryDispatcher.dispatchOnce()).resolves.toEqual({
      canceled: 0,
      claimed: 1,
      confirmed: 1,
      poisoned: 0,
      recovered: 1,
    });

    const recoveredJobId = `run-${runId}-generation-2`;
    const recoveryWorker = startWorker(
      workerDatabaseUrl,
      redisUrl,
      recoveredJobId,
      "behavioral",
    );
    activeWorkers.add(recoveryWorker);
    await expect(workerResult(recoveryWorker)).resolves.toEqual({
      attempts_started: 1,
      job_id: recoveredJobId,
      state: "completed",
    });
    activeWorkers.delete(recoveryWorker);

    await expect(
      admin.query<{
        attempt_count: number;
        checksum_valid: boolean;
        payload_count: string;
        receipt_count: string;
        result_count: string;
        run_state: string;
      }>(
        `
        select
          runs.state::text as run_state,
          runs.attempt_count,
          pg_catalog.count(distinct results.run_id)::text as result_count,
          pg_catalog.count(distinct payloads.run_id)::text as payload_count,
          pg_catalog.count(distinct receipts.run_id)::text as receipt_count,
          pg_catalog.bool_and(
            results.artifact_sha256 = pg_catalog.encode(
              extensions.digest(payloads.canonical_artifact, 'sha256'),
              'hex'
            )
          ) as checksum_valid
        from api.simulation_runs as runs
        join api.behavioral_run_results as results on results.run_id = runs.id
        join private.behavioral_result_payloads as payloads
          on payloads.run_id = runs.id
        join private.behavioral_provider_receipts as receipts
          on receipts.run_id = runs.id
        where runs.id = $1::uuid
        group by runs.id
        `,
        [runId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          attempt_count: 2,
          checksum_valid: true,
          payload_count: "1",
          receipt_count: "1",
          result_count: "1",
          run_state: "succeeded",
        },
      ],
    });
    await expect(
      admin.query<{
        attempt_number: number;
        safe_error_code: string | null;
        status: string;
      }>(
        `
        select attempt_number, status::text, safe_error_code
        from private.run_attempts
        where run_id = $1::uuid
        order by attempt_number
        `,
        [runId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          attempt_number: 1,
          safe_error_code: "recovered_stale_dispatch",
          status: "superseded",
        },
        {
          attempt_number: 2,
          safe_error_code: null,
          status: "succeeded",
        },
      ],
    });
    await expect(
      admin.query<{
        generation: number;
        status: string;
        terminal_error_code: string | null;
      }>(
        `
        select generation, status::text, terminal_error_code
        from private.run_outbox
        where run_id = $1::uuid
        order by generation
        `,
        [runId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          generation: 1,
          status: "terminal",
          terminal_error_code: "recovery_replaced",
        },
        {
          generation: 2,
          status: "dispatched",
          terminal_error_code: null,
        },
      ],
    });
  }, 45_000);

  it("feeds real BullMQ depth, age, and memory pressure into run admission", async () => {
    if (app === null || dispatcherPool === null) {
      throw new Error("integration runtime was not initialized");
    }
    const fixture = await createRunFixture("bullmq-pressure");
    const database = new PgRunOutboxDatabase(dispatcherPool);
    const transport = new BullMqSimulationQueue(queue);
    const retainedJobIds = new Set<string>();
    const apiPool = new Pool({
      connectionString: apiDatabaseUrl,
      connectionTimeoutMillis: 2_000,
      max: 1,
    });
    try {
      await expect(
        apiPool.query(
          "select * from private.update_bullmq_run_pressure(0, 0, 0)",
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await removeQueueJobs([fixture.jobId]);
      await deleteProjectRuns(fixture.projectId);

      const depthJobs = await addPressureJobs(100);
      for (const jobId of depthJobs) retainedJobIds.add(jobId);
      const fullSnapshot = await transport.snapshot();
      expect(fullSnapshot.depth).toBe(100);
      expect(fullSnapshot.oldestReadyAgeSeconds).toBeLessThan(60);
      await database.updateBullMqRunPressure(
        fullSnapshot.depth,
        fullSnapshot.oldestReadyAgeSeconds,
        fullSnapshot.memoryPercent,
      );
      const depthBlocked = await request(app.getHttpServer())
        .post(`/api/v2/projects/${fixture.projectId}/runs`)
        .set(bearer(fixture.ownerToken))
        .set("Idempotency-Key", `bullmq-depth-blocked-${randomUUID()}`)
        .send({ stimulus_version_id: fixture.stimulusVersionId })
        .expect(503);
      expect(depthBlocked.body).toMatchObject({ code: "queue_backpressure" });
      await expect(
        admin.query(
          `
          select bullmq_pressure_reason
          from private.runtime_controls
          where control_name = 'run_creation'
          `,
        ),
      ).resolves.toMatchObject({
        rows: [{ bullmq_pressure_reason: "bullmq_depth_high" }],
      });

      const removedDepthJobId = depthJobs[0];
      if (removedDepthJobId === undefined) {
        throw new Error("BullMQ pressure fixture created no jobs");
      }
      await removeQueueJobs([removedDepthJobId]);
      retainedJobIds.delete(removedDepthJobId);
      const recoveredDepthSnapshot = await transport.snapshot();
      expect(recoveredDepthSnapshot.depth).toBe(99);
      await database.updateBullMqRunPressure(
        recoveredDepthSnapshot.depth,
        recoveredDepthSnapshot.oldestReadyAgeSeconds,
        recoveredDepthSnapshot.memoryPercent,
      );
      await resetRunCreateRateBuckets();
      const depthRecovered = await createAdditionalRun(
        fixture,
        "bullmq-depth-recovered",
      );
      retainedJobIds.add(depthRecovered.jobId);

      await removeQueueJobs([...retainedJobIds]);
      retainedJobIds.clear();
      await deleteProjectRuns(fixture.projectId);

      const oldJobs = await addPressureJobs(1, Date.now() - 61_000);
      const oldJobId = oldJobs[0];
      if (oldJobId === undefined) {
        throw new Error("BullMQ age fixture created no job");
      }
      retainedJobIds.add(oldJobId);
      const oldSnapshot = await transport.snapshot();
      expect(oldSnapshot.depth).toBe(1);
      expect(oldSnapshot.oldestReadyAgeSeconds).toBeGreaterThanOrEqual(60);
      await database.updateBullMqRunPressure(
        oldSnapshot.depth,
        oldSnapshot.oldestReadyAgeSeconds,
        oldSnapshot.memoryPercent,
      );
      const ageBlocked = await request(app.getHttpServer())
        .post(`/api/v2/projects/${fixture.projectId}/runs`)
        .set(bearer(fixture.ownerToken))
        .set("Idempotency-Key", `bullmq-age-blocked-${randomUUID()}`)
        .send({ stimulus_version_id: fixture.stimulusVersionId })
        .expect(503);
      expect(ageBlocked.body).toMatchObject({ code: "queue_backpressure" });

      await removeQueueJobs([oldJobId]);
      retainedJobIds.delete(oldJobId);
      const freshJobs = await addPressureJobs(1, Date.now() - 30_000);
      const freshJobId = freshJobs[0];
      if (freshJobId === undefined) {
        throw new Error("BullMQ fresh-age fixture created no job");
      }
      retainedJobIds.add(freshJobId);
      const freshSnapshot = await transport.snapshot();
      expect(freshSnapshot.oldestReadyAgeSeconds).toBeLessThan(60);
      await database.updateBullMqRunPressure(
        freshSnapshot.depth,
        freshSnapshot.oldestReadyAgeSeconds,
        freshSnapshot.memoryPercent,
      );
      await resetRunCreateRateBuckets();
      const ageRecovered = await createAdditionalRun(
        fixture,
        "bullmq-age-recovered",
      );
      retainedJobIds.add(ageRecovered.jobId);

      await database.updateBullMqRunPressure(0, 0, 80);
      const memoryBlocked = await request(app.getHttpServer())
        .post(`/api/v2/projects/${fixture.projectId}/runs`)
        .set(bearer(fixture.ownerToken))
        .set("Idempotency-Key", `bullmq-memory-blocked-${randomUUID()}`)
        .send({ stimulus_version_id: fixture.stimulusVersionId })
        .expect(503);
      expect(memoryBlocked.body).toMatchObject({ code: "queue_backpressure" });
      await database.updateBullMqRunPressure(0, 0, 79.9);
      await resetRunCreateRateBuckets();
      const memoryRecovered = await createAdditionalRun(
        fixture,
        "bullmq-memory-recovered",
      );
      retainedJobIds.add(memoryRecovered.jobId);
    } finally {
      try {
        await database.updateBullMqRunPressure(0, 0, 0);
        await removeQueueJobs([...retainedJobIds]);
        await deleteProjectRuns(fixture.projectId);
      } finally {
        await apiPool.end();
      }
    }
  }, 30_000);

  it("enforces organization pending 20 and active execution slots 3 through v2", async () => {
    if (app === null || dispatcherPool === null) {
      throw new Error("integration runtime was not initialized");
    }
    const pendingFixture = await createRunFixture("organization-pending");
    const pendingJobIds = [pendingFixture.jobId];
    try {
      await expect(
        seedPendingRunCopies(pendingFixture.runId, 18),
      ).resolves.toHaveLength(18);
      const twentieth = await createAdditionalRun(
        pendingFixture,
        "organization-pending-twentieth",
      );
      pendingJobIds.push(twentieth.jobId);
      await resetRunCreateRateBuckets();
      const blocked = await request(app.getHttpServer())
        .post(`/api/v2/projects/${pendingFixture.projectId}/runs`)
        .set(bearer(pendingFixture.ownerToken))
        .set("Idempotency-Key", `organization-pending-blocked-${randomUUID()}`)
        .send({ stimulus_version_id: pendingFixture.stimulusVersionId })
        .expect(429);
      expect(blocked.body).toMatchObject({ code: "quota_exceeded" });
      const replayed = await request(app.getHttpServer())
        .post(`/api/v2/projects/${pendingFixture.projectId}/runs`)
        .set(bearer(pendingFixture.ownerToken))
        .set("Idempotency-Key", pendingFixture.idempotencyKey)
        .send({ stimulus_version_id: pendingFixture.stimulusVersionId })
        .expect(202);
      expect(replayed.headers["idempotent-replayed"]).toBe("true");
      expect(replayed.body.id).toBe(pendingFixture.runId);
      await expect(
        admin.query(
          `
          select pg_catalog.count(*)::integer as pending_count
          from api.simulation_runs
          where project_id = $1::uuid
            and state in ('queued', 'running', 'retrying', 'cancel_requested')
          `,
          [pendingFixture.projectId],
        ),
      ).resolves.toMatchObject({ rows: [{ pending_count: 20 }] });
    } finally {
      await removeQueueJobs(pendingJobIds);
      await deleteProjectRuns(pendingFixture.projectId);
    }

    const activeFixture = await createRunFixture("organization-active");
    const activeRuns: RunIdentity[] = [
      {
        idempotencyKey: activeFixture.idempotencyKey,
        jobId: activeFixture.jobId,
        runId: activeFixture.runId,
      },
    ];
    const workerPool = new Pool({
      connectionString: workerDatabaseUrl,
      connectionTimeoutMillis: 2_000,
      max: 4,
    });
    try {
      await resetRunCreateRateBuckets();
      activeRuns.push(
        await createAdditionalRun(activeFixture, "organization-active-2"),
        await createAdditionalRun(activeFixture, "organization-active-3"),
      );
      await resetRunCreateRateBuckets();
      activeRuns.push(
        await createAdditionalRun(activeFixture, "organization-active-4"),
      );
      const dispatcher = new RunOutboxDispatcher(
        new PgRunOutboxDatabase(dispatcherPool),
        app.get<SimulationQueuePort>(SIMULATION_QUEUE_PORT),
        () => 0,
      );
      await expect(dispatcher.dispatchOnce()).resolves.toEqual({
        canceled: 0,
        claimed: 4,
        confirmed: 4,
        poisoned: 0,
        recovered: 0,
      });

      const claims = await Promise.all(
        activeRuns.map(async (run) => {
          const result = await workerPool.query<{
            attempt_id: string | null;
            claim_status: string;
          }>(
            `
            select claim_status, attempt_id
            from private.claim_run_execution_v2_traced(
              $1::uuid,
              1::smallint,
              $2::text
            )
            `,
            [run.runId, run.jobId],
          );
          const claim = result.rows[0];
          if (claim === undefined) {
            throw new Error("worker claim returned no row");
          }
          return Object.freeze({ ...claim, run });
        }),
      );
      expect(
        claims.filter((claim) => claim.claim_status === "claimed"),
      ).toHaveLength(3);
      const capacityClaim = claims.find(
        (claim) => claim.claim_status === "organization_capacity",
      );
      expect(capacityClaim).toBeDefined();
      expect(capacityClaim?.attempt_id).toBeNull();

      const claimedRuns = claims.filter(
        (claim) => claim.claim_status === "claimed",
      );
      for (const claim of claimedRuns) {
        await request(app.getHttpServer())
          .post(`/api/v2/runs/${claim.run.runId}/cancel`)
          .set(bearer(activeFixture.ownerToken))
          .send({})
          .expect(202);
      }
      const capacityRun = capacityClaim?.run;
      if (capacityRun === undefined) {
        throw new Error("organization capacity run disappeared");
      }
      await expect(
        workerPool.query(
          `
          select claim_status
          from private.claim_run_execution_v2_traced(
            $1::uuid,
            1::smallint,
            $2::text
          )
          `,
          [capacityRun.runId, capacityRun.jobId],
        ),
      ).resolves.toMatchObject({
        rows: [{ claim_status: "organization_capacity" }],
      });

      const expiringRun = claimedRuns[0]?.run;
      if (expiringRun === undefined) {
        throw new Error("organization active fixture has no claimed run");
      }
      await admin.query(
        `
        update api.simulation_runs
        set worker_lease_expires_at =
              pg_catalog.statement_timestamp() - interval '1 second'
        where id = $1::uuid
        `,
        [expiringRun.runId],
      );
      await admin.query(
        `
        update private.run_attempts
        set lease_expires_at =
              pg_catalog.statement_timestamp() - interval '1 second'
        where run_id = $1::uuid
          and status = 'running'
        `,
        [expiringRun.runId],
      );
      await expect(
        workerPool.query(
          `
          select claim_status
          from private.claim_run_execution_v2_traced(
            $1::uuid,
            1::smallint,
            $2::text
          )
          `,
          [capacityRun.runId, capacityRun.jobId],
        ),
      ).resolves.toMatchObject({ rows: [{ claim_status: "claimed" }] });
      await expect(
        admin.query(
          `
          select pg_catalog.count(*)::integer as attempt_count
          from private.run_attempts
          where run_id = any($1::uuid[])
          `,
          [activeRuns.map((run) => run.runId)],
        ),
      ).resolves.toMatchObject({ rows: [{ attempt_count: 4 }] });
    } finally {
      await workerPool.end();
      await removeQueueJobs(activeRuns.map((run) => run.jobId));
      await deleteProjectRuns(activeFixture.projectId);
    }
  }, 30_000);

  it("observes the production BullMQ stall window before database recovery", async () => {
    if (app === null || dispatcherPool === null) {
      throw new Error("integration runtime was not initialized");
    }
    const { jobId, runId } = await createRunFixture("bullmq-stalled");
    const publisher = app.get<SimulationQueuePort>(SIMULATION_QUEUE_PORT);
    const initialDispatcher = new RunOutboxDispatcher(
      new PgRunOutboxDatabase(dispatcherPool),
      publisher,
      () => 0,
    );
    await expect(initialDispatcher.dispatchOnce()).resolves.toMatchObject({
      claimed: 1,
      confirmed: 1,
    });

    const crashed = startWorker(
      workerDatabaseUrl,
      redisUrl,
      jobId,
      "crash_after_claim",
    );
    activeWorkers.add(crashed);
    await workerCrash(crashed, jobId);
    activeWorkers.delete(crashed);
    const stalledAt = Date.now();
    const stalledWorker = startWorker(
      workerDatabaseUrl,
      redisUrl,
      jobId,
      "settle_stalled",
    );
    activeWorkers.add(stalledWorker);
    await expect(workerResult(stalledWorker)).resolves.toEqual({
      attempts_started: 2,
      job_id: jobId,
      state: "completed",
    });
    activeWorkers.delete(stalledWorker);
    const stallElapsedMilliseconds = Date.now() - stalledAt;
    expect(stallElapsedMilliseconds).toBeGreaterThanOrEqual(27_000);
    expect(stallElapsedMilliseconds).toBeLessThan(70_000);
    await expect(
      admin.query(
        `
        select
          state::text as run_state,
          attempt_count,
          (
            select pg_catalog.count(*)::integer
            from api.simulation_results
            where run_id = runs.id
          ) as result_count
        from api.simulation_runs as runs
        where id = $1::uuid
        `,
        [runId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          attempt_count: 1,
          result_count: 0,
          run_state: "running",
        },
      ],
    });

    await admin.query(
      `
      update api.simulation_runs
      set worker_lease_expires_at =
            pg_catalog.statement_timestamp() - interval '1 second',
          last_progress_at =
            pg_catalog.statement_timestamp() - interval '121 seconds'
      where id = $1::uuid
      `,
      [runId],
    );
    await admin.query(
      `
      update private.run_attempts
      set lease_expires_at =
            pg_catalog.statement_timestamp() - interval '1 second'
      where run_id = $1::uuid
        and status = 'running'
      `,
      [runId],
    );
    const recoveryDispatcher = new RunOutboxDispatcher(
      new PgRunOutboxDatabase(dispatcherPool),
      publisher,
      () => 0,
    );
    await expect(recoveryDispatcher.dispatchOnce()).resolves.toMatchObject({
      claimed: 1,
      confirmed: 1,
      recovered: 1,
    });
    const recoveredJobId = `run-${runId}-generation-2`;
    const recoveredWorker = startWorker(
      workerDatabaseUrl,
      redisUrl,
      recoveredJobId,
    );
    activeWorkers.add(recoveredWorker);
    await expect(workerResult(recoveredWorker)).resolves.toEqual({
      attempts_started: 1,
      job_id: recoveredJobId,
      state: "completed",
    });
    activeWorkers.delete(recoveredWorker);
    await expect(
      admin.query(
        `
        select
          state::text as run_state,
          attempt_count,
          (
            select pg_catalog.count(*)::integer
            from api.simulation_results
            where run_id = runs.id
          ) as result_count
        from api.simulation_runs as runs
        where id = $1::uuid
        `,
        [runId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          attempt_count: 2,
          result_count: 1,
          run_state: "succeeded",
        },
      ],
    });
  }, 100_000);

  it("keeps an unconfirmed claim retryable through a real Redis outage", async () => {
    if (app === null || dispatcherPool === null) {
      throw new Error("integration runtime was not initialized");
    }
    const { jobId, runId } = await createRunFixture("redis-loss");
    const immediateJob = await queue.getJob(jobId);
    expect(immediateJob).not.toBeNull();
    await immediateJob?.remove();

    const lostQueue = new Queue<
      SimulationJobData,
      void,
      typeof SIMULATION_JOB_NAME
    >(SIMULATION_QUEUE_NAME, {
      connection: failureRedisConnection,
      prefix: "simula:v2",
    });
    lostQueue.on("error", () => undefined);
    await lostQueue.waitUntilReady();
    const lostQueueClient = (await lostQueue.client) as unknown as Redis;
    const lostTransport = new BullMqSimulationQueue(lostQueue);
    const lossControl = new Redis(failureRedisUrl, {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    await lossControl.connect();
    await lossControl.ping();
    await lossControl.shutdown("NOSAVE").catch(() => undefined);
    lossControl.disconnect();
    await lostQueue.close().catch(() => undefined);
    lostQueueClient.disconnect(false);
    const outageProbe = new Redis(failureRedisUrl, {
      connectTimeout: 500,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    outageProbe.on("error", () => undefined);
    await expect(outageProbe.connect()).rejects.toBeInstanceOf(Error);
    outageProbe.disconnect();

    const database = new PgRunOutboxDatabase(dispatcherPool);
    const unavailableDispatcher = new RunOutboxDispatcher(
      database,
      lostTransport,
      () => 0,
    );
    const unavailablePass = await unavailableDispatcher.dispatchOnce();
    expect(unavailablePass).toEqual({
      canceled: 0,
      claimed: 1,
      confirmed: 0,
      poisoned: 0,
      recovered: 0,
    });
    await expect(
      admin.query<{
        dispatch_attempt_count: number;
        outbox_status: string;
        result_count: string;
        run_state: string;
      }>(
        `
        select
          runs.state::text as run_state,
          outbox.status::text as outbox_status,
          outbox.dispatch_attempt_count,
          pg_catalog.count(results.id)::text as result_count
        from api.simulation_runs as runs
        join private.run_outbox as outbox on outbox.run_id = runs.id
        left join api.simulation_results as results on results.run_id = runs.id
        where runs.id = $1::uuid
        group by runs.id, outbox.id
        `,
        [runId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          dispatch_attempt_count: 1,
          outbox_status: "claimed",
          result_count: "0",
          run_state: "queued",
        },
      ],
    });

    await admin.query(
      `
      update private.run_outbox
      set claim_expires_at =
            pg_catalog.statement_timestamp() - interval '1 second'
      where run_id = $1::uuid
        and status = 'claimed'
      `,
      [runId],
    );
    const recoveredDispatcher = new RunOutboxDispatcher(
      database,
      app.get<SimulationQueuePort>(SIMULATION_QUEUE_PORT),
      () => 0,
    );
    await expect(recoveredDispatcher.dispatchOnce()).resolves.toEqual({
      canceled: 0,
      claimed: 1,
      confirmed: 1,
      poisoned: 0,
      recovered: 0,
    });

    const recoveryWorker = startWorker(workerDatabaseUrl, redisUrl, jobId);
    activeWorkers.add(recoveryWorker);
    await expect(workerResult(recoveryWorker)).resolves.toEqual({
      attempts_started: 1,
      job_id: jobId,
      state: "completed",
    });
    activeWorkers.delete(recoveryWorker);
    await expect(
      admin.query<{
        dispatch_attempt_count: number;
        outbox_status: string;
        result_count: string;
        run_state: string;
      }>(
        `
        select
          runs.state::text as run_state,
          outbox.status::text as outbox_status,
          outbox.dispatch_attempt_count,
          pg_catalog.count(results.id)::text as result_count
        from api.simulation_runs as runs
        join private.run_outbox as outbox on outbox.run_id = runs.id
        left join api.simulation_results as results on results.run_id = runs.id
        where runs.id = $1::uuid
        group by runs.id, outbox.id
        `,
        [runId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          dispatch_attempt_count: 2,
          outbox_status: "dispatched",
          result_count: "1",
          run_state: "succeeded",
        },
      ],
    });
  }, 30_000);

  it("terminalizes poison and atomically closes global run admission", async () => {
    if (app === null || dispatcherPool === null) {
      throw new Error("integration runtime was not initialized");
    }
    const { jobId, ownerToken, projectId, runId, stimulusVersionId } =
      await createRunFixture("poison");
    const immediateJob = await queue.getJob(jobId);
    expect(immediateJob).not.toBeNull();
    await immediateJob?.remove();
    await admin.query(
      `
      update private.run_outbox
      set status = 'claimed',
          dispatch_attempt_count = 10,
          claim_token = pg_catalog.gen_random_uuid(),
          claim_expires_at =
            pg_catalog.statement_timestamp() - interval '1 second',
          confirmed_at = null,
          terminal_error_code = null
      where run_id = $1::uuid
        and generation = 1
      `,
      [runId],
    );

    const dispatcher = new RunOutboxDispatcher(
      new PgRunOutboxDatabase(dispatcherPool),
      app.get<SimulationQueuePort>(SIMULATION_QUEUE_PORT),
      () => 0,
    );
    await expect(dispatcher.dispatchOnce()).resolves.toEqual({
      canceled: 0,
      claimed: 0,
      confirmed: 0,
      poisoned: 1,
      recovered: 0,
    });

    try {
      await expect(
        admin.query<{
          audit_count: string;
          control_enabled: boolean;
          control_reason: string;
          outbox_error: string;
          outbox_status: string;
          result_count: string;
          run_state: string;
        }>(
          `
          select
            runs.state::text as run_state,
            outbox.status::text as outbox_status,
            outbox.terminal_error_code as outbox_error,
            controls.enabled as control_enabled,
            controls.reason as control_reason,
            pg_catalog.count(distinct results.id)::text as result_count,
            (
              select pg_catalog.count(*)::text
              from private.audit_events as audit
              where audit.action = 'operator.run_creation_disabled'
                and audit.source_service = 'worker'
            ) as audit_count
          from api.simulation_runs as runs
          join private.run_outbox as outbox on outbox.run_id = runs.id
          cross join private.runtime_controls as controls
          left join api.simulation_results as results on results.run_id = runs.id
          where runs.id = $1::uuid
            and controls.control_name = 'run_creation'
          group by runs.id, outbox.id, controls.control_name
          `,
          [runId],
        ),
      ).resolves.toMatchObject({
        rows: [
          {
            audit_count: "1",
            control_enabled: false,
            control_reason: "poison_outbox",
            outbox_error: "dispatch_exhausted",
            outbox_status: "terminal",
            result_count: "0",
            run_state: "failed",
          },
        ],
      });

      const rejected = await request(app.getHttpServer())
        .post(`/api/v2/projects/${projectId}/runs`)
        .set(bearer(ownerToken))
        .set("Idempotency-Key", `bullmq-poison-rejected-${randomUUID()}`)
        .send({ stimulus_version_id: stimulusVersionId })
        .expect(503);
      expect(rejected.headers["retry-after"]).toBe("30");
      expect(rejected.body).toMatchObject({ code: "queue_backpressure" });
    } finally {
      await admin.query(
        `
        select private.set_run_creation_control(
          true,
          'operator_recovery_verified',
          $1::uuid
        )
        `,
        [randomUUID()],
      );
    }
  }, 30_000);

  it("processes thirty runs once through two dispatcher and two worker replicas", async () => {
    if (app === null) {
      throw new Error("integration runtime was not initialized");
    }
    const fixtures: RunFixture[] = [];
    for (let index = 0; index < 30; index += 1) {
      fixtures.push(await createRunFixture(`replica-load-${index + 1}`));
    }
    const jobIds = fixtures.map((fixture) => fixture.jobId);
    const runIds = fixtures.map((fixture) => fixture.runId);
    const replicaQueues = ["a", "b"].map(
      () =>
        new Queue<SimulationJobData, void, typeof SIMULATION_JOB_NAME>(
          SIMULATION_QUEUE_NAME,
          {
            connection: redisConnection,
            prefix: "simula:v2",
          },
        ),
    );
    const replicaPools = ["a", "b"].map(() =>
      createDispatcherPool({
        databaseCaPem: null,
        databaseUrl: workerDatabaseUrl,
        environment: "test",
        redisConnection,
        releaseSha: RELEASE_SHA,
      }),
    );
    const dispatchers = replicaPools.map((pool, index) => {
      const replicaQueue = replicaQueues[index];
      if (replicaQueue === undefined) {
        throw new Error("dispatcher replica queue is missing");
      }
      return new RunOutboxDispatcher(
        new PgRunOutboxDatabase(pool),
        new BullMqSimulationQueue(replicaQueue),
        () => 0,
      );
    });
    const workers: WorkerProcess[] = [];
    try {
      await Promise.all(
        replicaQueues.map((replicaQueue) => replicaQueue.waitUntilReady()),
      );
      const replicaRedisClients = await Promise.all(
        replicaQueues.map((replicaQueue) => replicaQueue.client),
      );
      expect(replicaRedisClients[0]).not.toBe(replicaRedisClients[1]);
      let claimed = 0;
      let confirmed = 0;
      let canceled = 0;
      let poisoned = 0;
      let recovered = 0;
      const replicaClaimed = [0, 0];
      const replicaConfirmed = [0, 0];
      for (
        let round = 0;
        round < 3 && confirmed < fixtures.length;
        round += 1
      ) {
        const passes = await Promise.all(
          dispatchers.map((dispatcher) => dispatcher.dispatchOnce(10)),
        );
        for (const [index, pass] of passes.entries()) {
          claimed += pass.claimed;
          confirmed += pass.confirmed;
          canceled += pass.canceled;
          poisoned += pass.poisoned;
          recovered += pass.recovered;
          replicaClaimed[index] = (replicaClaimed[index] ?? 0) + pass.claimed;
          replicaConfirmed[index] =
            (replicaConfirmed[index] ?? 0) + pass.confirmed;
        }
      }
      expect({
        canceled,
        claimed,
        confirmed,
        poisoned,
        recovered,
      }).toEqual({
        canceled: 0,
        claimed: 30,
        confirmed: 30,
        poisoned: 0,
        recovered: 0,
      });
      expect(replicaClaimed.every((count) => count > 0)).toBe(true);
      expect(replicaConfirmed.every((count) => count > 0)).toBe(true);
      await expect(
        Promise.all(
          dispatchers.map((dispatcher) => dispatcher.dispatchOnce(10)),
        ),
      ).resolves.toEqual([
        {
          canceled: 0,
          claimed: 0,
          confirmed: 0,
          poisoned: 0,
          recovered: 0,
        },
        {
          canceled: 0,
          claimed: 0,
          confirmed: 0,
          poisoned: 0,
          recovered: 0,
        },
      ]);

      workers.push(
        startBatchWorker(workerDatabaseUrl, redisUrl, jobIds, "replica-a"),
        startBatchWorker(workerDatabaseUrl, redisUrl, jobIds, "replica-b"),
      );
      expect(workers[0]?.pid).not.toBe(workers[1]?.pid);
      for (const worker of workers) activeWorkers.add(worker);
      await Promise.all(
        workers.map((worker, index) =>
          waitForWorkerOutput(
            worker,
            `SIMULA_BULLMQ_BATCH_READY={"replica_id":"replica-${index === 0 ? "a" : "b"}"}`,
          ),
        ),
      );
      const startedAt = Date.now();
      for (const worker of workers) {
        worker.stdin.write("start\n");
      }
      const workerResults = await Promise.all(workers.map(batchWorkerResult));
      for (const worker of workers) activeWorkers.delete(worker);
      expect(Date.now() - startedAt).toBeLessThan(30_000);
      expect(workerResults.map((result) => result.replica_id).sort()).toEqual([
        "replica-a",
        "replica-b",
      ]);

      const expectedJobIds = [...jobIds].sort();
      for (const result of workerResults) {
        expect(result.job_ids).toEqual(expectedJobIds);
        expect(Object.keys(result.attempts_started).sort()).toEqual(
          expectedJobIds,
        );
        expect(Object.values(result.attempts_started)).toEqual(
          Array.from({ length: 30 }, () => 1),
        );
        expect(result.claimed_job_ids.length).toBeGreaterThan(0);
      }
      const claimedJobIds = workerResults.flatMap(
        (result) => result.claimed_job_ids,
      );
      expect(claimedJobIds).toHaveLength(30);
      expect(new Set(claimedJobIds).size).toBe(30);
      expect([...claimedJobIds].sort()).toEqual(expectedJobIds);

      const durable = await admin.query<{
        attempt_count: number;
        attempt_rows: number;
        dispatched_outboxes: number;
        outbox_attempts: number;
        p95_seconds: number;
        result_count: number;
        run_count: number;
        succeeded_attempts: number;
        succeeded_runs: number;
      }>(
        `
        select
          pg_catalog.count(*)::integer as run_count,
          (
            pg_catalog.count(*) filter (where runs.state = 'succeeded')
          )::integer as succeeded_runs,
          pg_catalog.sum(runs.attempt_count)::integer as attempt_count,
          (
            select pg_catalog.count(*)::integer
            from private.run_attempts as attempts
            where attempts.run_id = any($1::uuid[])
          ) as attempt_rows,
          (
            select pg_catalog.count(*)::integer
            from private.run_attempts as attempts
            where attempts.run_id = any($1::uuid[])
              and attempts.status = 'succeeded'
          ) as succeeded_attempts,
          (
            select pg_catalog.count(*)::integer
            from api.simulation_results as results
            where results.run_id = any($1::uuid[])
          ) as result_count,
          (
            select pg_catalog.count(*)::integer
            from private.run_outbox as outbox
            where outbox.run_id = any($1::uuid[])
              and outbox.status = 'dispatched'
          ) as dispatched_outboxes,
          (
            select pg_catalog.sum(outbox.dispatch_attempt_count)::integer
            from private.run_outbox as outbox
            where outbox.run_id = any($1::uuid[])
          ) as outbox_attempts,
          (
            select pg_catalog.percentile_cont(0.95) within group (
              order by extract(
                epoch from (attempts.finished_at - attempts.started_at)
              )
            )::double precision
            from private.run_attempts as attempts
            where attempts.run_id = any($1::uuid[])
              and attempts.status = 'succeeded'
          ) as p95_seconds
        from api.simulation_runs as runs
        where runs.id = any($1::uuid[])
        `,
        [runIds],
      );
      expect(durable.rows[0]).toMatchObject({
        attempt_count: 30,
        attempt_rows: 30,
        dispatched_outboxes: 30,
        outbox_attempts: 30,
        result_count: 30,
        run_count: 30,
        succeeded_attempts: 30,
        succeeded_runs: 30,
      });
      expect(durable.rows[0]?.p95_seconds).toBeLessThan(10);
    } finally {
      for (const worker of workers) {
        if (worker.exitCode === null) worker.kill();
        activeWorkers.delete(worker);
      }
      await Promise.all(
        replicaQueues.map((replicaQueue) => replicaQueue.close()),
      );
      await Promise.all(replicaPools.map((pool) => pool.end()));
    }
  }, 90_000);

  it("executes one terminal ARQ result after rollback and prevents stale BullMQ double-consume", async () => {
    if (app === null || dispatcherPool === null) {
      throw new Error("integration runtime was not initialized");
    }
    const fixture = await createRunFixture("queue-transport-rollback");
    const correlationId = randomUUID();
    const workerPool = new Pool({
      connectionString: workerDatabaseUrl,
      connectionTimeoutMillis: 2_000,
      max: 1,
    });
    let worker: WorkerProcess | null = null;
    let arqWorker: WorkerProcess | null = null;
    let staleBullMqWorker: WorkerProcess | null = null;
    try {
      await admin.query(
        `
        select private.set_run_creation_control(
          false,
          'operator_manual',
          $1::uuid
        )
        `,
        [correlationId],
      );
      await expect(
        admin.query("select private.set_queue_transport('arq', $1::uuid)", [
          correlationId,
        ]),
      ).rejects.toThrow("queue_transport_not_drained");

      const dispatcher = new RunOutboxDispatcher(
        new PgRunOutboxDatabase(dispatcherPool),
        app.get<SimulationQueuePort>(SIMULATION_QUEUE_PORT),
        () => 0,
      );
      await expect(dispatcher.dispatchOnce()).resolves.toMatchObject({
        claimed: 1,
        confirmed: 1,
      });
      worker = startWorker(
        workerDatabaseUrl,
        redisUrl,
        fixture.jobId,
        "settle",
      );
      activeWorkers.add(worker);
      await expect(workerResult(worker)).resolves.toMatchObject({
        attempts_started: 1,
        job_id: fixture.jobId,
        state: "completed",
      });
      activeWorkers.delete(worker);

      await expect(
        admin.query(
          "select private.set_queue_transport('arq', $1::uuid) as changed",
          [correlationId],
        ),
      ).resolves.toMatchObject({ rows: [{ changed: true }] });
      await expect(
        workerPool.query(
          "select private.require_queue_transport('arq') as active",
        ),
      ).resolves.toMatchObject({ rows: [{ active: true }] });
      await expect(
        workerPool.query(
          "select private.require_queue_transport('bullmq') as active",
        ),
      ).rejects.toThrow("queue_transport_inactive");
      await expect(dispatcher.dispatchOnce()).rejects.toThrow(
        "queue_transport_inactive",
      );
      await expect(
        workerPool.query(
          `
          select *
          from private.claim_run_execution_v2_traced(
            $1::uuid,
            1::smallint,
            $2::text
          )
          `,
          [fixture.runId, fixture.jobId],
        ),
      ).rejects.toThrow("queue_transport_inactive");
      await expect(
        workerPool.query("select * from private.claim_due_run_outbox_v2(10)"),
      ).rejects.toThrow("queue_transport_inactive");
      await expect(
        workerPool.query("select * from private.claim_due_run_outbox(10)"),
      ).resolves.toMatchObject({ rows: [] });

      await admin.query(
        `
        select private.set_run_creation_control(
          true,
          'operator_recovery_verified',
          $1::uuid
        )
        `,
        [correlationId],
      );
      const arqFixture = await createRunFixture("queue-transport-arq");
      const retainedBullMqJob = await queue.getJob(arqFixture.jobId);
      expect(retainedBullMqJob).not.toBeNull();
      arqWorker = startArqWorker(workerDatabaseUrl, redisUrl, arqFixture.runId);
      activeWorkers.add(arqWorker);
      await expect(arqWorkerResult(arqWorker)).resolves.toEqual({
        claimed: 1,
        confirmed: 1,
        job_id: `run:${arqFixture.runId}:dispatch:1`,
        run_id: arqFixture.runId,
        state: "completed",
      });
      activeWorkers.delete(arqWorker);

      await request(app.getHttpServer())
        .get(`/api/v2/runs/${arqFixture.runId}`)
        .set(bearer(arqFixture.ownerToken))
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            id: arqFixture.runId,
            state: "succeeded",
          });
        });
      await request(app.getHttpServer())
        .get(`/api/v2/runs/${arqFixture.runId}/result`)
        .set(bearer(arqFixture.ownerToken))
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            run_id: arqFixture.runId,
            schema_version: 1,
          });
        });
      await expect(
        admin.query<{
          attempt_count: string;
          result_count: string;
          run_state: string;
        }>(
          `
          select
            runs.state::text as run_state,
            pg_catalog.count(distinct attempts.id)::text as attempt_count,
            pg_catalog.count(distinct results.id)::text as result_count
          from api.simulation_runs as runs
          left join private.run_attempts as attempts on attempts.run_id = runs.id
          left join api.simulation_results as results on results.run_id = runs.id
          where runs.id = $1::uuid
          group by runs.id
          `,
          [arqFixture.runId],
        ),
      ).resolves.toMatchObject({
        rows: [
          {
            attempt_count: "1",
            result_count: "1",
            run_state: "succeeded",
          },
        ],
      });

      await admin.query(
        `
        select private.set_run_creation_control(
          false,
          'operator_manual',
          $1::uuid
        )
        `,
        [correlationId],
      );
      await expect(
        admin.query(
          "select private.set_queue_transport('bullmq', $1::uuid) as changed",
          [correlationId],
        ),
      ).resolves.toMatchObject({ rows: [{ changed: true }] });
      await expect(
        workerPool.query(
          "select private.require_queue_transport('bullmq') as active",
        ),
      ).resolves.toMatchObject({ rows: [{ active: true }] });
      staleBullMqWorker = startWorker(
        workerDatabaseUrl,
        redisUrl,
        arqFixture.jobId,
      );
      activeWorkers.add(staleBullMqWorker);
      await expect(workerResult(staleBullMqWorker)).resolves.toEqual({
        attempts_started: 1,
        job_id: arqFixture.jobId,
        state: "completed",
      });
      activeWorkers.delete(staleBullMqWorker);
      await expect(
        admin.query<{
          attempt_count: string;
          result_count: string;
          run_state: string;
        }>(
          `
          select
            runs.state::text as run_state,
            pg_catalog.count(distinct attempts.id)::text as attempt_count,
            pg_catalog.count(distinct results.id)::text as result_count
          from api.simulation_runs as runs
          left join private.run_attempts as attempts on attempts.run_id = runs.id
          left join api.simulation_results as results on results.run_id = runs.id
          where runs.id = $1::uuid
          group by runs.id
          `,
          [arqFixture.runId],
        ),
      ).resolves.toMatchObject({
        rows: [
          {
            attempt_count: "1",
            result_count: "1",
            run_state: "succeeded",
          },
        ],
      });
      await admin.query(
        `
        select private.set_run_creation_control(
          true,
          'operator_recovery_verified',
          $1::uuid
        )
        `,
        [correlationId],
      );
      await expect(
        admin.query(
          `
          select
            transport.active_transport,
            controls.enabled as admission_enabled,
            (
              select pg_catalog.count(*)::integer
              from private.audit_events as audit
              where audit.action = 'operator.queue_transport_changed'
            ) as audit_count,
            runs.attempt_count,
            runs.state::text as run_state,
            (
              select pg_catalog.count(*)::integer
              from api.simulation_results as results
              where results.run_id = runs.id
            ) as result_count
          from private.get_queue_transport_control() as transport
          cross join private.runtime_controls as controls
          cross join api.simulation_runs as runs
          where controls.control_name = 'run_creation'
            and runs.id = $1::uuid
          `,
          [fixture.runId],
        ),
      ).resolves.toMatchObject({
        rows: [
          {
            active_transport: "bullmq",
            admission_enabled: true,
            attempt_count: 1,
            audit_count: 3,
            result_count: 1,
            run_state: "succeeded",
          },
        ],
      });
    } finally {
      if (worker !== null && worker.exitCode === null) worker.kill();
      if (worker !== null) activeWorkers.delete(worker);
      if (arqWorker !== null && arqWorker.exitCode === null) arqWorker.kill();
      if (arqWorker !== null) activeWorkers.delete(arqWorker);
      if (staleBullMqWorker !== null && staleBullMqWorker.exitCode === null) {
        staleBullMqWorker.kill();
      }
      if (staleBullMqWorker !== null) activeWorkers.delete(staleBullMqWorker);
      await workerPool.end();
    }
  }, 45_000);
});
