"""Campaign Simulation Lab HTTP contract.

This surface is intentionally aggregate-only. Commands write through database
capabilities; reads use tenant-scoped projections. Raw survey rows and held-out
outcomes are accepted only in a worker secret envelope and are never returned.
"""

from __future__ import annotations

from collections.abc import Mapping
from hashlib import sha256
from typing import Annotated, Any, Literal, cast
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query, Request, Response
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field, model_validator
from simula_core.campaign_lab import (
    CampaignLabCohort,
    CampaignLabPolicyError,
    CampaignLabResearchSource,
    CampaignLabSimulationRequest,
    CampaignLabVariant,
    CampaignPurpose,
    validate_campaign_policy,
)
from simula_core.cultural_evaluation import (
    CulturalEvaluationSuite,
    evaluate_cultural_suite,
)
from simula_core.json_codec import canonical_json_dumps

from simula_api.auth import VerifiedIdentity
from simula_api.database import canonical_request_sha256
from simula_api.problems import AppProblem, ProblemError
from simula_api.routes import (
    IdempotencyKey,
    OptionalIdempotencyKey,
    PageSize,
    _correlation_id,
    _problem_response,
    _services,
    rate_limited_identity,
)

router = APIRouter(
    prefix="/api/v1/campaign-lab",
    responses={
        401: _problem_response("Authentication is missing, expired, or invalid."),
        403: _problem_response("The authenticated role cannot perform this action."),
        404: _problem_response("The resource is absent or not visible to the caller."),
        409: _problem_response("The request conflicts with current durable state."),
        413: _problem_response("The request exceeds the API body limit."),
        422: _problem_response("The request is invalid or outside the supported scope."),
        429: _problem_response("A durable quota or rate limit was reached."),
        503: _problem_response("A required dependency is temporarily unavailable."),
    },
)


class _LabModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class CampaignCreate(_LabModel):
    project_id: UUID
    name: str = Field(min_length=2, max_length=120)
    objective: str = Field(min_length=2, max_length=2000)
    purpose: CampaignPurpose
    decision: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def policy_safe(self) -> CampaignCreate:
        _validate_policy(self.model_dump(mode="json"))
        return self


class CampaignPatch(_LabModel):
    expected_version: int = Field(ge=1)
    name: str = Field(min_length=2, max_length=120)
    objective: str = Field(min_length=2, max_length=2000)
    decision: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def policy_safe(self) -> CampaignPatch:
        _validate_policy(self.model_dump(mode="json"))
        return self


class ArtifactCreate(_LabModel):
    title: str = Field(min_length=2, max_length=200)
    payload: dict[str, Any]
    provenance: dict[str, Any] = Field(default_factory=dict)
    checksum_sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    secret_payload: dict[str, Any] | None = Field(default=None, exclude=True)


class SimulationCreate(_LabModel):
    request: CampaignLabSimulationRequest
    secret_payload: dict[str, Any] | None = Field(default=None, exclude=True)

    @model_validator(mode="after")
    def deterministic_first_release(self) -> SimulationCreate:
        if self.request.configuration.provider != "deterministic":
            raise ValueError(
                "the first deployable Campaign Lab release supports the deterministic provider only"
            )
        return self


class ResearchIngestionCreate(_LabModel):
    # Keep the original artifact-shaped fields in the public contract while
    # adding the worker-backed document metadata as optional rollout fields.
    title: str = Field(min_length=2, max_length=200)
    payload: dict[str, Any]
    provenance: dict[str, Any] = Field(default_factory=dict)
    checksum_sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    source: dict[str, Any] | None = None
    filename: str | None = Field(default=None, min_length=1, max_length=240)
    media_type: (
        Literal[
            "text/plain",
            "text/markdown",
            "text/csv",
            "application/json",
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ]
        | None
    ) = None
    chunk_size: int = Field(default=1200, ge=200, le=4000)
    overlap: int = Field(default=120, ge=0, le=3999)
    secret_payload: dict[str, Any] | None = Field(default=None, exclude=True)

    @model_validator(mode="after")
    def require_worker_document(self) -> ResearchIngestionCreate:
        if self.source is not None:
            CampaignLabResearchSource.model_validate(self.source)
        if self.overlap >= self.chunk_size:
            raise ValueError("research overlap must be smaller than chunk_size")
        return self


class InterviewCreate(_LabModel):
    persona: dict[str, Any]
    source_run_id: UUID | None = None
    agent_id: UUID | None = None
    variant_key: str = Field(min_length=1, max_length=64)
    question: str = Field(default="What happened in this simulation?", min_length=1, max_length=500)
    prompt_version: str = Field(min_length=1, max_length=120)


class CulturalEvaluationCreate(_LabModel):
    suite: dict[str, Any]


class SurveyImportCreate(_LabModel):
    format: Literal["csv", "formbricks", "odk", "generic_json"]
    metadata: dict[str, Any]
    field_map: dict[str, Any] = Field(default_factory=dict)
    secret_payload: dict[str, Any] | None = Field(default=None, exclude=True)
    payload: Any | None = Field(default=None, exclude=True)

    @model_validator(mode="after")
    def keep_raw_payload_private(self) -> SurveyImportCreate:
        if self.payload is not None:
            raise ValueError("raw survey payload must be placed in secret_payload.payload")
        if self.secret_payload is None or "payload" not in self.secret_payload:
            raise ValueError("survey import requires a worker-only secret_payload.payload")
        return self


