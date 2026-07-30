import type { Response } from "express";

import type { AuthenticatedRequest } from "../auth/supabase-auth.guard";
import type { OrganizationGateway } from "../organizations/organization-gateway.port";
import type { SimulationQueuePort } from "../queue/simulation-queue.port";
import type {
  DomainRateLimiter,
  RateAdmission,
} from "../rate-limits/domain-rate-limiter";
import { RunsController } from "./runs.controller";

const IDENTITY = Object.freeze({
  userId: "018f274b-3c77-7b22-b749-c9274230ef9a",
  issuer: "http://127.0.0.1:54321/auth/v1",
  expiresAt: 1_800_000_000,
  sessionId: "018f274b-3c77-7b22-b749-c9274230ef9b",
});
const PROJECT_ID = "018f274b-3c77-7b22-b749-c9274230ef9c";
const RUN = Object.freeze({
  id: "018f274b-3c77-7b22-b749-c9274230ef9d",
  organization_id: "018f274b-3c77-7b22-b749-c9274230ef9e",
  project_id: PROJECT_ID,
  stimulus_version_id: "018f274b-3c77-7b22-b749-c9274230ef9f",
  audience_version_id: "018f274b-3c77-7b22-b749-c9274230efa0",
  state: "queued" as const,
  schema_version: 1 as const,
  dispatch_generation: 1,
  job_id: "run:018f274b-3c77-7b22-b749-c9274230ef9d:dispatch:1",
  version: 1,
  created_at: "2026-07-29T06:00:00.123456Z",
  failure: null,
});
const BEHAVIORAL_RUN = Object.freeze({
  ...RUN,
  schema_version: 2 as const,
  job_id: "run-018f274b-3c77-7b22-b749-c9274230ef9d-generation-1",
});
const ADMISSION: RateAdmission = Object.freeze({
  markerKey: "simula:test:s2:marker",
  ownerToken: "a".repeat(32),
  acceptedReplay: false,
});

