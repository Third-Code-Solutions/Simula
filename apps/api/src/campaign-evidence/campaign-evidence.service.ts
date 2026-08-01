import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";

import type { VerifiedIdentity } from "../auth/identity";
import {
  DOMAIN_DATABASE_POOL,
  DOMAIN_RUNTIME_CONFIG,
} from "../domain/domain.constants";
import type { EnabledDomainRuntime } from "../domain/domain-runtime";
import { AppProblem, dependencyUnavailable } from "../domain/problem";
import { databaseClaims, databaseProblem } from "../organizations/pg-organization-gateway";
import type {
  CampaignEvidenceEventCollectionDto,
  CampaignEvidenceEventDto,
  CampaignEvidenceRunResponseDto,
  HistoricalBacktestCreateDto,
  SurveyCalibrationCreateDto,
} from "./campaign-evidence.dto";

type EvidenceKind = "survey_calibration" | "historical_backtest";
type CreateInput = SurveyCalibrationCreateDto | HistoricalBacktestCreateDto;

export interface CampaignEvidenceServicePort {
  create(
    identity: VerifiedIdentity,
    organizationId: string,
    projectId: string,
    kind: EvidenceKind,
    input: CreateInput,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CampaignEvidenceRunResponseDto>;
  get(
    identity: VerifiedIdentity,
    evidenceId: string,
  ): Promise<CampaignEvidenceRunResponseDto>;
  events(
    identity: VerifiedIdentity,
    evidenceId: string,
  ): Promise<CampaignEvidenceEventCollectionDto>;
  cancel(
    identity: VerifiedIdentity,
    evidenceId: string,
    correlationId: string,
  ): Promise<CampaignEvidenceRunResponseDto>;
}

interface EvidenceRunRow {
  evidence_id: string;
  organization_id: string;
  project_id: string;
  kind: EvidenceKind;
  status: CampaignEvidenceRunResponseDto["status"];
  stage: CampaignEvidenceRunResponseDto["stage"];
  progress: number;
  source_version_id: string | null;
  outcome_set_id: string | null;
  created_at: Date | string;
  retention_until: Date | string;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  attempt_count: number;
  last_error_code: string | null;
  last_error_detail: string | null;
  result: Readonly<Record<string, unknown>> | null;
}

interface EvidenceEventRow {
  event_id: string;
  evidence_id: string;
  stage: string;
  progress: number;
  event_kind: string;
  message: string | null;
  created_at: Date | string;
}

function timestamp(value: Date | string | null): string | null {
  return value === null ? null : value instanceof Date ? value.toISOString() : value;
}

function notFound(): AppProblem {
  return new AppProblem(
    404,
    "not_found",
    "Evidence run not found",
    "The requested evidence run was not found.",
  );
}

function responsePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("database returned an invalid evidence command response");
  }
  return value as Record<string, unknown>;
}

function runResponse(
  row: EvidenceRunRow,
  replayed = false,
): CampaignEvidenceRunResponseDto {
  return {
    evidence_id: row.evidence_id,
    organization_id: row.organization_id,
    project_id: row.project_id,
    kind: row.kind,
    status: row.status,
    stage: row.stage,
    progress: row.progress,
    source_version_id: row.source_version_id,
    outcome_set_id: row.outcome_set_id,
    created_at: timestamp(row.created_at) ?? "",
    retention_until: timestamp(row.retention_until) ?? "",
    started_at: timestamp(row.started_at),
    completed_at: timestamp(row.completed_at),
    attempt_count: row.attempt_count,
    last_error_code: row.last_error_code,
    last_error_detail: row.last_error_detail,
    result: row.result,
    replayed,
  };
}

function eventResponse(row: EvidenceEventRow): CampaignEvidenceEventDto {
  return {
    event_id: row.event_id,
    evidence_id: row.evidence_id,
    stage: row.stage,
    progress: row.progress,
    event_kind: row.event_kind,
    message: row.message,
    created_at: timestamp(row.created_at) ?? "",
  };
}