class CalibrationCreate(_LabModel):
    synthetic_observations: list[dict[str, Any]] = Field(min_length=1, max_length=100_000)
    survey: dict[str, Any] | None = None
    survey_import: dict[str, Any] | None = None
    calibration_version: str = Field(default="calibration_v1", min_length=1, max_length=120)
    model_version: str = Field(default="unspecified", min_length=1, max_length=120)
    baseline_calibration: dict[str, Any] | None = None
    calibration_history: list[dict[str, Any]] = Field(default_factory=list, max_length=100)
    secret_payload: dict[str, Any] | None = Field(default=None, exclude=True)

    @model_validator(mode="after")
    def keep_import_private(self) -> CalibrationCreate:
        public_import = self.survey_import
        if isinstance(public_import, Mapping) and "payload" in public_import:
            raise ValueError("survey import payload must remain worker-only")
        return self


class BacktestCreate(_LabModel):
    protocol: dict[str, Any]
    prediction_set: dict[str, Any]
    baseline_prediction_set: dict[str, Any] | None = None
    secret_payload: dict[str, Any] | None = Field(default=None, exclude=True)

    @model_validator(mode="after")
    def require_held_out_secret(self) -> BacktestCreate:
        if self.secret_payload is None or "outcomes" not in self.secret_payload:
            raise ValueError("historical backtest requires worker-only secret_payload.outcomes")
        return self


class ComplianceCreate(_LabModel):
    payload: dict[str, Any]
    reviewer: str | None = Field(default=None, min_length=1, max_length=160)


class ReportCreate(_LabModel):
    run_id: UUID
    calibration_run_id: UUID | None = None
    historical_backtest_run_id: UUID | None = None
    compliance_review_run_id: UUID | None = None
    cultural_evaluation_artifact_id: UUID | None = None
    human_reviewer: str | None = Field(default=None, min_length=1, max_length=160)
    approval_status: Literal["draft", "needs_human_review", "approved_experimental"] = "draft"

    @model_validator(mode="after")
    def require_approval_evidence(self) -> ReportCreate:
        if self.approval_status == "approved_experimental":
            if self.compliance_review_run_id is None:
                raise ValueError(
                    "approved_experimental reports require a succeeded compliance review"
                )
            if self.human_reviewer is None:
                raise ValueError("approved_experimental reports require a named human reviewer")
        return self


def _invalid(detail: str, *, field: str = "request") -> AppProblem:
    return AppProblem(
        status=422,
        code="validation_error",
        title="Campaign Lab request is invalid",
        detail=detail,
        errors=(ProblemError(field=field, code="invalid_campaign_lab_request"),),
    )


def _validate_policy(value: object) -> None:
    try:
        validate_campaign_policy(value)
    except CampaignLabPolicyError as error:
        raise _invalid("The request crosses the aggregate research boundary.") from error


def _payload_sha(value: Mapping[str, Any]) -> str:
    return sha256(canonical_json_dumps(dict(value))).hexdigest()


def _request_sha(value: Mapping[str, Any]) -> str:
    return canonical_request_sha256(value)


def _json(value: object) -> Jsonb:
    return Jsonb(value)


def _replay_header(response: Response, payload: Mapping[str, Any]) -> None:
    response.headers["Idempotent-Replayed"] = str(bool(payload.get("replayed"))).lower()


async def _campaign_organization(
    request: Request, identity: VerifiedIdentity, campaign_id: UUID
) -> UUID:
    rows = await _services(request).database.read_product_rows(
        identity,
        operation="campaign_lab_campaign_organization",
        query="""
          select organization_id
          from api.campaign_lab_campaigns
          where id = %s and deleted_at is null
        """,
        parameters=(campaign_id,),
    )
    if not rows:
        raise AppProblem(
            status=404,
            code="not_found",
            title="Campaign Lab workspace not found",
            detail="The campaign is absent or not visible to the current organization.",
        )
    return cast(UUID, rows[0]["organization_id"])


async def _campaign_row(
    request: Request, identity: VerifiedIdentity, campaign_id: UUID
) -> dict[str, Any]:
    rows = await _services(request).database.read_product_rows(
        identity,
        operation="campaign_lab_campaign",
        query="""
          select id, organization_id, project_id, name, objective, purpose, status,
                 current_stage, decision_definition, compliance_status, version,
                 created_by, created_at, updated_at
          from api.campaign_lab_campaigns
          where id = %s and deleted_at is null
        """,
        parameters=(campaign_id,),
    )
    if not rows:
        raise AppProblem(
            status=404,
            code="not_found",
            title="Campaign Lab workspace not found",
            detail="The campaign is absent or not visible to the current organization.",
        )
    return rows[0]


async def _store_artifact(
    request: Request,
    identity: VerifiedIdentity,
    *,
    campaign_id: UUID,
    kind: str,
    body: ArtifactCreate,
    idempotency_key: str,
    correlation_id: UUID,
    validate: bool = True,
) -> dict[str, Any]:
    if validate:
        _validate_policy({"payload": body.payload, "provenance": body.provenance})
    organization_id = await _campaign_organization(request, identity, campaign_id)
    payload: dict[str, Any] = {
        "kind": kind,
        "campaign_id": str(campaign_id),
        "title": body.title,
        "payload": body.payload,
        "provenance": body.provenance,
    }
    secret_hash = (
        _payload_sha(body.secret_payload) if isinstance(body.secret_payload, Mapping) else None
    )
    payload["secret_payload_sha256"] = secret_hash
    return await _services(request).database.execute_product_command(
        identity,
        operation=f"create_campaign_lab_{kind}",
        query="""
          select api.create_campaign_lab_artifact(
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
          ) as payload
        """,
        parameters=(
            organization_id,
            campaign_id,
            kind,
            body.title,
            _json(body.payload),
            _json(body.provenance),
            body.checksum_sha256 or _payload_sha(body.payload),
            _json(body.secret_payload) if body.secret_payload is not None else None,
            idempotency_key,
            _request_sha(payload),
            correlation_id,
        ),
    )