describe("RunsController durable replay", () => {
  it("bypasses new rate admission and republishes the durable replay", async () => {
    const gateway = {
      organizationForProject: jest.fn().mockResolvedValue(RUN.organization_id),
      getSimulationRunReplay: jest.fn().mockResolvedValue(RUN),
    };
    const rateLimiter = {
      requireRunCreate: jest.fn(),
    };
    const queue = {
      publish: jest.fn().mockResolvedValue({
        job_id: `run-${RUN.id}-generation-1`,
      }),
    };
    const setHeader = jest.fn();
    const request = {
      rawHeaders: ["Idempotency-Key", "simulation-create-0001"],
      simulaCorrelationId: "018f274b-3c77-7b22-b749-c9274230efa1",
      simulaTraceparent:
        "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
    } as AuthenticatedRequest;
    const controller = new RunsController(
      gateway as unknown as OrganizationGateway,
      rateLimiter as unknown as DomainRateLimiter,
      queue as unknown as SimulationQueuePort,
    );

    await expect(
      controller.create(
        PROJECT_ID,
        IDENTITY,
        { stimulus_version_id: RUN.stimulus_version_id },
        request,
        { setHeader } as unknown as Response,
      ),
    ).resolves.toEqual(RUN);
    expect(rateLimiter.requireRunCreate).not.toHaveBeenCalled();
    expect(queue.publish).toHaveBeenCalledWith({
      schema_version: 2,
      run_id: RUN.id,
      dispatch_generation: 1,
    });
    expect(setHeader).toHaveBeenCalledWith("Idempotent-Replayed", "true");
    expect(setHeader).toHaveBeenCalledWith("ETag", '"1"');
  });

  it("admits and publishes a visibly synthetic behavioral demo run", async () => {
    const gateway = {
      organizationForProject: jest.fn().mockResolvedValue(RUN.organization_id),
      getSimulationRunReplay: jest.fn().mockResolvedValue(null),
      createBehavioralDemoRun: jest.fn().mockResolvedValue({
        value: BEHAVIORAL_RUN,
        replayed: false,
      }),
    };
    const rateLimiter = {
      requireRunCreate: jest.fn().mockResolvedValue([ADMISSION]),
      acceptIdempotency: jest.fn().mockResolvedValue(undefined),
      rejectIdempotency: jest.fn().mockResolvedValue(undefined),
    };
    const queue = {
      publish: jest.fn().mockResolvedValue({
        job_id: BEHAVIORAL_RUN.job_id,
      }),
    };
    const setHeader = jest.fn();
    const request = {
      rawHeaders: ["Idempotency-Key", "behavioral-demo-0001"],
      simulaCorrelationId: "018f274b-3c77-7b22-b749-c9274230efa1",
      simulaTraceparent:
        "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
    } as AuthenticatedRequest;
    const controller = new RunsController(
      gateway as unknown as OrganizationGateway,
      rateLimiter as unknown as DomainRateLimiter,
      queue as unknown as SimulationQueuePort,
    );

    await expect(
      controller.createBehavioralDemo(
        PROJECT_ID,
        IDENTITY,
        {
          stimulus_version_id: RUN.stimulus_version_id,
          variant_key: "baseline",
        },
        request,
        { setHeader } as unknown as Response,
      ),
    ).resolves.toEqual(BEHAVIORAL_RUN);
    expect(rateLimiter.requireRunCreate).toHaveBeenCalledWith(
      IDENTITY.userId,
      RUN.organization_id,
      PROJECT_ID,
      "behavioral-demo-0001",
      "POST:/api/v2/projects/{project_id}/behavioral-demo-runs",
    );
    expect(gateway.createBehavioralDemoRun).toHaveBeenCalledWith(
      IDENTITY,
      PROJECT_ID,
      RUN.stimulus_version_id,
      "baseline",
      "behavioral-demo-0001",
      expect.stringMatching(/^[0-9a-f]{64}$/),
      request.simulaCorrelationId,
      request.simulaTraceparent,
    );
    expect(rateLimiter.acceptIdempotency).toHaveBeenCalledWith(ADMISSION);
    expect(rateLimiter.rejectIdempotency).not.toHaveBeenCalled();
    expect(queue.publish).toHaveBeenCalledWith({
      schema_version: 2,
      run_id: BEHAVIORAL_RUN.id,
      dispatch_generation: 1,
    });
    expect(setHeader).toHaveBeenCalledWith("Idempotent-Replayed", "false");
    expect(setHeader).toHaveBeenCalledWith("ETag", '"1"');
  });

  it("returns the behavioral report only after run-read admission", async () => {
    const result = Object.freeze({
      run_id: RUN.id,
      validation_label: "experimental",
    });
    const gateway = {
      getBehavioralResult: jest.fn().mockResolvedValue(result),
    };
    const rateLimiter = {
      requireRunRead: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new RunsController(
      gateway as unknown as OrganizationGateway,
      rateLimiter as unknown as DomainRateLimiter,
      {} as SimulationQueuePort,
    );

    await expect(controller.behavioralResult(RUN.id, IDENTITY)).resolves.toBe(
      result,
    );
    expect(rateLimiter.requireRunRead).toHaveBeenCalledWith(
      IDENTITY.userId,
      RUN.id,
    );
    expect(gateway.getBehavioralResult).toHaveBeenCalledWith(IDENTITY, RUN.id);
  });

  it("returns not-found when no behavioral report is visible", async () => {
    const gateway = {
      getBehavioralResult: jest.fn().mockResolvedValue(null),
    };
    const rateLimiter = {
      requireRunRead: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new RunsController(
      gateway as unknown as OrganizationGateway,
      rateLimiter as unknown as DomainRateLimiter,
      {} as SimulationQueuePort,
    );

    await expect(
      controller.behavioralResult(RUN.id, IDENTITY),
    ).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
  });

  it("returns behavioral evidence only after run-read admission", async () => {
    const evidence = Object.freeze({
      run_id: RUN.id,
      context_graph: Object.freeze({
        graph_id: PROJECT_ID,
      }),
      evidence_summary: Object.freeze([]),
    });
    const gateway = {
      getBehavioralEvidence: jest.fn().mockResolvedValue(evidence),
    };
    const rateLimiter = {
      requireRunRead: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new RunsController(
      gateway as unknown as OrganizationGateway,
      rateLimiter as unknown as DomainRateLimiter,
      {} as SimulationQueuePort,
    );

    await expect(controller.behavioralEvidence(RUN.id, IDENTITY)).resolves.toBe(
      evidence,
    );
    expect(rateLimiter.requireRunRead).toHaveBeenCalledWith(
      IDENTITY.userId,
      RUN.id,
    );
    expect(gateway.getBehavioralEvidence).toHaveBeenCalledWith(
      IDENTITY,
      RUN.id,
    );
  });

  it("returns not-found when no behavioral evidence is visible", async () => {
    const gateway = {
      getBehavioralEvidence: jest.fn().mockResolvedValue(null),
    };
    const rateLimiter = {
      requireRunRead: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new RunsController(
      gateway as unknown as OrganizationGateway,
      rateLimiter as unknown as DomainRateLimiter,
      {} as SimulationQueuePort,
    );

    await expect(
      controller.behavioralEvidence(RUN.id, IDENTITY),
    ).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
  });

  it("returns sanitized run history only after run-read admission", async () => {
    const history = Object.freeze({
      run_id: RUN.id,
      events: Object.freeze([
        Object.freeze({
          event_id: "018f274b-3c77-7b22-b749-c9274230efa2",
          previous_state: null,
          new_state: "queued",
          attempt_number: null,
          safe_reason: null,
          actor_type: "user",
          correlation_id: "018f274b-3c77-7b22-b749-c9274230efa1",
          created_at: "2026-07-29T06:00:00.123456Z",
        }),
      ]),
      disclosure:
        "Run state evidence only. Actor identities, payloads, prompts, agent memory, rationale, and free-form metadata are excluded.",
    });
    const gateway = {
      getRunAuditHistory: jest.fn().mockResolvedValue(history),
    };
    const rateLimiter = {
      requireRunRead: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new RunsController(
      gateway as unknown as OrganizationGateway,
      rateLimiter as unknown as DomainRateLimiter,
      {} as SimulationQueuePort,
    );

    await expect(controller.auditHistory(RUN.id, IDENTITY)).resolves.toBe(
      history,
    );
    expect(rateLimiter.requireRunRead).toHaveBeenCalledWith(
      IDENTITY.userId,
      RUN.id,
    );
    expect(gateway.getRunAuditHistory).toHaveBeenCalledWith(IDENTITY, RUN.id);
  });

  it("compares two different runs only after both read admissions", async () => {
    const baselineRunId = "018f274b-3c77-7b22-b749-c9274230ef88";
    const comparison = Object.freeze({
      baseline_run_id: baselineRunId,
      candidate_run_id: RUN.id,
      winner: null,
    });
    const gateway = {
      getBehavioralComparison: jest.fn().mockResolvedValue(comparison),
    };
    const rateLimiter = {
      requireRunRead: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new RunsController(
      gateway as unknown as OrganizationGateway,
      rateLimiter as unknown as DomainRateLimiter,
      {} as SimulationQueuePort,
    );

    await expect(
      controller.behavioralComparison(RUN.id, baselineRunId, IDENTITY),
    ).resolves.toBe(comparison);
    expect(rateLimiter.requireRunRead).toHaveBeenCalledTimes(2);
    expect(rateLimiter.requireRunRead).toHaveBeenCalledWith(
      IDENTITY.userId,
      baselineRunId,
    );
    expect(rateLimiter.requireRunRead).toHaveBeenCalledWith(
      IDENTITY.userId,
      RUN.id,
    );
    expect(gateway.getBehavioralComparison).toHaveBeenCalledWith(
      IDENTITY,
      baselineRunId,
      RUN.id,
    );
  });

  it("rejects comparing a run with itself before admission", async () => {
    const gateway = {
      getBehavioralComparison: jest.fn(),
    };
    const rateLimiter = {
      requireRunRead: jest.fn(),
    };
    const controller = new RunsController(
      gateway as unknown as OrganizationGateway,
      rateLimiter as unknown as DomainRateLimiter,
      {} as SimulationQueuePort,
    );

    await expect(
      controller.behavioralComparison(RUN.id, RUN.id, IDENTITY),
    ).rejects.toMatchObject({
      status: 422,
      code: "validation_error",
    });
    expect(rateLimiter.requireRunRead).not.toHaveBeenCalled();
    expect(gateway.getBehavioralComparison).not.toHaveBeenCalled();
  });
});
