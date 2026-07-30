import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";

import { CurrentIdentity } from "../auth/current-identity.decorator";
import type { VerifiedIdentity } from "../auth/identity";
import {
  type AuthenticatedRequest,
  SupabaseAuthGuard,
} from "../auth/supabase-auth.guard";
import {
  DOMAIN_RATE_LIMITER,
  ORGANIZATION_GATEWAY,
} from "../domain/domain.constants";
import { AppProblem } from "../domain/problem";
import {
  ApiAuthenticatedDomainProblems,
  ApiValidationProblem,
} from "../domain/problem.dto";
import {
  acceptAdmissions,
  rejectAdmissions,
} from "../http/command-coordination";
import {
  canonicalRequestSha256,
  idempotencyKey,
  requestCorrelationId,
  resourceId,
} from "../http/request-contract";
import type { OrganizationGateway } from "../organizations/organization-gateway.port";
import { SIMULATION_QUEUE_PORT } from "../queue/queue.constants";
import type { SimulationQueuePort } from "../queue/simulation-queue.port";
import type { DomainRateLimiter } from "../rate-limits/domain-rate-limiter";
import {
  BehavioralComparisonResponseDto,
  BehavioralDemoRunCreateDto,
  BehavioralEvidenceResponseDto,
  BehavioralResultResponseDto,
  RunAuditHistoryResponseDto,
  SimulationProvenanceResponseDto,
  SimulationResultResponseDto,
  SimulationRunCancelDto,
  SimulationRunCreateDto,
  SimulationRunResponseDto,
} from "./run.dto";

@ApiTags("runs")
@ApiBearerAuth("supabase")
@UseGuards(SupabaseAuthGuard)
@Controller({ version: "2" })
export class RunsController {
  private readonly logger = new Logger(RunsController.name);

  constructor(
    @Inject(ORGANIZATION_GATEWAY)
    private readonly gateway: OrganizationGateway,
    @Inject(DOMAIN_RATE_LIMITER)
    private readonly rateLimiter: DomainRateLimiter,
    @Inject(SIMULATION_QUEUE_PORT)
    private readonly queue: SimulationQueuePort,
  ) {}