async def _store_run(
    request: Request,
    identity: VerifiedIdentity,
    *,
    campaign_id: UUID,
    run_type: str,
    payload: Mapping[str, Any],
    secret_payload: Mapping[str, Any] | None,
    idempotency_key: str,
    correlation_id: UUID,
    validate: bool = True,
) -> dict[str, Any]:
    if validate:
        _validate_policy(payload)
    organization_id = await _campaign_organization(request, identity, campaign_id)
    request_payload = {**payload, "run_type": run_type, "campaign_id": str(campaign_id)}
    if isinstance(secret_payload, Mapping):
        request_payload["secret_payload_sha256"] = _payload_sha(secret_payload)
    return await _services(request).database.execute_product_command(
        identity,
        operation=f"create_campaign_lab_{run_type}_run",
        query="""
          select api.create_campaign_lab_run_v3(
            %s, %s, %s, %s, %s, %s, %s, %s
          ) as payload
        """,
        parameters=(
            organization_id,
            campaign_id,
            run_type,
            _json(payload),
            _json(secret_payload) if secret_payload is not None else None,
            idempotency_key,
            _request_sha(request_payload),
            correlation_id,
        ),
    )


@router.post("/campaigns", status_code=201, operation_id="create_campaign_lab_campaign")
async def create_campaign(
    body: CampaignCreate,
    request: Request,
    response: Response,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    idempotency_key: IdempotencyKey,
) -> dict[str, Any]:
    services = _services(request)
    organization_id = await services.database.organization_for_project(
        identity, project_id=body.project_id
    )
    payload = body.model_dump(mode="json")
    result = await services.database.execute_product_command(
        identity,
        operation="create_campaign_lab_campaign",
        query="""
          select api.create_campaign_lab_campaign(
            %s, %s, %s, %s, %s, %s, %s, %s, %s
          ) as payload
        """,
        parameters=(
            organization_id,
            body.project_id,
            body.name,
            body.objective,
            body.purpose,
            _json(body.decision),
            idempotency_key,
            _request_sha(payload),
            _correlation_id(request),
        ),
    )
    _replay_header(response, result)
    return result


@router.get("/campaigns", operation_id="list_campaign_lab_campaigns")
async def list_campaigns(
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    limit: PageSize = 50,
    offset: int = Query(default=0, ge=0, le=10_000),
    project_id: UUID | None = None,
) -> dict[str, Any]:
    parameters: tuple[object, ...]
    if project_id is None:
        query = """
          select id, organization_id, project_id, name, objective, purpose, status,
                 current_stage, compliance_status, version, created_at, updated_at
          from api.campaign_lab_campaigns
          where deleted_at is null
          order by created_at desc, id desc
          limit %s offset %s
        """
        parameters = (limit, offset)
    else:
        query = """
          select id, organization_id, project_id, name, objective, purpose, status,
                 current_stage, compliance_status, version, created_at, updated_at
          from api.campaign_lab_campaigns
          where project_id = %s and deleted_at is null
          order by created_at desc, id desc
          limit %s offset %s
        """
        parameters = (project_id, limit, offset)
    items = await _services(request).database.read_product_rows(
        identity, operation="list_campaign_lab_campaigns", query=query, parameters=parameters
    )
    return {"items": items, "pagination": {"limit": limit, "offset": offset}}


