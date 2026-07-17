"""Phase 2 organization, project, and immutable stimulus HTTP surface."""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

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


@router.get("/me", operation_id="get_current_identity", response_model=MeResponse)
async def me(identity: Annotated[VerifiedIdentity, Depends(current_identity)]) -> MeResponse:
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
    identity: Annotated[VerifiedIdentity, Depends(current_identity)],
) -> OrganizationResponse:
    organization, replayed = await _services(request).database.create_organization(
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
    identity: Annotated[VerifiedIdentity, Depends(current_identity)],
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
    identity: Annotated[VerifiedIdentity, Depends(current_identity)],
) -> ProjectResponse:
    project, replayed = await _services(request).database.create_project(
        identity,
        organization_id=organization_id,
        payload=body.model_dump(mode="json"),
        idempotency_key=idempotency_key,
        request_sha256=canonical_request_sha256(body.model_dump(mode="json")),
        correlation_id=_correlation_id(request),
    )
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
    identity: Annotated[VerifiedIdentity, Depends(current_identity)],
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
    identity: Annotated[VerifiedIdentity, Depends(current_identity)],
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
    identity: Annotated[VerifiedIdentity, Depends(current_identity)],
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
) -> ProjectResponse:
    project = await _services(request).database.update_project(
        identity,
        project_id=project_id,
        expected_version=_require_if_match(if_match),
        patch=body,
        correlation_id=_correlation_id(request),
    )
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
    identity: Annotated[VerifiedIdentity, Depends(current_identity)],
) -> StimulusResponse:
    stimulus, replayed = await _services(request).database.create_stimulus(
        identity,
        project_id=project_id,
        name=body.name,
        content=body.content,
        idempotency_key=idempotency_key,
        request_sha256=canonical_request_sha256(body.model_dump(mode="json")),
        correlation_id=_correlation_id(request),
    )
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
    identity: Annotated[VerifiedIdentity, Depends(current_identity)],
) -> StimulusVersionResponse:
    version, replayed = await _services(request).database.append_stimulus_version(
        identity,
        stimulus_id=stimulus_id,
        content=body.content,
        idempotency_key=idempotency_key,
        request_sha256=canonical_request_sha256(body.model_dump(mode="json")),
        correlation_id=_correlation_id(request),
    )
    response.headers["Idempotent-Replayed"] = str(replayed).lower()
    _record_replay(
        route="/api/v1/stimuli/{stimulus_id}/versions", replayed=replayed, request=request
    )
    return version
