"""Phase 2 organization, project, and immutable stimulus HTTP surface."""

from __future__ import annotations

import asyncio
import re
from collections.abc import Callable
from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from simula_core.queue_runtime import RunDispatchIntent

from simula_api.auth import VerifiedIdentity
from simula_api.cursor import CursorPosition
from simula_api.database import canonical_request_sha256
from simula_api.models import (
    MeResponse,
    OrganizationCreate,
    OrganizationPage,
    OrganizationResponse,
    ProblemDocument,
    ProjectCreate,
    ProjectDetail,
    ProjectPage,
    ProjectPatch,
    ProjectResponse,
    SimulationProvenanceResponse,
    SimulationResultResponse,
    SimulationRunCancel,
    SimulationRunCreate,
    SimulationRunResponse,
    StimulusCreate,
    StimulusResponse,
    StimulusVersionAppend,
    StimulusVersionResponse,
)
from simula_api.problems import AppProblem, ProblemError, unauthenticated
from simula_api.services import AppServices

logger = structlog.get_logger()


def _problem_response(description: str) -> dict[str, object]:
    return {
        "description": description,
        "content": {"application/problem+json": {"schema": ProblemDocument.model_json_schema()}},
    }


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
bearer = HTTPBearer(auto_error=False)
IDEMPOTENCY_PATTERN = r"^[ -~]{16,128}$"
ETAG_PATTERN = re.compile(r'^"([1-9][0-9]*)"$')

IdempotencyKey = Annotated[
    str,
    Header(alias="Idempotency-Key", min_length=16, max_length=128, pattern=IDEMPOTENCY_PATTERN),
]
PageSize = Annotated[int, Query(ge=1, le=100)]


def _services(request: Request) -> AppServices:
    services = getattr(request.app.state, "domain_services", None)
    if not isinstance(services, AppServices):
        raise AppProblem(
            status=503,
            code="dependency_unavailable",
            title="Service initializing",
            detail="The API is not ready to process domain requests. Retry shortly.",
            retry_after=5,
        )
    return services


async def current_identity(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> VerifiedIdentity:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthenticated()
    return await _services(request).verifier.verify(credentials.credentials)


async def rate_limited_identity(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> VerifiedIdentity:
    services = _services(request)
    identity = await current_identity(request, credentials)
    pre_auth_ip_hash = request.scope.get("state", {}).pop("pre_auth_rate_limit_ip_hash", None)
    if isinstance(pre_auth_ip_hash, str):
        await services.rate_limiter.release_unauthenticated(ip_hash=pre_auth_ip_hash)
    idempotency_key = _rate_idempotency_key(request)
    await services.rate_limiter.require_general(
        user_id=identity.user_id,
        idempotency_key=idempotency_key,
        idempotency_scope=_idempotency_scope(request) if idempotency_key is not None else None,
    )
    return identity


def _rate_idempotency_key(request: Request) -> str | None:
    value = request.headers.get("idempotency-key")
    if value is None or re.fullmatch(IDEMPOTENCY_PATTERN, value) is None:
        return None
    return value


def _idempotency_scope(request: Request) -> str:
    route_path = getattr(request.scope.get("route"), "path", None)
    path = route_path if isinstance(route_path, str) else request.url.path
    return f"{request.method}:{path}"


def _correlation_id(request: Request) -> UUID:
    value = getattr(request.state, "correlation_id", None)
    if not isinstance(value, str):
        raise RuntimeError("correlation middleware did not set a UUID")
    return UUID(value)


def _page[T](
    *,
    items: list[T],
    page_size: int,
    cursor_for: Callable[[T], CursorPosition],
    encode: Callable[[CursorPosition], str],
) -> tuple[list[T], str | None]:
    if len(items) <= page_size:
        return items, None
    visible = items[:page_size]
    return visible, encode(cursor_for(visible[-1]))


def _record_replay(*, route: str, replayed: bool, request: Request) -> None:
    logger.info(
        "idempotency_replay" if replayed else "idempotency_created",
        correlation_id=str(_correlation_id(request)),
        route_template=route,
    )


async def _record_privileged_denial(
    *,
    request: Request,
    identity: VerifiedIdentity,
    organization_id: UUID,
    action: str,
    object_type: str,
    object_id: UUID | None,
) -> None:
    try:
        await _services(request).database.record_privileged_denial(
            identity,
            organization_id=organization_id,
            action=action,
            object_type=object_type,
            object_id=object_id,
            correlation_id=_correlation_id(request),
        )
    except AppProblem as error:
        logger.error(
            "audit_evidence_incomplete",
            action=action,
            correlation_id=str(_correlation_id(request)),
            error_code=error.code,
        )


def _require_if_match(value: str | None) -> int:
    match = ETAG_PATTERN.fullmatch(value or "")
    if match is None:
        raise AppProblem(
            status=422,
            code="validation_error",
            title="If-Match required",
            detail="Provide the current quoted project version in If-Match.",
            errors=(ProblemError(field="if-match", code="required"),),
        )
    return int(match.group(1))


async def _best_effort_publish_run(*, request: Request, run: SimulationRunResponse) -> None:
    publisher = _services(request).run_publisher
    if publisher is None:
        logger.error("run_publisher_unavailable", correlation_id=str(_correlation_id(request)))
        return
    try:
        await publisher.publish(
            RunDispatchIntent(
                run_id=run.id,
                generation=run.dispatch_generation,
                job_id=run.job_id,
            )
        )
    except asyncio.CancelledError:
        raise
    except Exception:
        # The committed outbox remains authoritative; only simula_worker confirms it.
        logger.warning(
            "run_publish_ambiguous",
            correlation_id=str(_correlation_id(request)),
            run_id=str(run.id),
        )


@router.get("/me", operation_id="get_current_identity", response_model=MeResponse)
async def me(identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)]) -> MeResponse:
    return MeResponse(user_id=identity.user_id)


