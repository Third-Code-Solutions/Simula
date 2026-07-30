import { randomUUID } from "node:crypto";

import { Queue } from "bullmq";

import { parseRedisConnection } from "../config/redis-connection";
import { RunOutboxDispatcher } from "../dispatcher/run-outbox-dispatcher";
import { RedisOrganizationCachePurger } from "../dispatcher/organization-cache-purger";
import { SIMULATION_JOB_NAME, SIMULATION_QUEUE_NAME } from "./queue.constants";
import { BullMqSimulationQueue } from "./bullmq-simulation-queue";
import type { SimulationJobData } from "./simulation-job";

const RUN_ID = "018f274b-3c77-7b22-b749-c9274230ef9a";

describe("BullMQ Redis integration", () => {
  let queue: Queue<SimulationJobData, void, typeof SIMULATION_JOB_NAME>;
  let publisher: BullMqSimulationQueue;
  let cachePurger: RedisOrganizationCachePurger;
  let ratePrefix: string;

  beforeAll(async () => {
    const connection = parseRedisConnection({
      SIMULA_ENVIRONMENT: "local",
      SIMULA_REDIS_URL: "redis://127.0.0.1:6379/14",
    });
    if (connection === null) {
      throw new Error("Local Redis integration configuration is missing.");
    }

    ratePrefix = `simula:test:deletion:${randomUUID()}`;
    queue = new Queue(SIMULATION_QUEUE_NAME, {
      connection,
      prefix: `simula:test:${randomUUID()}`,
    });
    publisher = new BullMqSimulationQueue(queue);
    cachePurger = new RedisOrganizationCachePurger(connection, ratePrefix);
    await queue.waitUntilReady();
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await cachePurger.close();
    await queue.close();
  });

  it("publishes one identifier-only job and deduplicates exact replay", async () => {
    const payload = {
      schema_version: 2,
      run_id: RUN_ID,
      dispatch_generation: 1,
    };

    const first = await publisher.publish(payload);
    const replay = await publisher.publish(payload);
    const stored = await queue.getJob(first.job_id);
    const jobs = await queue.getJobs(["wait", "delayed", "active"]);

    expect(replay).toEqual(first);
    expect(stored?.data).toEqual(payload);
    expect(stored?.opts.attempts).toBe(1);
    expect(jobs.map((job) => job.id)).toEqual([first.job_id]);
    await expect(publisher.provesPublished(payload)).resolves.toBe(true);
    await expect(
      publisher.provesPublished({
        ...payload,
        dispatch_generation: 2,
      }),
    ).resolves.toBe(false);
  });

  it("reports the live Redis transport ready", async () => {
    await expect(publisher.isReady()).resolves.toBe(true);
  });

  it("removes and proves absence of every retained job generation", async () => {
    const runId = randomUUID();
    for (
      let dispatchGeneration = 1;
      dispatchGeneration <= 3;
      dispatchGeneration += 1
    ) {
      await publisher.publish({
        schema_version: 2,
        run_id: runId,
        dispatch_generation: dispatchGeneration,
      });
    }

    await publisher.removeForRuns([runId]);

    await expect(
      Promise.all(
        [1, 2, 3].map((generation) =>
          queue.getJob(`run-${runId}-generation-${generation}`),
        ),
      ),
    ).resolves.toEqual([undefined, undefined, undefined]);
  });

  it("purges only the selected organization rate and idempotency keys", async () => {
    const organizationId = randomUUID();
    const otherOrganizationId = randomUUID();
    const client = await queue.client;
    const selected = [
      `${ratePrefix}:s2:organization_mutation:user:${randomUUID()}:${organizationId}`,
      `${ratePrefix}:s2:organization_mutation:user:${randomUUID()}:${organizationId}:idempotency:${"b".repeat(64)}`,
      `${ratePrefix}:s2:run_create_organization:organization:${organizationId}`,
      `${ratePrefix}:s2:run_create:organization:${organizationId}:idempotency:${"a".repeat(64)}`,
      `${ratePrefix}:s2:run_cancel:user:${randomUUID()}:${organizationId}`,
    ];
    const unrelated = `${ratePrefix}:s2:run_create_organization:organization:${otherOrganizationId}`;
    const collidingUser = `${ratePrefix}:s2:general_authenticated:user:${organizationId}`;
    await Promise.all(
      [...selected, unrelated, collidingUser].map((key) =>
        client.set(key, "1"),
      ),
    );

    await cachePurger.purgeOrganization(organizationId);

    await expect(
      Promise.all(selected.map((key) => client.get(key))),
    ).resolves.toEqual(selected.map(() => null));
    await expect(client.get(unrelated)).resolves.toBe("1");
    await expect(client.get(collidingUser)).resolves.toBe("1");
    await client.del(unrelated, collidingUser);
  });

  it("confirms a durable claim only after an exact BullMQ follow-up read", async () => {
    const runId = randomUUID();
    const claim = {
      outbox_id: randomUUID(),
      run_id: runId,
      dispatch_generation: 1,
      claim_token: randomUUID(),
    };
    const database = {
      requireQueueTransport: jest.fn().mockResolvedValue(undefined),
      finalizeRequestedCancellations: jest.fn().mockResolvedValue(0),
      finalizePoisonedDispatches: jest.fn().mockResolvedValue(0),
      reconcileStaleDispatches: jest.fn().mockResolvedValue(0),
      claimDueDispatches: jest.fn().mockResolvedValue([claim]),
      confirmDispatch: jest.fn().mockResolvedValue(true),
      failDispatch: jest.fn().mockResolvedValue(true),
    };
    const dispatcher = new RunOutboxDispatcher(database, publisher, () => 0);

    await expect(dispatcher.dispatchOnce()).resolves.toEqual({
      canceled: 0,
      poisoned: 0,
      recovered: 0,
      claimed: 1,
      confirmed: 1,
    });

    expect(database.confirmDispatch).toHaveBeenCalledWith(
      claim.outbox_id,
      claim.claim_token,
    );
    expect(database.failDispatch).not.toHaveBeenCalled();
    const stored = await queue.getJob(`run-${runId}-generation-1`);
    expect(stored).not.toBeNull();
    expect(stored?.data).toEqual({
      schema_version: 2,
      run_id: runId,
      dispatch_generation: 1,
    });
  });
});