@Injectable()
export class CampaignEvidenceService implements CampaignEvidenceServicePort {
  constructor(
    @Inject(DOMAIN_RUNTIME_CONFIG)
    private readonly config: EnabledDomainRuntime,
    @Inject(DOMAIN_DATABASE_POOL)
    private readonly pool: Pool,
  ) {}

  async create(
    identity: VerifiedIdentity,
    organizationId: string,
    projectId: string,
    kind: EvidenceKind,
    input: CreateInput,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CampaignEvidenceRunResponseDto> {
    const surveyInput = input as SurveyCalibrationCreateDto;
    const backtestInput = input as HistoricalBacktestCreateDto;
    if (
      kind === "survey_calibration" &&
      surveyInput.survey === undefined &&
      surveyInput.survey_import === undefined
    ) {
      throw new AppProblem(
        400,
        "survey_input_required",
        "Survey input is required",
        "Provide a normalized aggregate survey or a governed external survey import.",
      );
    }
    const publicSurveyImport =
      surveyInput.survey_import === undefined
        ? undefined
        : (({ payload: _payload, ...metadata }) => metadata)(surveyInput.survey_import);
    const request =
      kind === "survey_calibration"
        ? {
            synthetic_observations: surveyInput.synthetic_observations,
            ...(surveyInput.survey === undefined ? {} : { survey: surveyInput.survey }),
            ...(publicSurveyImport === undefined
              ? {}
              : { survey_import: publicSurveyImport }),
          }
        : {
            protocol: backtestInput.protocol,
            prediction_set: backtestInput.prediction_set,
            ...(backtestInput.baseline_prediction_set === undefined
              ? {}
              : { baseline_prediction_set: backtestInput.baseline_prediction_set }),
          };
    const secret =
      kind === "historical_backtest"
        ? { outcomes: backtestInput.outcomes }
        : surveyInput.survey_import === undefined
          ? null
          : { survey_import: surveyInput.survey_import };
    this.assertPayloadBudget(request, "request");
    if (secret !== null) {
      this.assertPayloadBudget(
        secret,
        kind === "historical_backtest" ? "outcomes" : "survey_import",
      );
    }
    try {
      const command = await this.transaction(identity, async (client) => {
        const result = await client.query<{ payload: unknown }>(
          `
          select api.create_campaign_evidence_run(
            $1::uuid, $2::uuid, $3::text, $4::jsonb, $5::jsonb,
            $6::uuid, $7::uuid, $8::text, $9::text, $10::uuid
          ) as payload
          `,
          [
            organizationId,
            projectId,
            kind,
            JSON.stringify(request),
            secret === null ? null : JSON.stringify(secret),
            kind === "survey_calibration" ? surveyInput.source_version_id : null,
            kind === "historical_backtest" ? backtestInput.outcome_set_id : null,
            idempotencyKey,
            requestSha256,
            correlationId,
          ],
        );
        return responsePayload(result.rows[0]?.payload);
      });
      const evidenceId = command.evidence_id;
      if (typeof evidenceId !== "string") {
        throw new Error("database returned an invalid evidence id");
      }
      const current = await this.get(identity, evidenceId);
      return { ...current, replayed: command.replayed === true };
    } catch (error) {
      if (error instanceof AppProblem) throw error;
      throw databaseProblem(error);
    }
  }

  async get(
    identity: VerifiedIdentity,
    evidenceId: string,
  ): Promise<CampaignEvidenceRunResponseDto> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query<EvidenceRunRow>(
          `
          select
            id::text as evidence_id,
            organization_id::text as organization_id,
            project_id::text as project_id,
            kind,
            status,
            stage,
            progress,
            source_version_id::text as source_version_id,
            outcome_set_id::text as outcome_set_id,
            created_at,
            retention_until,
            started_at,
            completed_at,
            attempt_count,
            last_error_code,
            last_error_detail,
            result
          from api.campaign_evidence_runs
          where id = $1::uuid
          `,
          [evidenceId],
        );
        const row = result.rows[0];
        if (row === undefined) throw notFound();
        return runResponse(row);
      });
    } catch (error) {
      if (error instanceof AppProblem) throw error;
      throw databaseProblem(error);
    }
  }

  async events(
    identity: VerifiedIdentity,
    evidenceId: string,
  ): Promise<CampaignEvidenceEventCollectionDto> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query<EvidenceEventRow>(
          `
          select
            id::text as event_id,
            run_id::text as evidence_id,
            stage,
            progress,
            event_kind,
            message,
            created_at
          from api.campaign_evidence_events
          where run_id = $1::uuid
          order by created_at asc, id asc
          limit 200
          `,
          [evidenceId],
        );
        if (result.rows.length === 0) {
          const run = await client.query<{ evidence_id: string }>(
            "select id::text as evidence_id from api.campaign_evidence_runs where id = $1::uuid",
            [evidenceId],
          );
          if (run.rows[0] === undefined) throw notFound();
        }
        return { items: result.rows.map(eventResponse) };
      });
    } catch (error) {
      if (error instanceof AppProblem) throw error;
      throw databaseProblem(error);
    }
  }

  async cancel(
    identity: VerifiedIdentity,
    evidenceId: string,
    correlationId: string,
  ): Promise<CampaignEvidenceRunResponseDto> {
    try {
      await this.transaction(identity, async (client) => {
        const result = await client.query<{ payload: unknown }>(
          "select api.cancel_campaign_evidence_run($1::uuid, $2::uuid) as payload",
          [evidenceId, correlationId],
        );
        responsePayload(result.rows[0]?.payload);
      });
      return await this.get(identity, evidenceId);
    } catch (error) {
      if (error instanceof AppProblem) throw error;
      throw databaseProblem(error);
    }
  }

  private assertPayloadBudget(value: object, field: string): void {
    const encoded = JSON.stringify(value);
    if (encoded === undefined || Buffer.byteLength(encoded, "utf8") > 60 * 1024) {
      throw new AppProblem(
        413,
        "evidence_payload_too_large",
        "Evidence payload is too large",
        "Use the governed evidence-source import path for larger datasets.",
        [{ field, code: "max_size" }],
      );
    }
  }

  private async transaction<T>(
    identity: VerifiedIdentity,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw databaseProblem(error);
    }
    let destroyed = false;
    try {
      await client.query("begin");
      await client.query(
        `
        select
          pg_catalog.set_config('statement_timeout', '8000', true),
          pg_catalog.set_config('lock_timeout', '2000', true),
          pg_catalog.set_config('idle_in_transaction_session_timeout', '10000', true),
          pg_catalog.set_config('request.jwt.claims', $1, true),
          pg_catalog.set_config('simula.release_sha', $2, true)
        `,
        [databaseClaims(identity), this.config.releaseSha],
      );
      const value = await operation(client);
      await client.query("commit");
      return value;
    } catch (error) {
      try {
        await client.query("rollback");
      } catch {
        client.release(true);
        destroyed = true;
      }
      throw error;
    } finally {
      if (!destroyed) client.release();
    }
  }
}

@Injectable()
export class UnavailableCampaignEvidenceService
  implements CampaignEvidenceServicePort
{
  create(): Promise<CampaignEvidenceRunResponseDto> {
    return Promise.reject(
      dependencyUnavailable("Campaign evidence evaluation is not enabled."),
    );
  }

  get(): Promise<CampaignEvidenceRunResponseDto> {
    return Promise.reject(
      dependencyUnavailable("Campaign evidence evaluation is not enabled."),
    );
  }

  events(): Promise<CampaignEvidenceEventCollectionDto> {
    return Promise.reject(
      dependencyUnavailable("Campaign evidence evaluation is not enabled."),
    );
  }

  cancel(): Promise<CampaignEvidenceRunResponseDto> {
    return Promise.reject(
      dependencyUnavailable("Campaign evidence evaluation is not enabled."),
    );
  }
}