  @Post("projects/:project_id/runs")
  @HttpCode(202)
  @ApiOperation({ operationId: "createSimulationRun" })
  @ApiHeader({
    name: "Idempotency-Key",
    required: true,
    schema: { type: "string", minLength: 16, maxLength: 128 },
  })
  @ApiAcceptedResponse({ type: SimulationRunResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async create(
    @Param("project_id") rawProjectId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: SimulationRunCreateDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SimulationRunResponseDto> {
    const projectId = resourceId(rawProjectId, "project_id");
    const stimulusVersionId = resourceId(
      body.stimulus_version_id,
      "stimulus_version_id",
    );
    const organizationId = await this.gateway.organizationForProject(
      identity,
      projectId,
    );
    const key = idempotencyKey(request);
    const requestSha256 = canonicalRequestSha256(body);
    const replay = await this.gateway.getSimulationRunReplay(
      identity,
      projectId,
      key,
      requestSha256,
    );
    if (replay !== null) {
      response.setHeader("Idempotent-Replayed", "true");
      response.setHeader("ETag", `"${replay.version}"`);
      await this.publishBestEffort(replay);
      return replay;
    }
    const admissions = await this.rateLimiter.requireRunCreate(
      identity.userId,
      organizationId,
      projectId,
      key,
      "POST:/api/v2/projects/{project_id}/runs",
    );
    let command;
    try {
      command = await this.gateway.createSimulationRun(
        identity,
        projectId,
        stimulusVersionId,
        key,
        requestSha256,
        requestCorrelationId(request),
        this.traceparent(request),
      );
    } catch (error) {
      await rejectAdmissions(this.rateLimiter, [...admissions]);
      throw error;
    }
    await acceptAdmissions(this.rateLimiter, [...admissions]);
    response.setHeader("Idempotent-Replayed", String(command.replayed));
    response.setHeader("ETag", `"${command.value.version}"`);
    await this.publishBestEffort(command.value);
    return command.value;
  }

  @Post("projects/:project_id/behavioral-demo-runs")
  @HttpCode(202)
  @ApiOperation({
    operationId: "createBehavioralDemoRun",
    summary: "Create an experimental synthetic behavioral simulation",
    description:
      "Runs the fixed, visibly synthetic authored-demo audience. The output is experimental and is not a population estimate.",
  })
  @ApiHeader({
    name: "Idempotency-Key",
    required: true,
    schema: { type: "string", minLength: 16, maxLength: 128 },
  })
  @ApiAcceptedResponse({ type: SimulationRunResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async createBehavioralDemo(
    @Param("project_id") rawProjectId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: BehavioralDemoRunCreateDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SimulationRunResponseDto> {
    const projectId = resourceId(rawProjectId, "project_id");
    const stimulusVersionId = resourceId(
      body.stimulus_version_id,
      "stimulus_version_id",
    );
    const organizationId = await this.gateway.organizationForProject(
      identity,
      projectId,
    );
    const key = idempotencyKey(request);
    const requestSha256 = canonicalRequestSha256(body);
    const replay = await this.gateway.getSimulationRunReplay(
      identity,
      projectId,
      key,
      requestSha256,
    );
    if (replay !== null) {
      response.setHeader("Idempotent-Replayed", "true");
      response.setHeader("ETag", `"${replay.version}"`);
      await this.publishBestEffort(replay);
      return replay;
    }
    const admissions = await this.rateLimiter.requireRunCreate(
      identity.userId,
      organizationId,
      projectId,
      key,
      "POST:/api/v2/projects/{project_id}/behavioral-demo-runs",
    );
    let command;
    try {
      command = await this.gateway.createBehavioralDemoRun(
        identity,
        projectId,
        stimulusVersionId,
        body.variant_key,
        key,
        requestSha256,
        requestCorrelationId(request),
        this.traceparent(request),
      );
    } catch (error) {
      await rejectAdmissions(this.rateLimiter, [...admissions]);
      throw error;
    }
    await acceptAdmissions(this.rateLimiter, [...admissions]);
    response.setHeader("Idempotent-Replayed", String(command.replayed));
    response.setHeader("ETag", `"${command.value.version}"`);
    await this.publishBestEffort(command.value);
    return command.value;
  }

  @Get("runs/:run_id")
  @ApiOperation({ operationId: "getSimulationRun" })
  @ApiOkResponse({ type: SimulationRunResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async get(
    @Param("run_id") rawRunId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SimulationRunResponseDto> {
    const runId = resourceId(rawRunId, "run_id");
    await this.rateLimiter.requireRunRead(identity.userId, runId);
    const run = await this.gateway.getSimulationRun(identity, runId);
    response.setHeader("ETag", `"${run.version}"`);
    return run;
  }

  @Get("runs/:run_id/audit-history")
  @ApiOperation({
    operationId: "getRunAuditHistory",
    summary: "Get the sanitized durable run state history",
    description:
      "Returns bounded state transitions without actor identities, payloads, prompts, agent memory, rationale, or free-form metadata.",
  })
  @ApiOkResponse({ type: RunAuditHistoryResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async auditHistory(
    @Param("run_id") rawRunId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
  ): Promise<RunAuditHistoryResponseDto> {
    const runId = resourceId(rawRunId, "run_id");
    await this.rateLimiter.requireRunRead(identity.userId, runId);
    return this.gateway.getRunAuditHistory(identity, runId);
  }

  @Post("runs/:run_id/cancel")
  @HttpCode(202)
  @ApiOperation({ operationId: "requestSimulationRunCancel" })
  @ApiAcceptedResponse({ type: SimulationRunResponseDto })
  @ApiOkResponse({ type: SimulationRunResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async cancel(
    @Param("run_id") rawRunId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() _body: SimulationRunCancelDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SimulationRunResponseDto> {
    const runId = resourceId(rawRunId, "run_id");
    const current = await this.gateway.getSimulationRun(identity, runId);
    await this.rateLimiter.requireRunCancel(
      identity.userId,
      current.organization_id,
    );
    const run = await this.gateway.requestSimulationRunCancel(
      identity,
      runId,
      requestCorrelationId(request),
    );
    response.status(run.state === "cancel_requested" ? 202 : 200);
    response.setHeader("ETag", `"${run.version}"`);
    return run;
  }

  @Get("runs/:run_id/result")
  @ApiOperation({ operationId: "getSimulationResult" })
  @ApiOkResponse({ type: SimulationResultResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async result(
    @Param("run_id") rawRunId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
  ): Promise<SimulationResultResponseDto> {
    const runId = resourceId(rawRunId, "run_id");
    await this.rateLimiter.requireRunRead(identity.userId, runId);
    const result = await this.gateway.getSimulationResult(identity, runId);
    if (result === null) {
      throw new AppProblem(
        404,
        "not_found",
        "Resource not found",
        "The requested resource was not found.",
      );
    }
    return result;
  }

  @Get("runs/:run_id/behavioral-result")
  @ApiOperation({
    operationId: "getBehavioralResult",
    summary: "Get the experimental synthetic behavioral report",
    description:
      "Returns the validated report projection and checksums. Private event-level artifacts are not exposed.",
  })
  @ApiOkResponse({ type: BehavioralResultResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async behavioralResult(
    @Param("run_id") rawRunId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
  ): Promise<BehavioralResultResponseDto> {
    const runId = resourceId(rawRunId, "run_id");
    await this.rateLimiter.requireRunRead(identity.userId, runId);
    const result = await this.gateway.getBehavioralResult(identity, runId);
    if (result === null) {
      throw new AppProblem(
        404,
        "not_found",
        "Resource not found",
        "The requested resource was not found.",
      );
    }
    return result;
  }

  @Get("runs/:run_id/behavioral-evidence")
  @ApiOperation({
    operationId: "getBehavioralEvidence",
    summary: "Get governed context and compact behavioral evidence traces",
    description:
      "Returns the validated context graph and bounded event references. Private agent actions, memory, and canonical payloads are not exposed.",
  })
  @ApiOkResponse({ type: BehavioralEvidenceResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async behavioralEvidence(
    @Param("run_id") rawRunId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
  ): Promise<BehavioralEvidenceResponseDto> {
    const runId = resourceId(rawRunId, "run_id");
    await this.rateLimiter.requireRunRead(identity.userId, runId);
    const result = await this.gateway.getBehavioralEvidence(identity, runId);
    if (result === null) {
      throw new AppProblem(
        404,
        "not_found",
        "Resource not found",
        "The requested resource was not found.",
      );
    }
    return result;
  }

  @Get("runs/:run_id/behavioral-comparison")
  @ApiOperation({
    operationId: "getBehavioralComparison",
    summary: "Compare two frozen matched synthetic behavioral runs",
    description:
      "Returns paired experimental deltas only when study, context, fleet, methodology, provider, and exact synthetic-agent identifiers match. It never declares a winner or lift.",
  })
  @ApiQuery({
    name: "baseline_run_id",
    required: true,
    type: String,
    format: "uuid",
  })
  @ApiOkResponse({ type: BehavioralComparisonResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async behavioralComparison(
    @Param("run_id") rawCandidateRunId: string,
    @Query("baseline_run_id") rawBaselineRunId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
  ): Promise<BehavioralComparisonResponseDto> {
    const candidateRunId = resourceId(rawCandidateRunId, "run_id");
    const baselineRunId = resourceId(rawBaselineRunId, "baseline_run_id");
    if (baselineRunId === candidateRunId) {
      throw new AppProblem(
        422,
        "validation_error",
        "Request validation failed",
        "Baseline and candidate runs must be different.",
        [{ field: "baseline_run_id", code: "mustDiffer" }],
      );
    }
    await Promise.all([
      this.rateLimiter.requireRunRead(identity.userId, baselineRunId),
      this.rateLimiter.requireRunRead(identity.userId, candidateRunId),
    ]);
    const result = await this.gateway.getBehavioralComparison(
      identity,
      baselineRunId,
      candidateRunId,
    );
    if (result === null) {
      throw new AppProblem(
        404,
        "not_found",
        "Resource not found",
        "The requested resource was not found.",
      );
    }
    return result;
  }

  @Get("runs/:run_id/provenance")
  @ApiOperation({ operationId: "getSimulationProvenance" })
  @ApiOkResponse({ type: SimulationProvenanceResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async provenance(
    @Param("run_id") rawRunId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
  ): Promise<SimulationProvenanceResponseDto> {
    const runId = resourceId(rawRunId, "run_id");
    await this.rateLimiter.requireRunRead(identity.userId, runId);
    return this.gateway.getSimulationProvenance(identity, runId);
  }

  private traceparent(request: AuthenticatedRequest): string {
    if (
      request.simulaTraceparent === undefined ||
      !/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/.test(request.simulaTraceparent)
    ) {
      throw new Error("trace middleware did not install trace context");
    }
    return request.simulaTraceparent;
  }

  private async publishBestEffort(
    run: SimulationRunResponseDto,
  ): Promise<void> {
    try {
      await this.queue.publish({
        schema_version: 2,
        run_id: run.id,
        dispatch_generation: run.dispatch_generation,
      });
    } catch {
      this.logger.warn({
        event: "run_publish_ambiguous",
        run_id: run.id,
      });
    }
  }
}
