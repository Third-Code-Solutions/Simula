import type { Response } from "express";

import type { VerifiedIdentity } from "../auth/identity";
import type { AuthenticatedRequest } from "../auth/supabase-auth.guard";
import { AppProblem } from "../domain/problem";
import type { OrganizationGateway } from "../organizations/organization-gateway.port";
import type { DomainRateLimiter } from "../rate-limits/domain-rate-limiter";
import type { MethodologyEngine } from "./methodology-engine";
import { OptimizationController } from "./optimization.controller";

const RUN_ID = "018f274b-3c77-7b22-b749-c9274230ef91";

describe("methodology report integrity", () => {
  it("fails closed when a completed run has no immutable configuration binding", async () => {
    const requireOrganizationMutation = jest.fn(() => {
      throw new Error("unsafe methodology report generation was reached");
    });
    const getSimulationRun = jest.fn(() => {
      throw new Error("retired methodology report reached run lookup");
    });
    const gateway = { getSimulationRun } as unknown as OrganizationGateway;
    const controller = new OptimizationController(
      gateway,
      { requireOrganizationMutation } as unknown as DomainRateLimiter,
      {} as MethodologyEngine,
    );
    const identity: VerifiedIdentity = {
      userId: "018f274b-3c77-7b22-b749-c9274230ef96",
      issuer: "https://auth.simula.invalid",
      expiresAt: 4_102_444_800,
      sessionId: "018f274b-3c77-7b22-b749-c9274230ef97",
    };

    let failure: unknown;
    try {
      await controller.createRunMethodologyReport(
        RUN_ID,
        identity,
        {
          configuration_version_id: "018f274b-3c77-7b22-b749-c9274230ef98",
          variant_key: "baseline",
          variant_label: "Baseline",
        },
        {} as AuthenticatedRequest,
        {} as Response,
      );
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AppProblem);
    expect(failure).toMatchObject({
      code: "version_conflict",
      status: 409,
    });
    expect(requireOrganizationMutation).not.toHaveBeenCalled();
    expect(getSimulationRun).not.toHaveBeenCalled();
  });

  it("quarantines legacy report reads and exports before gateway access", async () => {
    const getRunReport = jest.fn(() => {
      throw new Error("legacy report reached gateway");
    });
    const getStoredReportArtifact = jest.fn(() => {
      throw new Error("legacy export reached gateway");
    });
    const getReportExport = jest.fn(() => {
      throw new Error("legacy download reached gateway");
    });
    const controller = new OptimizationController(
      {
        getRunReport,
        getStoredReportArtifact,
        getReportExport,
      } as unknown as OrganizationGateway,
      {} as DomainRateLimiter,
      {} as MethodologyEngine,
    );
    const identity = {
      userId: "018f274b-3c77-7b22-b749-c9274230ef96",
    } as VerifiedIdentity;

    await expect(
      controller.getRunReport(RUN_ID, identity),
    ).rejects.toMatchObject({
      code: "unsupported_scope",
      status: 410,
    });
    await expect(
      controller.createReportExport(
        RUN_ID,
        identity,
        { expires_at: "2026-08-25T00:00:00Z", format: "json" },
        {} as AuthenticatedRequest,
        {} as Response,
      ),
    ).rejects.toMatchObject({ code: "unsupported_scope", status: 410 });
    await expect(
      controller.downloadReportExport(RUN_ID, identity, {} as Response),
    ).rejects.toMatchObject({ code: "unsupported_scope", status: 410 });

    expect(getRunReport).not.toHaveBeenCalled();
    expect(getStoredReportArtifact).not.toHaveBeenCalled();
    expect(getReportExport).not.toHaveBeenCalled();
  });
});
