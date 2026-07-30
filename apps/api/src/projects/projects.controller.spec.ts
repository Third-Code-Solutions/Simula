import type { Response } from "express";

import type { AuthenticatedRequest } from "../auth/supabase-auth.guard";
import { AppProblem } from "../domain/problem";
import type { CursorCodec } from "../organizations/cursor-codec";
import type { OrganizationGateway } from "../organizations/organization-gateway.port";
import type {
  DomainRateLimiter,
  RateAdmission,
} from "../rate-limits/domain-rate-limiter";
import { ProjectsController } from "./projects.controller";

const IDENTITY = Object.freeze({
  userId: "018f274b-3c77-7b22-b749-c9274230ef9a",
  issuer: "http://127.0.0.1:54321/auth/v1",
  expiresAt: 1_800_000_000,
  sessionId: "018f274b-3c77-7b22-b749-c9274230ef9b",
});
const ORGANIZATION_ID = "018f274b-3c77-7b22-b749-c9274230ef9c";
const CORRELATION_ID = "018f274b-3c77-7b22-b749-c9274230ef9d";
const ADMISSION: RateAdmission = Object.freeze({
  markerKey: "simula:test:s2:marker",
  ownerToken: "a".repeat(32),
  acceptedReplay: false,
});
const PROJECT = Object.freeze({
  id: "018f274b-3c77-7b22-b749-c9274230ef9e",
  organization_id: ORGANIZATION_ID,
  name: "Campaign",
  objective: "Reach café buyers",
  market: "philippines" as const,
  language: "en" as const,
  category: "campaign_message" as const,
  status: "active" as const,
  version: 1,
  created_at: "2026-07-29T06:00:00.123456Z",
  updated_at: "2026-07-29T06:00:00.123456Z",
});

function request(): AuthenticatedRequest {
  return {
    rawHeaders: ["Idempotency-Key", "project-command-0001"],
    simulaCorrelationId: CORRELATION_ID,
  } as AuthenticatedRequest;
}

function response() {
  return {
    setHeader: jest.fn(),
  } as unknown as Response;
}

function dependencies() {
  return {
    visibleOrganization: jest.fn().mockResolvedValue(ORGANIZATION_ID),
    createProject: jest.fn().mockResolvedValue({
      value: PROJECT,
      replayed: false,
    }),
    recordPrivilegedDenial: jest.fn().mockResolvedValue(undefined),
    requireOrganizationMutation: jest.fn().mockResolvedValue(ADMISSION),
    acceptIdempotency: jest.fn().mockResolvedValue(undefined),
    rejectIdempotency: jest.fn().mockResolvedValue(undefined),
  };
}

function controller(mocks: ReturnType<typeof dependencies>) {
  return new ProjectsController(
    mocks as unknown as OrganizationGateway,
    mocks as unknown as DomainRateLimiter,
    {} as CursorCodec,
  );
}

describe("ProjectsController command coordination", () => {
  it("accepts the rate marker only after a durable project commit", async () => {
    const mocks = dependencies();
    const httpResponse = response();

    await expect(
      controller(mocks).create(
        ORGANIZATION_ID.toUpperCase(),
        IDENTITY,
        {
          name: "Campaign",
          objective: "Reach café buyers",
          market: "philippines",
          language: "en",
          category: "campaign_message",
        },
        request(),
        httpResponse,
      ),
    ).resolves.toEqual(PROJECT);
    expect(mocks.acceptIdempotency).toHaveBeenCalledWith(ADMISSION);
    expect(mocks.rejectIdempotency).not.toHaveBeenCalled();
    expect(httpResponse.setHeader).toHaveBeenCalledWith("ETag", '"1"');
    expect(httpResponse.setHeader).toHaveBeenCalledWith(
      "Idempotent-Replayed",
      "false",
    );
    expect(mocks.createProject.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.acceptIdempotency.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("rejects a pending marker and records a safe privileged denial", async () => {
    const mocks = dependencies();
    mocks.createProject.mockRejectedValueOnce(
      new AppProblem(
        403,
        "forbidden",
        "Action forbidden",
        "Your current organization role cannot perform this action.",
      ),
    );

    await expect(
      controller(mocks).create(
        ORGANIZATION_ID,
        IDENTITY,
        {
          name: "Campaign",
          objective: "Reach café buyers",
          market: "philippines",
          language: "en",
          category: "campaign_message",
        },
        request(),
        response(),
      ),
    ).rejects.toMatchObject({ status: 403, code: "forbidden" });
    expect(mocks.rejectIdempotency).toHaveBeenCalledWith(ADMISSION);
    expect(mocks.recordPrivilegedDenial).toHaveBeenCalledWith(
      IDENTITY,
      ORGANIZATION_ID,
      "project.create_denied",
      "project",
      null,
      CORRELATION_ID,
    );
    expect(mocks.acceptIdempotency).not.toHaveBeenCalled();
  });
});