@router.get("/campaigns/{campaign_id}", operation_id="get_campaign_lab_campaign")
async def get_campaign(
    campaign_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> dict[str, Any]:
    campaign = await _campaign_row(request, identity, campaign_id)
    counts = await _services(request).database.read_product_rows(
        identity,
        operation="campaign_lab_campaign_counts",
        query="""
          select
            (select count(*) from api.campaign_lab_artifacts a
             where a.organization_id = c.organization_id
               and a.campaign_id = c.id) as artifact_count,
            (select count(*) from api.campaign_lab_runs r
             where r.organization_id = c.organization_id and r.campaign_id = c.id) as run_count
          from api.campaign_lab_campaigns c
          where c.id = %s
        """,
        parameters=(campaign_id,),
    )
    return {"campaign": campaign, "counts": counts[0] if counts else {}}


@router.patch("/campaigns/{campaign_id}", operation_id="update_campaign_lab_campaign")
async def update_campaign(
    campaign_id: UUID,
    body: CampaignPatch,
    request: Request,
    response: Response,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    idempotency_key: OptionalIdempotencyKey = None,
) -> dict[str, Any]:
    await _campaign_organization(request, identity, campaign_id)
    payload = {
        "campaign_id": str(campaign_id),
        **body.model_dump(mode="json"),
    }
    effective_idempotency_key = idempotency_key or f"campaign-lab-{_request_sha(payload)}"
    result = await _services(request).database.execute_product_command(
        identity,
        operation="update_campaign_lab_campaign",
        query="""
          select api.update_campaign_lab_campaign(%s, %s, %s, %s, %s, %s, %s, %s) as payload
        """,
        parameters=(
            campaign_id,
            body.expected_version,
            body.name,
            body.objective,
            _json(body.decision),
            effective_idempotency_key,
            _request_sha(payload),
            _correlation_id(request),
        ),
    )
    _replay_header(response, result)
    return result


@router.get("/campaigns/{campaign_id}/artifacts", operation_id="list_campaign_lab_artifacts")
async def list_artifacts(
    campaign_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    limit: PageSize = 50,
    offset: int = Query(default=0, ge=0, le=10_000),
    kind: str | None = Query(default=None, min_length=2, max_length=64),
) -> dict[str, Any]:
    await _campaign_row(request, identity, campaign_id)
    parameters: tuple[object, ...]
    if kind is None:
        query = """
          select id, organization_id, campaign_id, kind, status, title, payload,
                 provenance, checksum_sha256, retention_until, created_by, created_at, updated_at
          from api.campaign_lab_artifacts
          where campaign_id = %s
          order by created_at desc, id desc
          limit %s offset %s
        """
        parameters = (campaign_id, limit, offset)
    else:
        query = """
          select id, organization_id, campaign_id, kind, status, title, payload,
                 provenance, checksum_sha256, retention_until, created_by, created_at, updated_at
          from api.campaign_lab_artifacts
          where campaign_id = %s and kind = %s
          order by created_at desc, id desc
          limit %s offset %s
        """
        parameters = (campaign_id, kind, limit, offset)
    items = await _services(request).database.read_product_rows(
        identity, operation="list_campaign_lab_artifacts", query=query, parameters=parameters
    )
    return {"items": items, "pagination": {"limit": limit, "offset": offset}}


async def _list_artifacts_by_kind(
    campaign_id: UUID,
    kind: Literal["research_source", "cohort", "variant"],
    request: Request,
    identity: VerifiedIdentity,
    *,
    limit: int,
    offset: int,
) -> dict[str, Any]:
    await _campaign_row(request, identity, campaign_id)
    rows = await _services(request).database.read_product_rows(
        identity,
        operation=f"list_campaign_lab_{kind}",
        query="""
          select id, organization_id, campaign_id, kind, status, title, payload,
                 provenance, checksum_sha256, retention_until, created_by, created_at, updated_at
          from api.campaign_lab_artifacts
          where campaign_id = %s and kind = %s
          order by created_at desc, id desc
          limit %s offset %s
        """,
        parameters=(campaign_id, kind, limit, offset),
    )
    return {"items": rows, "pagination": {"limit": limit, "offset": offset}}


@router.get(
    "/campaigns/{campaign_id}/research",
    operation_id="list_campaign_lab_research",
)
async def list_research(
    campaign_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    limit: PageSize = 50,
    offset: int = Query(default=0, ge=0, le=10_000),
) -> dict[str, Any]:
    return await _list_artifacts_by_kind(
        campaign_id, "research_source", request, identity, limit=limit, offset=offset
    )


@router.get(
    "/campaigns/{campaign_id}/cohorts",
    operation_id="list_campaign_lab_cohorts",
)
async def list_cohorts(
    campaign_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    limit: PageSize = 50,
    offset: int = Query(default=0, ge=0, le=10_000),
) -> dict[str, Any]:
    return await _list_artifacts_by_kind(
        campaign_id, "cohort", request, identity, limit=limit, offset=offset
    )


@router.get(
    "/campaigns/{campaign_id}/variants",
    operation_id="list_campaign_lab_variants",
)
async def list_variants(
    campaign_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    limit: PageSize = 50,
    offset: int = Query(default=0, ge=0, le=10_000),
) -> dict[str, Any]:
    return await _list_artifacts_by_kind(
        campaign_id, "variant", request, identity, limit=limit, offset=offset
    )


@router.post(
    "/campaigns/{campaign_id}/research",
    status_code=201,
    operation_id="create_campaign_lab_research",
)
async def create_research(
    campaign_id: UUID,
    body: ResearchIngestionCreate,
    request: Request,
    response: Response,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    idempotency_key: IdempotencyKey,
) -> dict[str, Any]:
    if (
        body.source is None
        or body.filename is None
        or body.media_type is None
        or body.secret_payload is None
        or not isinstance(body.secret_payload.get("content"), str)
    ):
        raise _invalid(
            "Research ingestion requires source provenance, filename, media type, and "
            "worker-only document content.",
            field="source",
        )
    payload = body.model_dump(mode="json", exclude={"secret_payload"})
    payload["source"] = body.source
    result = await _store_run(
        request,
        identity,
        campaign_id=campaign_id,
        run_type="research_ingestion",
        payload=payload,
        secret_payload=body.secret_payload,
        idempotency_key=idempotency_key,
        correlation_id=_correlation_id(request),
    )
    _replay_header(response, result)
    return result


@router.get("/research/runs/{run_id}", operation_id="get_campaign_lab_research_run")
async def get_research_run(
    run_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> dict[str, Any]:
    return await _get_campaign_lab_run(run_id, "research_ingestion", request, identity)


@router.post(
    "/campaigns/{campaign_id}/cohorts", status_code=201, operation_id="create_campaign_lab_cohort"
)
async def create_cohort(
    campaign_id: UUID,
    body: ArtifactCreate,
    request: Request,
    response: Response,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    idempotency_key: IdempotencyKey,
) -> dict[str, Any]:
    try:
        CampaignLabCohort.model_validate(body.payload)
    except ValueError as error:
        raise _invalid(
            "The cohort must use aggregate dimensions, provenance, and weights.", field="payload"
        ) from error
    result = await _store_artifact(
        request,
        identity,
        campaign_id=campaign_id,
        kind="cohort",
        body=body,
        idempotency_key=idempotency_key,
        correlation_id=_correlation_id(request),
    )
    _replay_header(response, result)
    return result


@router.post(
    "/campaigns/{campaign_id}/variants", status_code=201, operation_id="create_campaign_lab_variant"
)
async def create_variant(
    campaign_id: UUID,
    body: ArtifactCreate,
    request: Request,
    response: Response,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    idempotency_key: IdempotencyKey,
) -> dict[str, Any]:
    raw_variants = body.payload.get("variants")
    try:
        if isinstance(raw_variants, list):
            if len(raw_variants) < 2:
                raise ValueError("at least two variants are required")
            for item in raw_variants:
                CampaignLabVariant.model_validate(item)
        else:
            CampaignLabVariant.model_validate(body.payload)
    except ValueError as error:
        raise _invalid(
            "Variants must be authored message inputs with language and content type.",
            field="payload",
        ) from error
    result = await _store_artifact(
        request,
        identity,
        campaign_id=campaign_id,
        kind="variant",
        body=body,
        idempotency_key=idempotency_key,
        correlation_id=_correlation_id(request),
    )
    _replay_header(response, result)
    return result


@router.post(
    "/campaigns/{campaign_id}/simulations",
    status_code=202,
    operation_id="create_campaign_lab_simulation",
)
async def create_simulation(
    campaign_id: UUID,
    body: SimulationCreate,
    request: Request,
    response: Response,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    idempotency_key: IdempotencyKey,
) -> dict[str, Any]:
    if body.request.campaign_id != campaign_id:
        raise _invalid(
            "request.campaign_id must match the campaign path.", field="request.campaign_id"
        )
    result = await _store_run(
        request,
        identity,
        campaign_id=campaign_id,
        run_type="repeated_simulation",
        payload=body.request.model_dump(mode="json"),
        secret_payload=body.secret_payload,
        idempotency_key=idempotency_key,
        correlation_id=_correlation_id(request),
    )
    _replay_header(response, result)
    return result


@router.get("/simulations/{run_id}", operation_id="get_campaign_lab_simulation")
async def get_simulation(
    run_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> dict[str, Any]:
    rows = await _services(request).database.read_product_rows(
        identity,
        operation="campaign_lab_simulation",
        query="""
          select id, organization_id, campaign_id, run_type, status, stage, progress,
                 result, created_by, created_at, started_at, completed_at, attempt_count,
                 last_error_code, last_error_detail
          from api.campaign_lab_runs
          where id = %s
        """,
        parameters=(run_id,),
    )
    if not rows:
        raise AppProblem(
            status=404,
            code="not_found",
            title="Simulation not found",
            detail="The run is absent or not visible.",
        )
    return rows[0]


async def _get_campaign_lab_run(
    run_id: UUID,
    expected_run_type: Literal[
        "research_ingestion",
        "survey_import",
        "interview",
        "compliance_review",
        "report",
    ],
    request: Request,
    identity: VerifiedIdentity,
) -> dict[str, Any]:
    run = await get_simulation(run_id, request, identity)
    if run.get("run_type") != expected_run_type:
        raise AppProblem(
            status=404,
            code="not_found",
            title="Campaign Lab durable run not found",
            detail="The requested run is absent or has a different type.",
        )
    return run


async def _get_evidence_run(
    run_id: UUID,
    expected_run_type: Literal["survey_calibration", "historical_backtest"],
    request: Request,
    identity: VerifiedIdentity,
) -> dict[str, Any]:
    run = await get_simulation(run_id, request, identity)
    if run.get("run_type") != expected_run_type:
        raise AppProblem(
            status=404,
            code="not_found",
            title="Campaign Lab evidence run not found",
            detail="The requested evidence run is absent or has a different type.",
        )
    return run


@router.get("/simulations/{run_id}/status", operation_id="get_campaign_lab_simulation_status")
async def simulation_status(
    run_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> dict[str, Any]:
    run = await get_simulation(run_id, request, identity)
    return {
        key: run[key]
        for key in (
            "id",
            "campaign_id",
            "run_type",
            "status",
            "stage",
            "progress",
            "attempt_count",
            "created_at",
            "started_at",
            "completed_at",
            "last_error_code",
        )
    }


@router.get("/simulations/{run_id}/events", operation_id="list_campaign_lab_simulation_events")
async def simulation_events(
    run_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    limit: PageSize = 100,
    offset: int = Query(default=0, ge=0, le=10_000),
) -> dict[str, Any]:
    rows = await _services(request).database.read_product_rows(
        identity,
        operation="campaign_lab_simulation_events",
        query="""
          select id, organization_id, campaign_id, run_id, stage, progress, event_kind,
                 message, metadata, created_at
          from api.campaign_lab_events
          where run_id = %s
          order by created_at asc, id asc
          limit %s offset %s
        """,
        parameters=(run_id, limit, offset),
    )
    return {"items": rows, "pagination": {"limit": limit, "offset": offset}}


@router.get("/simulations/{run_id}/results", operation_id="get_campaign_lab_simulation_results")
async def simulation_results(
    run_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> dict[str, Any]:
    run = await get_simulation(run_id, request, identity)
    if run.get("status") != "succeeded" or not isinstance(run.get("result"), Mapping):
        raise AppProblem(
            status=409,
            code="version_conflict",
            title="Simulation is not complete",
            detail="Wait for a succeeded durable run before reading results.",
        )
    return {"run_id": run_id, "evidence_status": "Synthetic-only", "result": run["result"]}


@router.post("/simulations/{run_id}/cancel", operation_id="cancel_campaign_lab_simulation")
async def cancel_simulation(
    run_id: UUID,
    request: Request,
    response: Response,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    idempotency_key: OptionalIdempotencyKey = None,
) -> dict[str, Any]:
    payload = {"run_id": str(run_id)}
    effective_idempotency_key = idempotency_key or f"campaign-lab-{_request_sha(payload)}"
    result = await _services(request).database.execute_product_command(
        identity,
        operation="cancel_campaign_lab_simulation",
        query="select api.cancel_campaign_lab_run(%s, %s, %s, %s) as payload",
        parameters=(
            run_id,
            effective_idempotency_key,
            _request_sha(payload),
            _correlation_id(request),
        ),
    )
    _replay_header(response, result)
    return result


@router.post(
    "/simulations/{run_id}/clone", status_code=202, operation_id="clone_campaign_lab_simulation"
)
async def clone_simulation(
    run_id: UUID,
    request: Request,
    response: Response,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    idempotency_key: IdempotencyKey,
) -> dict[str, Any]:
    run = await get_simulation(run_id, request, identity)
    if not isinstance(run.get("request"), Mapping):
        rows = await _services(request).database.read_product_rows(
            identity,
            operation="campaign_lab_clone_request",
            query="select request, campaign_id from api.campaign_lab_runs where id = %s",
            parameters=(run_id,),
        )
    else:
        rows = [run]
    if not rows or not isinstance(rows[0].get("request"), Mapping):
        raise AppProblem(
            status=409,
            code="version_conflict",
            title="Simulation cannot be cloned",
            detail="The original request is unavailable.",
        )
    payload = cast(Mapping[str, Any], rows[0]["request"])
    campaign_id = cast(UUID, rows[0]["campaign_id"])
    result = await _store_run(
        request,
        identity,
        campaign_id=campaign_id,
        run_type="repeated_simulation",
        payload=payload,
        secret_payload=None,
        idempotency_key=idempotency_key,
        correlation_id=_correlation_id(request),
    )
    _replay_header(response, result)
    return result


@router.post(
    "/campaigns/{campaign_id}/interviews",
    status_code=201,
    operation_id="create_campaign_lab_interview",
)
async def create_interview(
    campaign_id: UUID,
    body: InterviewCreate,
    request: Request,
    response: Response,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    idempotency_key: IdempotencyKey,
) -> dict[str, Any]:
    if body.source_run_id is None or body.agent_id is None:
        raise _invalid(
            "The interview must reference a succeeded simulation run and agent evidence.",
            field="source_run_id",
        )
    source_rows = await _services(request).database.read_product_rows(
        identity,
        operation="campaign_lab_interview_source_run",
        query="""
          select id, campaign_id, run_type, status, request, result
          from api.campaign_lab_runs
          where id = %s and campaign_id = %s
        """,
        parameters=(body.source_run_id, campaign_id),
    )
    if (
        not source_rows
        or source_rows[0].get("run_type") != "repeated_simulation"
        or source_rows[0].get("status") != "succeeded"
        or not isinstance(source_rows[0].get("request"), Mapping)
        or not isinstance(source_rows[0].get("result"), Mapping)
    ):
        raise AppProblem(
            status=409,
            code="version_conflict",
            title="Interview source is not ready",
            detail="A persona interview requires a succeeded repeated simulation run.",
        )
    payload = {
        "source_run_id": str(body.source_run_id),
        "agent_id": str(body.agent_id),
        "variant_key": body.variant_key,
        "question": body.question,
        "prompt_version": body.prompt_version,
        "simulation_request": source_rows[0]["request"],
        "simulation_result": source_rows[0]["result"],
    }
    result = await _store_run(
        request,
        identity,
        campaign_id=campaign_id,
        run_type="interview",
        payload=payload,
        secret_payload=None,
        idempotency_key=idempotency_key,
        correlation_id=_correlation_id(request),
    )
    _replay_header(response, result)
    return result


@router.get("/interviews/runs/{run_id}", operation_id="get_campaign_lab_interview_run")
async def get_interview_run(
    run_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> dict[str, Any]:
    return await _get_campaign_lab_run(run_id, "interview", request, identity)


@router.get("/interviews/{artifact_id}", operation_id="get_campaign_lab_interview")
async def get_interview(
    artifact_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> dict[str, Any]:
    rows = await _services(request).database.read_product_rows(
        identity,
        operation="campaign_lab_interview",
        query="""
          select id, organization_id, campaign_id, kind, status, title, payload,
                 provenance, checksum_sha256, retention_until, created_by, created_at, updated_at
          from api.campaign_lab_artifacts
          where id = %s and kind = 'interview'
        """,
        parameters=(artifact_id,),
    )
    if not rows:
        raise AppProblem(
            status=404,
            code="not_found",
            title="Campaign Lab interview not found",
            detail="The interview is absent or not visible.",
        )
    return rows[0]


@router.post(
    "/campaigns/{campaign_id}/cultural-evaluations",
    status_code=201,
    operation_id="create_campaign_lab_cultural_evaluation",
)
async def create_cultural_evaluation(
    campaign_id: UUID,
    body: CulturalEvaluationCreate,
    request: Request,
    response: Response,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    idempotency_key: IdempotencyKey,
) -> dict[str, Any]:
    try:
        suite = CulturalEvaluationSuite.model_validate(body.suite)
        evaluation = evaluate_cultural_suite(suite)
    except ValueError as error:
        raise _invalid(
            "The cultural evaluation requires human-reviewed English, Filipino, and Taglish cases.",
            field="suite",
        ) from error
    artifact = ArtifactCreate(
        title=f"Language and cultural evaluation {suite.suite_id}",
        payload={
            "suite": suite.model_dump(mode="json"),
            "result": evaluation.model_dump(mode="json"),
        },
        provenance={
            "evidence_status": "Human-reviewed",
            "suite_id": suite.suite_id,
            "suite_checksum_sha256": suite.checksum_sha256,
            "supported_languages": ["english", "filipino", "taglish"],
        },
    )
    result = await _store_artifact(
        request,
        identity,
        campaign_id=campaign_id,
        kind="cultural_evaluation",
        body=artifact,
        idempotency_key=idempotency_key,
        correlation_id=_correlation_id(request),
    )
    _replay_header(response, result)
    return {**result, "evaluation": evaluation.model_dump(mode="json")}


@router.post(
    "/campaigns/{campaign_id}/surveys/import",
    status_code=202,
    operation_id="import_campaign_lab_survey",
)
async def import_survey(
    campaign_id: UUID,
    body: SurveyImportCreate,
    request: Request,
    response: Response,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    idempotency_key: IdempotencyKey,
) -> dict[str, Any]:
    metadata = {**body.metadata, "format": body.format, "field_map": body.field_map}
    _validate_policy(metadata)
    # Survey rows must pass through the same durable lease/retry path as every
    # other long-running Campaign Lab operation. The public request contains
    # only schema/provenance metadata; the raw export remains in the worker
    # secret envelope and is consumed in memory.
    result = await _store_run(
        request,
        identity,
        campaign_id=campaign_id,
        run_type="survey_import",
        payload={
            "format": body.format,
            "metadata": body.metadata,
            "field_map": body.field_map,
        },
        secret_payload=body.secret_payload,
        idempotency_key=idempotency_key,
        correlation_id=_correlation_id(request),
    )
    _replay_header(response, result)
    return result


@router.get("/surveys/runs/{run_id}", operation_id="get_campaign_lab_survey_import_run")
async def get_survey_import_run(
    run_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> dict[str, Any]:
    return await _get_campaign_lab_run(run_id, "survey_import", request, identity)


@router.post(
    "/campaigns/{campaign_id}/calibrations",
    status_code=202,
    operation_id="create_campaign_lab_calibration",
)
async def create_calibration(
    campaign_id: UUID,
    body: CalibrationCreate,
    request: Request,
    response: Response,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    idempotency_key: IdempotencyKey,
) -> dict[str, Any]:
    payload = body.model_dump(mode="json", exclude={"secret_payload"})
    result = await _store_run(
        request,
        identity,
        campaign_id=campaign_id,
        run_type="survey_calibration",
        payload=payload,
        secret_payload=body.secret_payload,
        idempotency_key=idempotency_key,
        correlation_id=_correlation_id(request),
    )
    _replay_header(response, result)
    return result


@router.get("/calibrations/{run_id}", operation_id="get_campaign_lab_calibration")
async def get_calibration(
    run_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> dict[str, Any]:
    return await _get_evidence_run(run_id, "survey_calibration", request, identity)


@router.post(
    "/campaigns/{campaign_id}/backtests",
    status_code=202,
    operation_id="create_campaign_lab_backtest",
)
async def create_backtest(
    campaign_id: UUID,
    body: BacktestCreate,
    request: Request,
    response: Response,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    idempotency_key: IdempotencyKey,
) -> dict[str, Any]:
    payload = body.model_dump(mode="json", exclude={"secret_payload"})
    result = await _store_run(
        request,
        identity,
        campaign_id=campaign_id,
        run_type="historical_backtest",
        payload=payload,
        secret_payload=body.secret_payload,
        idempotency_key=idempotency_key,
        correlation_id=_correlation_id(request),
    )
    _replay_header(response, result)
    return result


@router.get("/backtests/{run_id}", operation_id="get_campaign_lab_backtest")
async def get_backtest(
    run_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> dict[str, Any]:
    return await _get_evidence_run(run_id, "historical_backtest", request, identity)


@router.post(
    "/campaigns/{campaign_id}/compliance/reviews",
    status_code=201,
    operation_id="create_campaign_lab_compliance_review",
)
async def create_compliance_review(
    campaign_id: UUID,
    body: ComplianceCreate,
    request: Request,
    response: Response,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    idempotency_key: IdempotencyKey,
) -> dict[str, Any]:
    review_id = uuid4()
    payload = {
        "review_id": str(review_id),
        "payload": body.payload,
        "reviewer": body.reviewer,
    }
    result = await _store_run(
        request,
        identity,
        campaign_id=campaign_id,
        run_type="compliance_review",
        payload=payload,
        secret_payload=None,
        idempotency_key=idempotency_key,
        correlation_id=_correlation_id(request),
        validate=False,
    )
    _replay_header(response, result)
    return result


@router.get(
    "/campaigns/{campaign_id}/compliance/runs/{run_id}",
    operation_id="get_campaign_lab_compliance_run",
)
async def get_compliance_run(
    campaign_id: UUID,
    run_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> dict[str, Any]:
    run = await _get_campaign_lab_run(run_id, "compliance_review", request, identity)
    if run.get("campaign_id") != campaign_id:
        raise AppProblem(
            status=404,
            code="not_found",
            title="Campaign Lab durable run not found",
            detail="The requested run is absent or not visible to the campaign.",
        )
    return run


@router.get("/campaigns/{campaign_id}/audit", operation_id="list_campaign_lab_audit_events")
async def campaign_audit(
    campaign_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    limit: PageSize = 100,
    offset: int = Query(default=0, ge=0, le=10_000),
) -> dict[str, Any]:
    await _campaign_row(request, identity, campaign_id)
    rows = await _services(request).database.read_product_rows(
        identity,
        operation="campaign_lab_audit_events",
        query="""
          select id, campaign_id, run_id, artifact_id, stage, progress, event_kind,
                 message, metadata, created_at
          from api.campaign_lab_events
          where campaign_id = %s
          order by created_at asc, id asc
          limit %s offset %s
        """,
        parameters=(campaign_id, limit, offset),
    )
    return {"items": rows, "pagination": {"limit": limit, "offset": offset}}


@router.post(
    "/campaigns/{campaign_id}/reports", status_code=201, operation_id="create_campaign_lab_report"
)
async def create_report(
    campaign_id: UUID,
    body: ReportCreate,
    request: Request,
    response: Response,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    idempotency_key: IdempotencyKey,
) -> dict[str, Any]:
    await _campaign_row(request, identity, campaign_id)
    rows = await _services(request).database.read_product_rows(
        identity,
        operation="campaign_lab_report_source_run",
        query="""
          select id, campaign_id, run_type, request, result, status
          from api.campaign_lab_runs
          where id = %s and campaign_id = %s
        """,
        parameters=(body.run_id, campaign_id),
    )
    if (
        not rows
        or rows[0].get("run_type") != "repeated_simulation"
        or rows[0].get("status") != "succeeded"
    ):
        raise AppProblem(
            status=409,
            code="version_conflict",
            title="Report source is not ready",
            detail="A report can only be created from a succeeded durable run.",
        )
    source = rows[0]

    async def evidence_result(
        run_id: UUID | None,
        expected_type: Literal["survey_calibration", "historical_backtest", "compliance_review"],
    ) -> Mapping[str, Any] | None:
        if run_id is None:
            return None
        evidence_rows = await _services(request).database.read_product_rows(
            identity,
            operation=f"campaign_lab_report_{expected_type}",
            query="""
              select id, campaign_id, run_type, status, result
              from api.campaign_lab_runs
              where id = %s and campaign_id = %s and run_type = %s
            """,
            parameters=(run_id, campaign_id, expected_type),
        )
        if (
            not evidence_rows
            or evidence_rows[0].get("status") != "succeeded"
            or not isinstance(evidence_rows[0].get("result"), Mapping)
        ):
            raise AppProblem(
                status=409,
                code="version_conflict",
                title="Report evidence is not ready",
                detail=(
                    "Attach a succeeded calibration or backtest run before generating the report."
                ),
            )
        return cast(Mapping[str, Any], evidence_rows[0]["result"])

    calibration_result = await evidence_result(body.calibration_run_id, "survey_calibration")
    historical_backtest_result = await evidence_result(
        body.historical_backtest_run_id, "historical_backtest"
    )
    compliance_result = await evidence_result(body.compliance_review_run_id, "compliance_review")
    if body.approval_status == "approved_experimental" and (
        not isinstance(compliance_result, Mapping)
        or compliance_result.get("status") != "approved_experimental"
    ):
        raise AppProblem(
            status=409,
            code="version_conflict",
            title="Approved report requires compliance evidence",
            detail=(
                "Only a succeeded compliance review with approved_experimental status "
                "can authorize this report state."
            ),
        )
    cultural_evaluation: Mapping[str, Any] | None = None
    if body.cultural_evaluation_artifact_id is not None:
        cultural_rows = await _services(request).database.read_product_rows(
            identity,
            operation="campaign_lab_report_cultural_evaluation",
            query="""
              select payload
              from api.campaign_lab_artifacts
              where id = %s and campaign_id = %s and kind = 'cultural_evaluation'
            """,
            parameters=(body.cultural_evaluation_artifact_id, campaign_id),
        )
        if not cultural_rows or not isinstance(cultural_rows[0].get("payload"), Mapping):
            raise AppProblem(
                status=404,
                code="not_found",
                title="Cultural evaluation not found",
                detail="The selected language evaluation is absent or not visible.",
            )
        payload = cast(Mapping[str, Any], cultural_rows[0]["payload"])
        raw_result = payload.get("result", payload)
        if not isinstance(raw_result, Mapping):
            raise _invalid(
                "The cultural evaluation artifact does not contain a valid result.",
                field="cultural_evaluation_artifact_id",
            )
        cultural_evaluation = raw_result
    if not isinstance(source.get("request"), Mapping) or not isinstance(
        source.get("result"), Mapping
    ):
        raise _invalid(
            "The durable run does not contain a valid Campaign Lab report source.", field="run_id"
        )
    payload = {
        "source_run_id": str(body.run_id),
        "simulation_request": source["request"],
        "simulation_result": source["result"],
        "survey_calibration": calibration_result,
        "historical_backtest": historical_backtest_result,
        "compliance_review": compliance_result,
        "cultural_evaluation": cultural_evaluation,
        "human_reviewer": body.human_reviewer,
        "approval_status": body.approval_status,
    }
    result = await _store_run(
        request,
        identity,
        campaign_id=campaign_id,
        run_type="report",
        payload=payload,
        secret_payload=None,
        idempotency_key=idempotency_key,
        correlation_id=_correlation_id(request),
    )
    _replay_header(response, result)
    return result


@router.get("/reports/runs/{run_id}", operation_id="get_campaign_lab_report_run")
async def get_report_run(
    run_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> dict[str, Any]:
    return await _get_campaign_lab_run(run_id, "report", request, identity)


@router.get("/reports/{artifact_id}", operation_id="get_campaign_lab_report")
async def get_report(
    artifact_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> dict[str, Any]:
    rows = await _services(request).database.read_product_rows(
        identity,
        operation="campaign_lab_report",
        query="""
          select id, organization_id, campaign_id, kind, status, title, payload,
                 provenance, checksum_sha256, created_by, created_at, updated_at
          from api.campaign_lab_artifacts
          where id = %s and kind = 'report'
        """,
        parameters=(artifact_id,),
    )
    if not rows:
        raise AppProblem(
            status=404,
            code="not_found",
            title="Campaign Lab report not found",
            detail="The report is absent or not visible.",
        )
    return rows[0]
