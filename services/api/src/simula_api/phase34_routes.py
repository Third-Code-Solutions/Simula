"""Phase 3 methodology and Phase 4 product routes."""

from __future__ import annotations

import hashlib
import secrets
from collections.abc import Mapping
from typing import Annotated, Any, cast
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import APIRouter, Depends, Path, Query, Request, Response
from fastapi.encoders import jsonable_encoder
from psycopg.types.json import Jsonb
from pydantic import JsonValue
from simula_core.methodology import (
    AudienceCriterion,
    AudienceDefinitionVersion,
    DeterministicCohortProvider,
    DimensionValue,
    MethodologyEngine,
    PopulationCell,
    PopulationFrameVersion,
    SamplingConfiguration,
    SourceProvenance,
)
from simula_core.reporting import (
    CompleteReport,
    build_complete_report,
    compare_variants,
    export_report,
)

from simula_api.auth import VerifiedIdentity
from simula_api.database import canonical_request_sha256
from simula_api.phase34_models import (
    AudienceCommandResponse,
    AudienceCreate,
    ExportCreate,
    FeatureFlagSet,
    FeedbackCreate,
    InvitationAccept,
    InvitationCreate,
    MethodologyPreviewCreate,
    MethodologyRegistryResponse,
    OrganizationDashboardResponse,
    ProductCollectionResponse,
    ProductCommandResponse,
    ReportCreate,
    ReportShareCreate,
    RunMethodologyReportCreate,
    SimulationConfigurationCommandResponse,
    SimulationConfigurationCreate,
    VariantGroupCreate,
)
from simula_api.problems import AppProblem
from simula_api.routes import (
    IdempotencyKey,
    _correlation_id,
    _problem_response,
    _services,
    rate_limited_identity,
)

router = APIRouter(
    prefix="/api/v1",
    responses={
        401: _problem_response("Authentication is missing, expired, or invalid."),
        403: _problem_response("The authenticated role cannot perform this action."),
        404: _problem_response("The resource is absent or not visible to the caller."),
        409: _problem_response("The request conflicts with current durable state."),
        413: _problem_response("The request exceeds the API body limit."),
        415: _problem_response("Only JSON command bodies are supported."),
        422: _problem_response("The request is invalid or outside the supported scope."),
        429: _problem_response("A durable quota or rate limit was reached."),
        503: _problem_response("A required dependency is temporarily unavailable."),
    },
)


def _json(value: Any) -> JsonValue:
    return cast(JsonValue, jsonable_encoder(value))


def _hash(body: object, **scope: object) -> str:
    payload = body.model_dump(mode="json") if hasattr(body, "model_dump") else body
    return canonical_request_sha256({"body": cast(Any, payload), **scope})


def _replay_header(response: Response, payload: dict[str, Any]) -> None:
    response.headers["Idempotent-Replayed"] = str(bool(payload.get("replayed"))).lower()