@router.post(
    "/organizations",
    operation_id="create_organization",
    response_model=OrganizationResponse,
    status_code=201,
)
async def create_organization(
    request: Request,
    response: Response,
    body: OrganizationCreate,
    idempotency_key: IdempotencyKey,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> OrganizationResponse:
    services = _services(request)
    await services.rate_limiter.require_organization_create(
        user_id=identity.user_id,
        idempotency_key=idempotency_key,
        idempotency_scope=_idempotency_scope(request),
    )
    organization, replayed = await services.database.create_organization(
        identity,
        name=body.name,
        idempotency_key=idempotency_key,
        request_sha256=canonical_request_sha256(body.model_dump(mode="json")),
        correlation_id=_correlation_id(request),
    )
    response.headers["Idempotent-Replayed"] = str(replayed).lower()
    _record_replay(route="/api/v1/organizations", replayed=replayed, request=request)
    return organization


@router.get(
    "/organizations",
    operation_id="list_organizations",
    response_model=OrganizationPage,
)
async def list_organizations(
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    cursor: str | None = None,
    page_size: PageSize = 25,
) -> OrganizationPage:
    services = _services(request)
    scope = f"organizations:{identity.user_id}"
    after = services.cursors.decode(cursor, scope=scope)
    items = await services.database.list_organizations(identity, after=after, limit=page_size + 1)
    visible, next_cursor = _page(
        items=items,
        page_size=page_size,
        cursor_for=lambda item: CursorPosition(created_at=item.created_at, resource_id=item.id),
        encode=lambda position: services.cursors.encode(scope=scope, position=position),
    )
    return OrganizationPage(items=visible, next_cursor=next_cursor)


@router.post(
    "/organizations/{organization_id}/projects",
    operation_id="create_project",
    response_model=ProjectResponse,
    status_code=201,
)
async def create_project(
    organization_id: UUID,
    request: Request,
    response: Response,
    body: ProjectCreate,
    idempotency_key: IdempotencyKey,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProjectResponse:
    services = _services(request)
    organization_id = await services.database.visible_organization(
        identity, organization_id=organization_id
    )
    await services.rate_limiter.require_organization_mutation(
        user_id=identity.user_id,
        organization_id=organization_id,
        idempotency_key=idempotency_key,
        idempotency_scope=_idempotency_scope(request),
    )
    try:
        project, replayed = await services.database.create_project(
            identity,
            organization_id=organization_id,
            payload=body.model_dump(mode="json"),
            idempotency_key=idempotency_key,
            request_sha256=canonical_request_sha256(body.model_dump(mode="json")),
            correlation_id=_correlation_id(request),
        )
    except AppProblem as error:
        if error.code == "forbidden":
            await _record_privileged_denial(
                request=request,
                identity=identity,
                organization_id=organization_id,
                action="project.create_denied",
                object_type="project",
                object_id=None,
            )
        raise
    response.headers["Idempotent-Replayed"] = str(replayed).lower()
    response.headers["ETag"] = f'"{project.version}"'
    _record_replay(
        route="/api/v1/organizations/{organization_id}/projects",
        replayed=replayed,
        request=request,
    )
    return project


@router.get(
    "/organizations/{organization_id}/projects",
    operation_id="list_projects",
    response_model=ProjectPage,
)
async def list_projects(
    organization_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    cursor: str | None = None,
    page_size: PageSize = 25,
) -> ProjectPage:
    services = _services(request)
    scope = f"projects:{organization_id}"
    after = services.cursors.decode(cursor, scope=scope)
    items = await services.database.list_projects(
        identity,
        organization_id=organization_id,
        after=after,
        limit=page_size + 1,
    )
    visible, next_cursor = _page(
        items=items,
        page_size=page_size,
        cursor_for=lambda item: CursorPosition(created_at=item.created_at, resource_id=item.id),
        encode=lambda position: services.cursors.encode(scope=scope, position=position),
    )
    return ProjectPage(items=visible, next_cursor=next_cursor)


@router.get("/projects/{project_id}", operation_id="get_project", response_model=ProjectDetail)
async def get_project(
    project_id: UUID,
    request: Request,
    response: Response,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> ProjectDetail:
    project = await _services(request).database.get_project(identity, project_id=project_id)
    response.headers["ETag"] = f'"{project.version}"'
    return project


@router.patch(
    "/projects/{project_id}", operation_id="update_project", response_model=ProjectResponse
)
async def update_project(
    project_id: UUID,
    request: Request,
    response: Response,
    body: ProjectPatch,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
) -> ProjectResponse:
    services = _services(request)
    organization_id = await services.database.organization_for_project(
        identity, project_id=project_id
    )
    await services.rate_limiter.require_organization_mutation(
        user_id=identity.user_id, organization_id=organization_id
    )
    try:
        project = await services.database.update_project(
            identity,
            project_id=project_id,
            expected_version=_require_if_match(if_match),
            patch=body,
            correlation_id=_correlation_id(request),
        )
    except AppProblem as error:
        if error.code == "forbidden":
            await _record_privileged_denial(
                request=request,
                identity=identity,
                organization_id=organization_id,
                action="project.update_denied",
                object_type="project",
                object_id=project_id,
            )
        raise
    response.headers["ETag"] = f'"{project.version}"'
    return project


@router.post(
    "/projects/{project_id}/stimuli",
    operation_id="create_stimulus",
    response_model=StimulusResponse,
    status_code=201,
)
async def create_stimulus(
    project_id: UUID,
    request: Request,
    response: Response,
    body: StimulusCreate,
    idempotency_key: IdempotencyKey,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> StimulusResponse:
    services = _services(request)
    organization_id = await services.database.organization_for_project(
        identity, project_id=project_id
    )
    await services.rate_limiter.require_organization_mutation(
        user_id=identity.user_id,
        organization_id=organization_id,
        idempotency_key=idempotency_key,
        idempotency_scope=_idempotency_scope(request),
    )
    try:
        stimulus, replayed = await services.database.create_stimulus(
            identity,
            project_id=project_id,
            name=body.name,
            content=body.content,
            idempotency_key=idempotency_key,
            request_sha256=canonical_request_sha256(body.model_dump(mode="json")),
            correlation_id=_correlation_id(request),
        )
    except AppProblem as error:
        if error.code == "forbidden":
            await _record_privileged_denial(
                request=request,
                identity=identity,
                organization_id=organization_id,
                action="stimulus.create_denied",
                object_type="stimulus",
                object_id=None,
            )
        raise
    response.headers["Idempotent-Replayed"] = str(replayed).lower()
    _record_replay(
        route="/api/v1/projects/{project_id}/stimuli", replayed=replayed, request=request
    )
    return stimulus


@router.post(
    "/stimuli/{stimulus_id}/versions",
    operation_id="append_stimulus_version",
    response_model=StimulusVersionResponse,
    status_code=201,
)
async def append_stimulus_version(
    stimulus_id: UUID,
    request: Request,
    response: Response,
    body: StimulusVersionAppend,
    idempotency_key: IdempotencyKey,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> StimulusVersionResponse:
    services = _services(request)
    organization_id = await services.database.organization_for_stimulus(
        identity, stimulus_id=stimulus_id
    )
    await services.rate_limiter.require_organization_mutation(
        user_id=identity.user_id,
        organization_id=organization_id,
        idempotency_key=idempotency_key,
        idempotency_scope=_idempotency_scope(request),
    )
    try:
        version, replayed = await services.database.append_stimulus_version(
            identity,
            stimulus_id=stimulus_id,
            content=body.content,
            idempotency_key=idempotency_key,
            request_sha256=canonical_request_sha256(body.model_dump(mode="json")),
            correlation_id=_correlation_id(request),
        )
    except AppProblem as error:
        if error.code == "forbidden":
            await _record_privileged_denial(
                request=request,
                identity=identity,
                organization_id=organization_id,
                action="stimulus.version_append_denied",
                object_type="stimulus_version",
                object_id=stimulus_id,
            )
        raise
    response.headers["Idempotent-Replayed"] = str(replayed).lower()
    _record_replay(
        route="/api/v1/stimuli/{stimulus_id}/versions", replayed=replayed, request=request
    )
    return version


@router.post(
    "/projects/{project_id}/runs",
    operation_id="create_simulation_run",
    response_model=SimulationRunResponse,
    status_code=202,
)
async def create_simulation_run(
    project_id: UUID,
    request: Request,
    response: Response,
    body: SimulationRunCreate,
    idempotency_key: IdempotencyKey,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> SimulationRunResponse:
    services = _services(request)
    organization_id = await services.database.organization_for_project(
        identity, project_id=project_id
    )
    await services.rate_limiter.require_run_create(
        user_id=identity.user_id,
        organization_id=organization_id,
        idempotency_key=idempotency_key,
        idempotency_scope=_idempotency_scope(request),
    )
    run, replayed = await services.database.create_simulation_run(
        identity,
        project_id=project_id,
        stimulus_version_id=body.stimulus_version_id,
        idempotency_key=idempotency_key,
        request_sha256=canonical_request_sha256(body.model_dump(mode="json")),
        correlation_id=_correlation_id(request),
    )
    response.headers["Idempotent-Replayed"] = str(replayed).lower()
    response.headers["ETag"] = f'"{run.version}"'
    _record_replay(route="/api/v1/projects/{project_id}/runs", replayed=replayed, request=request)
    await _best_effort_publish_run(request=request, run=run)
    return run


@router.get(
    "/runs/{run_id}", operation_id="get_simulation_run", response_model=SimulationRunResponse
)
async def get_simulation_run(
    run_id: UUID,
    request: Request,
    response: Response,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> SimulationRunResponse:
    services = _services(request)
    await services.rate_limiter.require_run_read(user_id=identity.user_id, run_id=run_id)
    run = await services.database.get_simulation_run(identity, run_id=run_id)
    response.headers["ETag"] = f'"{run.version}"'
    return run


@router.post(
    "/runs/{run_id}/cancel",
    operation_id="request_simulation_run_cancel",
    response_model=SimulationRunResponse,
    status_code=202,
    responses={200: {"model": SimulationRunResponse}},
)
async def request_simulation_run_cancel(
    run_id: UUID,
    request: Request,
    response: Response,
    body: SimulationRunCancel,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> SimulationRunResponse:
    del body
    services = _services(request)
    await services.rate_limiter.require_run_read(user_id=identity.user_id, run_id=run_id)
    run = await services.database.request_simulation_run_cancel(
        identity,
        run_id=run_id,
        correlation_id=_correlation_id(request),
    )
    response.status_code = 202 if run.state == "cancel_requested" else 200
    response.headers["ETag"] = f'"{run.version}"'
    return run


@router.get(
    "/runs/{run_id}/provenance",
    operation_id="get_simulation_provenance",
    response_model=SimulationProvenanceResponse,
)
async def get_simulation_provenance(
    run_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> SimulationProvenanceResponse:
    services = _services(request)
    await services.rate_limiter.require_run_read(user_id=identity.user_id, run_id=run_id)
    return await services.database.get_simulation_provenance(identity, run_id=run_id)


@router.get(
    "/runs/{run_id}/result",
    operation_id="get_simulation_result",
    response_model=SimulationResultResponse,
)
async def get_simulation_result(
    run_id: UUID,
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
) -> SimulationResultResponse:
    services = _services(request)
    await services.rate_limiter.require_run_read(user_id=identity.user_id, run_id=run_id)
    result = await services.database.get_simulation_result(identity, run_id=run_id)
    if result is None:
        raise AppProblem(
            status=404,
            code="not_found",
            title="Resource not found",
            detail="The requested resource was not found.",
        )
    return result