@router.get(
    "/organizations/{organization_id}/dashboard",
    operation_id="get_organization_dashboard",
    response_model=OrganizationDashboardResponse,
)
async def organization_dashboard(
    organization_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> OrganizationDashboardResponse:
    """Return one membership-scoped dashboard projection under tenant RLS."""

    payload = await _services(request).database.read_product_json(
        identity,
        operation="organization_dashboard",
        query="""
          select pg_catalog.jsonb_build_object(
            'organization_id', organizations.id,
            'organization_name', organizations.name,
            'organization_status', organizations.status,
            'role', case
              when private.is_platform_superadmin(private.verified_subject()) then 'owner'
              else memberships.role::text
            end,
            'platform_role', case
              when private.is_platform_superadmin(private.verified_subject()) then 'superadmin'
              else null
            end,
            'permissions', pg_catalog.jsonb_build_object(
              'can_create_projects', private.is_platform_superadmin(private.verified_subject())
                or memberships.role in ('owner', 'editor'),
              'can_create_runs', private.is_platform_superadmin(private.verified_subject())
                or memberships.role in ('owner', 'editor'),
              'can_manage_team', private.is_platform_superadmin(private.verified_subject())
                or memberships.role = 'owner',
              'can_manage_settings', private.is_platform_superadmin(private.verified_subject())
                or memberships.role = 'owner',
              'can_view_audit', private.is_platform_superadmin(private.verified_subject())
                or memberships.role = 'owner'
            ),
            'metrics', pg_catalog.jsonb_build_object(
              'projects', (
                select pg_catalog.count(*) from api.projects
                where organization_id = organizations.id and status <> 'deleted'
              ),
              'audiences', (
                select pg_catalog.count(*) from api.audiences
                where organization_id = organizations.id
              ),
              'runs', (
                select pg_catalog.count(*) from api.simulation_runs
                where organization_id = organizations.id
              ),
              'active_runs', (
                select pg_catalog.count(*) from api.simulation_runs
                where organization_id = organizations.id
                  and state in ('queued', 'running', 'retrying', 'cancel_requested')
              ),
              'succeeded_runs', (
                select pg_catalog.count(*) from api.simulation_runs
                where organization_id = organizations.id and state = 'succeeded'
              ),
              'failed_runs', (
                select pg_catalog.count(*) from api.simulation_runs
                where organization_id = organizations.id and state = 'failed'
              ),
              'reports', (
                select pg_catalog.count(*) from api.report_artifacts
                where organization_id = organizations.id
              ),
              'feedback_records', (
                select pg_catalog.count(*) from api.feedback_records
                where organization_id = organizations.id
              )
            ),
            'recent_projects', coalesce((
              select pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'id', recent.id,
                  'name', recent.name,
                  'objective', recent.objective,
                  'status', recent.status,
                  'version', recent.version,
                  'updated_at', recent.updated_at
                ) order by recent.updated_at desc, recent.id desc
              )
              from (
                select id, name, objective, status, version, updated_at
                from api.projects
                where organization_id = organizations.id and status <> 'deleted'
                order by updated_at desc, id desc
                limit 6
              ) as recent
            ), '[]'::jsonb),
            'recent_runs', coalesce((
              select pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'id', recent.id,
                  'project_id', recent.project_id,
                  'project_name', recent.project_name,
                  'state', recent.state,
                  'created_at', recent.created_at
                ) order by recent.created_at desc, recent.id desc
              )
              from (
                select runs.id, runs.project_id, projects.name as project_name,
                       runs.state, runs.created_at
                from api.simulation_runs as runs
                join api.projects as projects on projects.id = runs.project_id
                  and projects.organization_id = runs.organization_id
                where runs.organization_id = organizations.id
                order by runs.created_at desc, runs.id desc
                limit 8
              ) as recent
            ), '[]'::jsonb),
            'recent_reports', coalesce((
              select pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'id', recent.id,
                  'run_id', recent.run_id,
                  'project_id', recent.project_id,
                  'project_name', recent.project_name,
                  'created_at', recent.created_at
                ) order by recent.created_at desc, recent.id desc
              )
              from (
                select reports.id, reports.run_id, runs.project_id,
                       projects.name as project_name, reports.created_at
                from api.report_artifacts as reports
                join api.simulation_runs as runs on runs.id = reports.run_id
                  and runs.organization_id = reports.organization_id
                join api.projects as projects on projects.id = runs.project_id
                  and projects.organization_id = runs.organization_id
                where reports.organization_id = organizations.id
                order by reports.created_at desc, reports.id desc
                limit 6
              ) as recent
            ), '[]'::jsonb),
            'generated_at', pg_catalog.statement_timestamp()
          ) as payload
          from api.organizations as organizations
          left join api.organization_memberships as memberships
            on memberships.organization_id = organizations.id
           and memberships.user_id = private.verified_subject()
          where organizations.id = %s
            and organizations.status <> 'deleted'
            and (
              memberships.user_id is not null
              or private.is_platform_superadmin(private.verified_subject())
            )
        """,
        parameters=(organization_id,),
    )
    return OrganizationDashboardResponse.model_validate(payload)


@router.get(
    "/methodology/registry",
    operation_id="get_methodology_registry",
    response_model=MethodologyRegistryResponse,
)
async def methodology_registry(
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> MethodologyRegistryResponse:
    database = _services(request).database
    population_frames = await database.read_product_rows(
        identity,
        operation="list_population_frames",
        query="""
          select id, population_frame_id, version, validation_status, manifest,
            checksum_sha256, created_at
          from api.population_frame_versions
          order by created_at, id
          limit 100
        """,
        parameters=(),
    )
    methodologies = await database.read_product_rows(
        identity,
        operation="list_methodologies",
        query="""
          select id, methodology_key, version, validation_status, manifest,
            checksum_sha256, created_at
          from api.methodology_versions
          where validation_status <> 'retired'
          order by methodology_key, version
          limit 100
        """,
        parameters=(),
    )
    providers = await database.read_product_rows(
        identity,
        operation="list_provider_configurations",
        query="""
          select id, provider_id, version, admission_status, external_provider,
            model_id, template_id, limits, checksum_sha256, created_at
          from api.provider_configuration_versions
          where admission_status <> 'retired'
          order by provider_id, version
          limit 100
        """,
        parameters=(),
    )
    return MethodologyRegistryResponse(
        population_frames=cast(list[dict[str, JsonValue]], _json(population_frames)),
        methodologies=cast(list[dict[str, JsonValue]], _json(methodologies)),
        providers=cast(list[dict[str, JsonValue]], _json(providers)),
    )


@router.post(
    "/organizations/{organization_id}/audiences",
    operation_id="create_audience_definition",
    response_model=AudienceCommandResponse,
    status_code=201,
)
async def create_audience(
    organization_id: UUID,
    body: AudienceCreate,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> AudienceCommandResponse:
    payload = await _services(request).database.execute_product_command(
        identity,
        operation="create_audience",
        query="select api.create_audience_definition(%s,%s,%s,%s,%s,%s,%s) as payload",
        parameters=(
            organization_id,
            body.name,
            Jsonb(body.manifest.model_dump(mode="json")),
            body.limitations,
            idempotency_key,
            _hash(body, organization_id=str(organization_id)),
            _correlation_id(request),
        ),
    )
    _replay_header(response, payload)
    if payload.get("replayed"):
        response.status_code = 200
    return AudienceCommandResponse.model_validate(payload)


@router.get(
    "/organizations/{organization_id}/audiences",
    operation_id="list_audience_definitions",
    response_model=ProductCollectionResponse,
)
async def list_audiences(
    organization_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProductCollectionResponse:
    rows = await _services(request).database.read_product_rows(
        identity,
        operation="list_audiences",
        query="""
          select audiences.id as audience_id, audiences.name,
            versions.id as audience_version_id, versions.version, versions.kind,
            versions.admission_status, versions.manifest, versions.checksum_sha256,
            versions.is_non_representative, versions.limitations, versions.created_at
          from api.audiences as audiences
          join api.audience_versions as versions on versions.audience_id = audiences.id
          where audiences.organization_id = %s
          order by versions.created_at desc, versions.id desc
          limit 100
        """,
        parameters=(organization_id,),
    )
    return ProductCollectionResponse(items=cast(list[dict[str, JsonValue]], _json(rows)))


@router.post(
    "/projects/{project_id}/simulation-configurations",
    operation_id="create_simulation_configuration",
    response_model=SimulationConfigurationCommandResponse,
    status_code=201,
)
async def create_simulation_configuration(
    project_id: UUID,
    body: SimulationConfigurationCreate,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> SimulationConfigurationCommandResponse:
    payload = await _services(request).database.execute_product_command(
        identity,
        operation="create_simulation_configuration",
        query=(
            "select api.create_simulation_configuration("
            "%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) as payload"
        ),
        parameters=(
            project_id,
            body.name,
            body.audience_version_id,
            body.population_frame_version_id,
            body.methodology_version_id,
            body.provider_configuration_version_id,
            Jsonb(body.sampling_configuration.model_dump(mode="json")),
            body.cost_ceiling_microusd,
            idempotency_key,
            _hash(body, project_id=str(project_id)),
            _correlation_id(request),
        ),
    )
    _replay_header(response, payload)
    if payload.get("replayed"):
        response.status_code = 200
    return SimulationConfigurationCommandResponse.model_validate(payload)


@router.get(
    "/projects/{project_id}/simulation-configurations",
    operation_id="list_simulation_configurations",
    response_model=ProductCollectionResponse,
)
async def list_simulation_configurations(
    project_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProductCollectionResponse:
    rows = await _services(request).database.read_product_rows(
        identity,
        operation="list_simulation_configurations",
        query="""
          select configurations.id as configuration_id, configurations.name,
            versions.id as configuration_version_id, versions.version,
            versions.audience_version_id, versions.population_frame_version_id,
            versions.methodology_version_id, versions.provider_configuration_version_id,
            versions.sampling_configuration, versions.cost_ceiling_microusd,
            versions.checksum_sha256, versions.created_at
          from api.simulation_configurations as configurations
          join api.simulation_configuration_versions as versions
            on versions.simulation_configuration_id = configurations.id
          where configurations.project_id = %s
          order by versions.created_at desc, versions.id desc
          limit 100
        """,
        parameters=(project_id,),
    )
    return ProductCollectionResponse(items=cast(list[dict[str, JsonValue]], _json(rows)))


def _population_from_row(row: Mapping[str, Any]) -> PopulationFrameVersion:
    manifest = cast(Mapping[str, Any], row["population_manifest"])
    provenance = []
    for raw in cast(list[Mapping[str, Any]], manifest["provenance"]):
        raw_transformations = raw.get("transformations", ())
        if not raw_transformations and isinstance(raw.get("transformation"), str):
            raw_transformations = (raw["transformation"],)
        provenance.append(
            SourceProvenance(
                source_id=raw["source_id"],
                source_version=raw["source_version"],
                owner=raw["owner"],
                license=raw["license"],
                allowed_uses=tuple(raw["allowed_uses"]),
                collection_period=raw["collection_period"],
                sampling_frame=raw["sampling_frame"],
                transformations=tuple(raw_transformations),
                known_biases=tuple(raw["known_biases"]),
                coverage_limitations=tuple(raw["coverage_limitations"]),
                validation_status=(
                    "benchmarked"
                    if row["population_validation_status"] == "benchmarked"
                    else "experimental"
                ),
            )
        )
    cells = tuple(
        PopulationCell(
            key=raw["key"],
            weight=raw["weight"],
            dimensions=tuple(
                DimensionValue(dimension=dimension, value=value)
                for dimension, value in sorted(cast(Mapping[str, str], raw["dimensions"]).items())
            ),
        )
        for raw in sorted(
            cast(list[Mapping[str, Any]], manifest["cells"]), key=lambda item: item["key"]
        )
    )
    raw_limitations = row["population_limitations"]
    limitations = (
        tuple(raw_limitations)
        if isinstance(raw_limitations, (list, tuple))
        else (cast(str, raw_limitations),)
    )
    return PopulationFrameVersion(
        id=row["population_frame_version_id"],
        frame_id=row["population_frame_id"],
        version=row["population_version"],
        name=row["population_name"],
        geography=manifest["geography"],
        target_population=manifest["target_population"],
        inclusion=tuple(manifest["inclusion"]),
        exclusion=tuple(manifest["exclusion"]),
        provenance=tuple(provenance),
        cells=cells,
        validation_status=(
            "benchmarked"
            if row["population_validation_status"] == "benchmarked"
            else "experimental"
        ),
        limitations=limitations,
    )


def _audience_from_row(row: Mapping[str, Any]) -> AudienceDefinitionVersion:
    manifest = cast(Mapping[str, Any], row["audience_manifest"])
    criteria: list[AudienceCriterion] = []
    for raw in cast(list[Mapping[str, Any]], manifest["criteria"]):
        operator = raw["operator"]
        if operator == "not_equals":
            raise ValueError("not_equals criteria require an explicit population complement")
        raw_value = raw["value"]
        values = [raw_value] if isinstance(raw_value, str) else list(raw_value)
        criteria.append(
            AudienceCriterion(
                dimension=raw["attribute"],
                allowed_values=tuple(sorted(set(values))),
            )
        )
    criteria.sort(key=lambda item: item.dimension)
    raw_limitations = row["audience_limitations"]
    limitations = (
        tuple(raw_limitations)
        if isinstance(raw_limitations, (list, tuple))
        else (cast(str, raw_limitations),)
    )
    return AudienceDefinitionVersion(
        id=row["audience_version_id"],
        audience_id=row["audience_id"],
        version=row["audience_version"],
        name=row["audience_name"],
        criteria=tuple(criteria),
        provenance_status=manifest["provenance_status"],
        limitations=limitations,
    )


@router.post(
    "/projects/{project_id}/methodology-previews",
    operation_id="create_methodology_preview",
    response_model=ProductCommandResponse,
)
async def create_methodology_preview(
    project_id: UUID,
    body: MethodologyPreviewCreate,
    request: Request,
    idempotency_key: IdempotencyKey,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProductCommandResponse:
    database = _services(request).database
    rows = await database.read_product_rows(
        identity,
        operation="read_methodology_preview_configuration",
        query="""
          select versions.id as configuration_version_id, versions.created_at,
            versions.audience_version_id, versions.population_frame_version_id,
            versions.sampling_configuration, versions.cost_ceiling_microusd,
            configurations.project_id,
            audiences.id as audience_id, audiences.name as audience_name,
            audience_versions.version as audience_version,
            audience_versions.manifest as audience_manifest,
            audience_versions.limitations as audience_limitations,
            population_versions.population_frame_id,
            population_versions.version as population_version,
            population_versions.manifest as population_manifest,
            population_versions.validation_status::text as population_validation_status,
            population_versions.limitations as population_limitations,
            population_frames.name as population_name,
            methodologies.methodology_key,
            providers.provider_id, providers.external_provider
          from api.simulation_configuration_versions as versions
          join api.simulation_configurations as configurations
            on configurations.id = versions.simulation_configuration_id
          join api.audience_versions on audience_versions.id = versions.audience_version_id
          join api.audiences as audiences on audiences.id = audience_versions.audience_id
          join api.population_frame_versions as population_versions
            on population_versions.id = versions.population_frame_version_id
          join api.population_frames as population_frames
            on population_frames.id = population_versions.population_frame_id
          join api.methodology_versions as methodologies
            on methodologies.id = versions.methodology_version_id
          join api.provider_configuration_versions as providers
            on providers.id = versions.provider_configuration_version_id
          where versions.id = %s and configurations.project_id = %s
          limit 1
        """,
        parameters=(body.configuration_version_id, project_id),
    )
    stimulus_rows = await database.read_product_rows(
        identity,
        operation="read_methodology_preview_stimulus",
        query="""
          select versions.content
          from api.stimulus_versions as versions
          join api.stimuli as stimuli on stimuli.id = versions.stimulus_id
          where versions.id = %s and stimuli.project_id = %s and stimuli.status = 'active'
          limit 1
        """,
        parameters=(body.stimulus_version_id, project_id),
    )
    if not rows or not stimulus_rows:
        raise AppProblem(
            status=404,
            code="not_found",
            title="Resource not found",
            detail="The frozen configuration or stimulus version was not found.",
        )
    row = rows[0]
    if row["external_provider"] or row["provider_id"] != "deterministic_cohort":
        raise AppProblem(
            status=422,
            code="validation_error",
            title="Provider unavailable for preview",
            detail="Synchronous preview supports only the zero-cost deterministic provider.",
        )
    if body.run_id is not None:
        run_rows = await database.read_product_rows(
            identity,
            operation="read_methodology_preview_run",
            query="""
              select id from api.simulation_runs
              where id = %s and project_id = %s and stimulus_version_id = %s
                and state = 'succeeded'
              limit 1
            """,
            parameters=(body.run_id, project_id, body.stimulus_version_id),
        )
        if not run_rows:
            raise AppProblem(
                status=409,
                code="version_conflict",
                title="Completed run unavailable",
                detail="A matching succeeded run is required for a durable methodology report.",
            )
        run_id = body.run_id
    else:
        run_id = uuid5(
            NAMESPACE_URL,
            f"simula:{identity.user_id}:{project_id}:{body.configuration_version_id}:"
            f"{body.stimulus_version_id}:{idempotency_key}",
        )
    try:
        result = MethodologyEngine(DeterministicCohortProvider()).run(
            run_id=run_id,
            stimulus=cast(str, stimulus_rows[0]["content"]),
            population=_population_from_row(row),
            audience=_audience_from_row(row),
            configuration=SamplingConfiguration.model_validate(row["sampling_configuration"]),
            methodology_version=cast(str, row["methodology_key"]),
            cost_ceiling_microusd=cast(int, row["cost_ceiling_microusd"]),
        )
        report = build_complete_report(
            result,
            report_id=uuid5(NAMESPACE_URL, f"simula-report:{run_id}"),
            project_id=project_id,
            stimulus_version_id=body.stimulus_version_id,
            variant_key=body.variant_key,
            variant_label=body.variant_label,
            created_at=row["created_at"],
        )
    except ValueError as error:
        raise AppProblem(
            status=422,
            code="validation_error",
            title="Methodology preview rejected",
            detail=str(error),
        ) from error
    return ProductCommandResponse(
        data=cast(
            dict[str, JsonValue],
            _json(
                {
                    "methodology_result": result.model_dump(mode="json"),
                    "report": report.model_dump(mode="json"),
                    "replayed": False,
                }
            ),
        )
    )


@router.post(
    "/projects/{project_id}/variant-groups",
    operation_id="create_variant_group",
    response_model=ProductCommandResponse,
    status_code=201,
)
async def create_variant_group(
    project_id: UUID,
    body: VariantGroupCreate,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProductCommandResponse:
    payload = await _services(request).database.execute_product_command(
        identity,
        operation="create_variant_group",
        query="select api.create_variant_group(%s,%s,%s,%s,%s,%s) as payload",
        parameters=(
            project_id,
            body.name,
            Jsonb(
                [
                    {**member.model_dump(mode="json"), "sort_order": index}
                    for index, member in enumerate(body.members, start=1)
                ]
            ),
            idempotency_key,
            _hash(body, project_id=str(project_id)),
            _correlation_id(request),
        ),
    )
    _replay_header(response, payload)
    if payload.get("replayed"):
        response.status_code = 200
    return ProductCommandResponse(data=cast(dict[str, JsonValue], _json(payload)))


@router.get(
    "/projects/{project_id}/variant-groups",
    operation_id="list_variant_groups",
    response_model=ProductCollectionResponse,
)
async def list_variant_groups(
    project_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProductCollectionResponse:
    rows = await _services(request).database.read_product_rows(
        identity,
        operation="list_variant_groups",
        query="""
          select groups.id, groups.name, groups.created_at,
            coalesce(jsonb_agg(jsonb_build_object(
              'id', members.id, 'stimulus_version_id', members.stimulus_version_id,
              'variant_key', members.variant_key, 'label', members.label,
              'sort_order', members.sort_order
            ) order by members.sort_order) filter (where members.id is not null), '[]') as members
          from api.variant_groups as groups
          left join api.variant_members as members on members.variant_group_id = groups.id
          where groups.project_id = %s
          group by groups.id
          order by groups.created_at desc, groups.id desc
          limit 100
        """,
        parameters=(project_id,),
    )
    return ProductCollectionResponse(items=cast(list[dict[str, JsonValue]], _json(rows)))


@router.get(
    "/variant-groups/{variant_group_id}/comparison",
    operation_id="compare_variant_reports",
    response_model=ProductCollectionResponse,
)
async def compare_variant_reports(
    variant_group_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProductCollectionResponse:
    rows = await _services(request).database.read_product_rows(
        identity,
        operation="compare_variant_reports",
        query="""
          select members.variant_key, members.label, reports.artifact
          from api.variant_members as members
          join lateral (
            select artifacts.artifact
            from api.simulation_runs as runs
            join api.report_artifacts as artifacts on artifacts.run_id = runs.id
            where runs.organization_id = members.organization_id
              and runs.stimulus_version_id = members.stimulus_version_id
            order by artifacts.created_at desc, artifacts.id desc
            limit 1
          ) as reports on true
          where members.variant_group_id = %s
          order by members.sort_order
          limit 8
        """,
        parameters=(variant_group_id,),
    )
    if len(rows) < 2:
        raise AppProblem(
            status=409,
            code="version_conflict",
            title="Comparable reports unavailable",
            detail="At least two variants need complete reports under one frozen configuration.",
        )
    baseline = CompleteReport.model_validate(rows[0]["artifact"])
    comparisons = []
    for row in rows[1:]:
        try:
            comparison = compare_variants(baseline, CompleteReport.model_validate(row["artifact"]))
        except ValueError as error:
            raise AppProblem(
                status=409,
                code="version_conflict",
                title="Variant configurations differ",
                detail="All compared reports must use the same frozen methodology configuration.",
            ) from error
        comparisons.append(
            {
                "baseline_variant_key": rows[0]["variant_key"],
                "candidate_variant_key": row["variant_key"],
                "comparison": comparison.model_dump(mode="json"),
            }
        )
    return ProductCollectionResponse(items=cast(list[dict[str, JsonValue]], _json(comparisons)))


@router.post(
    "/organizations/{organization_id}/feedback",
    operation_id="create_feedback_record",
    response_model=ProductCommandResponse,
    status_code=201,
)
async def create_feedback(
    organization_id: UUID,
    body: FeedbackCreate,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProductCommandResponse:
    payload = await _services(request).database.execute_product_command(
        identity,
        operation="create_feedback",
        query="select api.create_feedback_record(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) as payload",
        parameters=(
            organization_id,
            body.run_id,
            body.kind,
            body.observed_at,
            Jsonb(body.payload),
            Jsonb(body.provenance),
            body.rights_basis,
            idempotency_key,
            _hash(body, organization_id=str(organization_id)),
            _correlation_id(request),
        ),
    )
    _replay_header(response, payload)
    if payload.get("replayed"):
        response.status_code = 200
    return ProductCommandResponse(data=cast(dict[str, JsonValue], _json(payload)))


@router.get(
    "/organizations/{organization_id}/feedback",
    operation_id="list_feedback_records",
    response_model=ProductCollectionResponse,
)
async def list_feedback(
    organization_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProductCollectionResponse:
    rows = await _services(request).database.read_product_rows(
        identity,
        operation="list_feedback",
        query="""
          select id, run_id, kind, observed_at, payload, provenance,
            rights_basis, checksum_sha256, created_at
          from api.feedback_records where organization_id = %s
          order by observed_at desc, id desc limit 100
        """,
        parameters=(organization_id,),
    )
    return ProductCollectionResponse(items=cast(list[dict[str, JsonValue]], _json(rows)))


@router.post(
    "/runs/{run_id}/methodology-reports",
    operation_id="create_run_methodology_report",
    response_model=ProductCommandResponse,
    status_code=201,
)
async def create_run_methodology_report(
    run_id: UUID,
    body: RunMethodologyReportCreate,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProductCommandResponse:
    database = _services(request).database
    run_rows = await database.read_product_rows(
        identity,
        operation="read_run_for_methodology_report",
        query="""
          select project_id, stimulus_version_id
          from api.simulation_runs where id = %s and state = 'succeeded'
          limit 1
        """,
        parameters=(run_id,),
    )
    if not run_rows:
        raise AppProblem(
            status=409,
            code="version_conflict",
            title="Completed run unavailable",
            detail="A succeeded run is required before generating its methodology report.",
        )
    run_row = run_rows[0]
    preview = await create_methodology_preview(
        cast(UUID, run_row["project_id"]),
        MethodologyPreviewCreate(
            configuration_version_id=body.configuration_version_id,
            stimulus_version_id=cast(UUID, run_row["stimulus_version_id"]),
            variant_key=body.variant_key,
            variant_label=body.variant_label,
            run_id=run_id,
        ),
        request,
        idempotency_key,
        identity,
    )
    report = cast(dict[str, JsonValue], preview.data["report"])
    payload = await database.execute_product_command(
        identity,
        operation="create_methodology_report",
        query="select api.create_report_artifact(%s,%s,%s,%s,%s) as payload",
        parameters=(
            run_id,
            Jsonb(report),
            idempotency_key,
            _hash(body, run_id=str(run_id)),
            _correlation_id(request),
        ),
    )
    _replay_header(response, payload)
    if payload.get("replayed"):
        response.status_code = 200
    payload["artifact"] = report
    return ProductCommandResponse(data=cast(dict[str, JsonValue], _json(payload)))


@router.post(
    "/runs/{run_id}/reports",
    operation_id="create_run_report",
    response_model=ProductCommandResponse,
    status_code=201,
)
async def create_report(
    run_id: UUID,
    body: ReportCreate,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProductCommandResponse:
    CompleteReport.model_validate(body.artifact)
    payload = await _services(request).database.execute_product_command(
        identity,
        operation="create_report",
        query="select api.create_report_artifact(%s,%s,%s,%s,%s) as payload",
        parameters=(
            run_id,
            Jsonb(body.artifact),
            idempotency_key,
            _hash(body, run_id=str(run_id)),
            _correlation_id(request),
        ),
    )
    _replay_header(response, payload)
    if payload.get("replayed"):
        response.status_code = 200
    return ProductCommandResponse(data=cast(dict[str, JsonValue], _json(payload)))


@router.get(
    "/runs/{run_id}/report",
    operation_id="get_run_report",
    response_model=ProductCommandResponse,
)
async def get_report(
    run_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProductCommandResponse:
    rows = await _services(request).database.read_product_rows(
        identity,
        operation="get_report",
        query="""
          select id as report_id, run_id, schema_version, artifact,
            content_sha256, created_at
          from api.report_artifacts where run_id = %s
          order by created_at desc, id desc limit 1
        """,
        parameters=(run_id,),
    )
    if not rows:
        raise AppProblem(
            status=404,
            code="not_found",
            title="Resource not found",
            detail="No report exists for this run.",
        )
    return ProductCommandResponse(data=cast(dict[str, JsonValue], _json(rows[0])))


@router.post(
    "/reports/{report_id}/exports",
    operation_id="create_report_export",
    response_model=ProductCommandResponse,
    status_code=201,
)
async def create_export(
    report_id: UUID,
    body: ExportCreate,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProductCommandResponse:
    rows = await _services(request).database.read_product_rows(
        identity,
        operation="read_report_for_export",
        query="select artifact from api.report_artifacts where id = %s limit 1",
        parameters=(report_id,),
    )
    if not rows:
        raise AppProblem(
            status=404,
            code="not_found",
            title="Resource not found",
            detail="The report was not found.",
        )
    exported = export_report(CompleteReport.model_validate(rows[0]["artifact"]), body.format)
    payload = await _services(request).database.execute_product_command(
        identity,
        operation="create_export",
        query="select api.create_report_export(%s,%s,%s,%s,%s,%s,%s,%s) as payload",
        parameters=(
            report_id,
            body.format,
            exported.filename,
            exported.content,
            body.expires_at,
            idempotency_key,
            _hash(body, report_id=str(report_id)),
            _correlation_id(request),
        ),
    )
    _replay_header(response, payload)
    if payload.get("replayed"):
        response.status_code = 200
    return ProductCommandResponse(data=cast(dict[str, JsonValue], _json(payload)))


@router.get("/exports/{export_id}", operation_id="download_report_export")
async def download_export(
    export_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> Response:
    rows = await _services(request).database.read_product_rows(
        identity,
        operation="download_export",
        query="""
          select format, filename, content, content_sha256
          from api.report_exports
          where id = %s and deleted_at is null and expires_at > statement_timestamp()
          limit 1
        """,
        parameters=(export_id,),
    )
    if not rows:
        raise AppProblem(
            status=404,
            code="not_found",
            title="Resource not found",
            detail="The export is missing or expired.",
        )
    row = rows[0]
    media_type = "application/json" if row["format"] == "json" else "text/csv; charset=utf-8"
    return Response(
        content=bytes(row["content"]),
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{row["filename"]}"',
            "ETag": f'"{row["content_sha256"]}"',
        },
    )


@router.post(
    "/reports/{report_id}/shares",
    operation_id="create_report_share",
    response_model=ProductCommandResponse,
    status_code=201,
)
async def create_report_share(
    report_id: UUID,
    body: ReportShareCreate,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProductCommandResponse:
    share_token = secrets.token_urlsafe(32)
    token_sha256 = hashlib.sha256(share_token.encode()).hexdigest()
    payload = await _services(request).database.execute_product_command(
        identity,
        operation="create_report_share",
        query="select api.create_report_share_grant(%s,%s,%s,%s,%s,%s,%s,%s) as payload",
        parameters=(
            report_id,
            body.recipient_user_id,
            body.permission,
            token_sha256,
            body.expires_at,
            idempotency_key,
            _hash(body, report_id=str(report_id)),
            _correlation_id(request),
        ),
    )
    replayed = bool(payload.get("replayed"))
    _replay_header(response, payload)
    if replayed:
        response.status_code = 200
    else:
        payload["share_token"] = share_token
    return ProductCommandResponse(data=cast(dict[str, JsonValue], _json(payload)))


@router.get(
    "/reports/{report_id}/shares",
    operation_id="list_report_shares",
    response_model=ProductCollectionResponse,
)
async def list_report_shares(
    report_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProductCollectionResponse:
    rows = await _services(request).database.read_product_rows(
        identity,
        operation="list_report_shares",
        query="""
          select id, report_artifact_id as report_id, recipient_user_id,
            permission, expires_at, revoked_at, access_count,
            last_accessed_at, created_at
          from api.report_share_grants where report_artifact_id = %s
          order by created_at desc, id desc limit 100
        """,
        parameters=(report_id,),
    )
    return ProductCollectionResponse(items=cast(list[dict[str, JsonValue]], _json(rows)))


@router.get(
    "/shared-reports/{token}",
    operation_id="access_shared_report",
    response_model=ProductCommandResponse,
)
async def access_shared_report(
    token: Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{43}$")],
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProductCommandResponse:
    payload = await _services(request).database.read_product_json(
        identity,
        operation="access_shared_report",
        query="select api.access_shared_report(%s,%s) as payload",
        parameters=(hashlib.sha256(token.encode()).hexdigest(), _correlation_id(request)),
    )
    return ProductCommandResponse(data=cast(dict[str, JsonValue], _json(payload)))


@router.delete(
    "/report-shares/{share_id}",
    operation_id="revoke_report_share",
    response_model=ProductCommandResponse,
)
async def revoke_report_share(
    share_id: UUID,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProductCommandResponse:
    payload = await _services(request).database.execute_product_command(
        identity,
        operation="revoke_report_share",
        query="select api.revoke_report_share_grant(%s,%s,%s,%s) as payload",
        parameters=(
            share_id,
            idempotency_key,
            canonical_request_sha256({"share_id": str(share_id)}),
            _correlation_id(request),
        ),
    )
    _replay_header(response, payload)
    return ProductCommandResponse(data=cast(dict[str, JsonValue], _json(payload)))


@router.post(
    "/organizations/{organization_id}/invitations",
    operation_id="create_organization_invitation",
    response_model=ProductCommandResponse,
    status_code=201,
)
async def create_invitation(
    organization_id: UUID,
    body: InvitationCreate,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProductCommandResponse:
    invitation_token = secrets.token_urlsafe(32)
    token_sha256 = hashlib.sha256(invitation_token.encode()).hexdigest()
    payload = await _services(request).database.execute_product_command(
        identity,
        operation="create_invitation",
        query="select api.create_organization_invitation(%s,%s,%s,%s,%s,%s,%s,%s) as payload",
        parameters=(
            organization_id,
            body.email,
            body.role,
            token_sha256,
            body.expires_at,
            idempotency_key,
            _hash(body, organization_id=str(organization_id)),
            _correlation_id(request),
        ),
    )
    replayed = bool(payload.get("replayed"))
    _replay_header(response, payload)
    if replayed:
        response.status_code = 200
    else:
        payload["invitation_token"] = invitation_token
    return ProductCommandResponse(data=cast(dict[str, JsonValue], _json(payload)))


@router.post(
    "/organization-invitations/accept",
    operation_id="accept_organization_invitation",
    response_model=ProductCommandResponse,
)
async def accept_invitation(
    body: InvitationAccept,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProductCommandResponse:
    payload = await _services(request).database.execute_product_command(
        identity,
        operation="accept_invitation",
        query="select api.accept_organization_invitation(%s,%s,%s,%s) as payload",
        parameters=(
            hashlib.sha256(body.token.encode()).hexdigest(),
            idempotency_key,
            _hash(body),
            _correlation_id(request),
        ),
    )
    _replay_header(response, payload)
    return ProductCommandResponse(data=cast(dict[str, JsonValue], _json(payload)))


@router.get(
    "/organizations/{organization_id}/invitations",
    operation_id="list_organization_invitations",
    response_model=ProductCollectionResponse,
)
async def list_invitations(
    organization_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProductCollectionResponse:
    rows = await _services(request).database.read_product_rows(
        identity,
        operation="list_invitations",
        query="""
          select id, email, role, status, expires_at, accepted_by,
            accepted_at, revoked_at, created_at
          from api.organization_invitations where organization_id = %s
          order by created_at desc, id desc limit 100
        """,
        parameters=(organization_id,),
    )
    return ProductCollectionResponse(items=cast(list[dict[str, JsonValue]], _json(rows)))


@router.get(
    "/organizations/{organization_id}/audit",
    operation_id="get_organization_audit",
    response_model=ProductCollectionResponse,
)
async def organization_audit(
    organization_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> ProductCollectionResponse:
    payload = await _services(request).database.read_product_json(
        identity,
        operation="organization_audit",
        query="select api.get_organization_audit_feed(%s,%s) as payload",
        parameters=(organization_id, limit),
    )
    return ProductCollectionResponse(items=cast(list[dict[str, JsonValue]], _json(payload)))


@router.get(
    "/organizations/{organization_id}/admin-summary",
    operation_id="get_organization_admin_summary",
    response_model=ProductCommandResponse,
)
async def organization_admin_summary(
    organization_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProductCommandResponse:
    payload = await _services(request).database.read_product_json(
        identity,
        operation="organization_admin_summary",
        query="select api.get_organization_admin_summary(%s) as payload",
        parameters=(organization_id,),
    )
    return ProductCommandResponse(data=cast(dict[str, JsonValue], _json(payload)))


@router.put(
    "/organizations/{organization_id}/feature-flags/{flag_key}",
    operation_id="set_organization_feature_flag",
    response_model=ProductCommandResponse,
)
async def set_feature_flag(
    organization_id: UUID,
    flag_key: str,
    body: FeatureFlagSet,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProductCommandResponse:
    payload = await _services(request).database.execute_product_command(
        identity,
        operation="set_feature_flag",
        query="select api.set_feature_flag(%s,%s,%s,%s,%s,%s,%s) as payload",
        parameters=(
            organization_id,
            flag_key,
            body.enabled,
            body.reason,
            idempotency_key,
            _hash(body, organization_id=str(organization_id), flag_key=flag_key),
            _correlation_id(request),
        ),
    )
    _replay_header(response, payload)
    return ProductCommandResponse(data=cast(dict[str, JsonValue], _json(payload)))


@router.get(
    "/organizations/{organization_id}/feature-flags",
    operation_id="list_organization_feature_flags",
    response_model=ProductCollectionResponse,
)
async def list_feature_flags(
    organization_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProductCollectionResponse:
    rows = await _services(request).database.read_product_rows(
        identity,
        operation="list_feature_flags",
        query="""
          select id, flag_key, enabled, reason, version, updated_at
          from api.feature_flags where organization_id = %s
          order by flag_key limit 100
        """,
        parameters=(organization_id,),
    )
    return ProductCollectionResponse(items=cast(list[dict[str, JsonValue]], _json(rows)))
