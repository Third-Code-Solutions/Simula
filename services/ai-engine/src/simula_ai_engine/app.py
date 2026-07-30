"""Private, authenticated FastAPI boundary for behavioral execution."""

from __future__ import annotations

import asyncio
import base64
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime
from hashlib import sha256
from hmac import compare_digest
from threading import Event
from typing import Annotated, Literal
from uuid import UUID

import structlog
from fastapi import Depends, FastAPI, Header, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from simula_core.behavioral_engine import (
    BehavioralRunCancelledError,
    BehavioralRunCommand,
    BehavioralRunResult,
    execute_behavioral_run,
)
from simula_core.methodology import (
    AudienceDefinitionVersion,
    DeterministicCohortProvider,
    MethodologyEngine,
    MethodologyRunResult,
    PopulationFrameVersion,
    SamplingConfiguration,
)
from simula_core.observability import get_observability_runtime
from simula_core.reporting import (
    CompleteReport,
    ReportFormat,
    VariantComparison,
    build_complete_report,
    compare_variants,
    export_report,
)
from simula_core.visual_analysis import (
    MAX_VISUAL_ASSET_BYTES,
    TechnicalImageSignalProvider,
    VisualAnalysisCommand,
    VisualAssetIdentity,
    VisualStimulusProfile,
    execute_visual_analysis,
)
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from simula_ai_engine.config import EngineConfigurationError, EngineSettings
from simula_ai_engine.registry import (
    BehavioralProviderRegistry,
    ProviderNotAdmittedError,
    VisualProviderNotAdmittedError,
    VisualProviderRegistry,
)

logger = structlog.get_logger()
MAX_COMMAND_BYTES = 2_000_000
MAX_COMPARISON_COMMAND_BYTES = 9_000_000
EXECUTION_PATH = "/internal/v1/behavioral-runs:execute"
METHODOLOGY_PREVIEW_PATH = "/internal/v1/methodology-previews:execute"
VARIANT_COMPARISON_PATH = "/internal/v1/methodology-reports:compare"
REPORT_EXPORT_PATH = "/internal/v1/report-exports:render"
VISUAL_PROFILE_PATH = "/internal/v1/visual-assets:profile"
VISUAL_MEDIA_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})
COMMAND_PATHS = frozenset(
    {
        EXECUTION_PATH,
        METHODOLOGY_PREVIEW_PATH,
        VARIANT_COMPARISON_PATH,
        REPORT_EXPORT_PATH,
        VISUAL_PROFILE_PATH,
    }
)


class FrozenModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class HealthResponse(FrozenModel):
    status: Literal["ok", "ready", "not_ready"]
    service: Literal["ai-engine"] = "ai-engine"
    environment: str
    release_sha: str
    admitted_provider_count: int
    admitted_visual_provider_count: int


class ProblemResponse(FrozenModel):
    type: str = "about:blank"
    title: str
    status: int
    code: str
    detail: str


class MethodologyReportCommand(FrozenModel):
    report_id: UUID
    project_id: UUID
    stimulus_version_id: UUID
    variant_key: str
    variant_label: str
    created_at: datetime


class MethodologyPreviewCommand(FrozenModel):
    run_id: UUID
    stimulus: str
    population: PopulationFrameVersion
    audience: AudienceDefinitionVersion
    configuration: SamplingConfiguration
    methodology_version: str
    cost_ceiling_microusd: int
    report: MethodologyReportCommand


class MethodologyPreviewResult(FrozenModel):
    methodology_result: MethodologyRunResult
    report: CompleteReport
    replayed: Literal[False] = False


class VariantReportInput(FrozenModel):
    variant_key: Annotated[
        str,
        StringConstraints(pattern=r"^[a-z][a-z0-9_.]{0,63}$"),
    ]
    artifact: CompleteReport


class VariantComparisonCommand(FrozenModel):
    reports: tuple[VariantReportInput, ...] = Field(min_length=2, max_length=8)


class VariantComparisonItem(FrozenModel):
    baseline_variant_key: str
    candidate_variant_key: str
    comparison: VariantComparison


class VariantComparisonResult(FrozenModel):
    items: tuple[VariantComparisonItem, ...]


class ReportExportCommand(FrozenModel):
    report: CompleteReport
    format: ReportFormat


class ReportExportResult(FrozenModel):
    format: ReportFormat
    media_type: Literal["application/json", "text/csv; charset=utf-8"]
    filename: str
    content_base64: str
    content_sha256: str


class EngineProblem(RuntimeError):
    def __init__(self, *, status: int, code: str, title: str, detail: str) -> None:
        super().__init__(title)
        self.status = status
        self.code = code
        self.title = title
        self.detail = detail


@dataclass(frozen=True, slots=True)
class EngineServices:
    settings: EngineSettings
    registry: BehavioralProviderRegistry
    visual_registry: VisualProviderRegistry | None = None


class _BodyTooLargeError(RuntimeError):
    pass


class CommandRequestPolicyMiddleware:
    """Enforce media type and count bytes even when Content-Length is absent."""

    def __init__(
        self,
        app: ASGIApp,
        services_getter: Callable[[], EngineServices | None],
    ) -> None:
        self.app = app
        self.services_getter = services_getter

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("path") not in COMMAND_PATHS:
            await self.app(scope, receive, send)
            return
        headers = {
            key.decode("latin-1").lower(): value.decode("latin-1")
            for key, value in scope.get("headers", ())
        }
        services = self.services_getter()
        if not isinstance(services, EngineServices):
            await _problem_response(
                status=503,
                code="service_not_ready",
                title="Service not ready",
                detail="The private behavioral engine is not ready.",
            )(scope, receive, send)
            return
        if not _token_is_admitted(
            _bearer_token(headers.get("authorization")),
            services.settings.internal_tokens,
        ):
            await _problem_response(
                status=401,
                code="invalid_internal_authority",
                title="Internal authority required",
                detail="A valid private engine bearer token is required.",
                headers={"WWW-Authenticate": "Bearer"},
            )(scope, receive, send)
            return
        content_type = headers.get("content-type", "").split(";", 1)[0].strip().lower()
        is_visual_profile = scope.get("path") == VISUAL_PROFILE_PATH
        if (
            content_type not in VISUAL_MEDIA_TYPES
            if is_visual_profile
            else content_type != "application/json"
        ):
            await _problem_response(
                status=415,
                code="unsupported_media_type",
                title="Unsupported media type",
                detail=(
                    "Private visual profiling accepts one exact supported image media type."
                    if is_visual_profile
                    else "Private execution accepts application/json only."
                ),
            )(scope, receive, send)
            return
        raw_content_length = headers.get("content-length")
        command_byte_limit = (
            MAX_VISUAL_ASSET_BYTES
            if is_visual_profile
            else (
                MAX_COMPARISON_COMMAND_BYTES
                if scope.get("path") == VARIANT_COMPARISON_PATH
                else MAX_COMMAND_BYTES
            )
        )
        if is_visual_profile and raw_content_length is None:
            await _problem_response(
                status=411,
                code="content_length_required",
                title="Content length required",
                detail="Private visual profiling requires an exact content length.",
            )(scope, receive, send)
            return
        if raw_content_length is not None:
            try:
                content_length = int(raw_content_length)
            except ValueError:
                content_length = command_byte_limit + 1
            if (
                content_length < (1 if is_visual_profile else 0)
                or content_length > command_byte_limit
            ):
                await _problem_response(
                    status=413,
                    code="request_too_large",
                    title="Request too large",
                    detail="The private command exceeds the service limit.",
                )(scope, receive, send)
                return
        received_bytes = 0

        async def receive_limited() -> Message:
            nonlocal received_bytes
            message = await receive()
            if message["type"] == "http.request":
                received_bytes += len(message.get("body", b""))
                if received_bytes > command_byte_limit:
                    raise _BodyTooLargeError
            return message

        try:
            await self.app(scope, receive_limited, send)
        except _BodyTooLargeError:
            await _problem_response(
                status=413,
                code="request_too_large",
                title="Request too large",
                detail="The private command exceeds the service limit.",
            )(scope, receive, send)


def _problem_response(
    *,
    status: int,
    code: str,
    title: str,
    detail: str,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    return JSONResponse(
        ProblemResponse(
            title=title,
            status=status,
            code=code,
            detail=detail,
        ).model_dump(mode="json"),
        status_code=status,
        media_type="application/problem+json",
        headers=headers,
    )


def _services(request: Request) -> EngineServices:
    services = request.app.state.engine_services
    if not isinstance(services, EngineServices):
        raise EngineProblem(
            status=503,
            code="service_not_ready",
            title="Service not ready",
            detail="The private behavioral engine is not ready.",
        )
    return services


def _bearer_token(authorization: str | None) -> str | None:
    if authorization is None:
        return None
    scheme, separator, token = authorization.partition(" ")
    if separator != " " or scheme != "Bearer" or not token or token.strip() != token:
        return None
    return token


def _token_is_admitted(candidate: str | None, expected_tokens: tuple[str, ...]) -> bool:
    admitted = False
    for expected in expected_tokens:
        admitted = bool(admitted | compare_digest(candidate or "", expected))
    return admitted


async def require_internal_authority(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    candidate = _bearer_token(authorization)
    services = _services(request)
    if not _token_is_admitted(candidate, services.settings.internal_tokens):
        raise EngineProblem(
            status=401,
            code="invalid_internal_authority",
            title="Internal authority required",
            detail="A valid private engine bearer token is required.",
        )


async def _monitor_disconnect(
    request: Request,
    *,
    cancellation: Event,
    stopped: asyncio.Event,
) -> None:
    while not stopped.is_set():
        if await request.is_disconnected():
            cancellation.set()
            return
        try:
            await asyncio.wait_for(stopped.wait(), timeout=0.05)
        except TimeoutError:
            continue


def _health(app: FastAPI, status: Literal["ok", "ready", "not_ready"]) -> HealthResponse:
    services = app.state.engine_services
    if isinstance(services, EngineServices):
        return HealthResponse(
            status=status,
            environment=services.settings.environment,
            release_sha=services.settings.release_sha,
            admitted_provider_count=len(services.registry.descriptors),
            admitted_visual_provider_count=(
                0 if services.visual_registry is None else len(services.visual_registry.descriptors)
            ),
        )
    return HealthResponse(
        status=status,
        environment="invalid",
        release_sha="invalid",
        admitted_provider_count=0,
        admitted_visual_provider_count=0,
    )


def create_app(*, services: EngineServices | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.engine_services = services
        if services is None:
            try:
                settings = EngineSettings.from_environment()
                app.state.engine_services = EngineServices(
                    settings=settings,
                    registry=BehavioralProviderRegistry.experimental_deterministic_only(),
                    visual_registry=(
                        VisualProviderRegistry.experimental_technical_only()
                        if settings.technical_visual_profile_enabled
                        else None
                    ),
                )
            except EngineConfigurationError as error:
                logger.warning(
                    "behavioral_engine_configuration_rejected",
                    error_class=type(error).__name__,
                )
        logger.info("service_started", service="ai-engine")
        try:
            yield
        finally:
            app.state.engine_services = None
            logger.info("service_stopped", service="ai-engine")

    app = FastAPI(
        title="SIMULA Private Behavioral Engine",
        description="Private experimental synthetic-agent execution boundary.",
        version="0.0.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    app.state.engine_services = services
    app.add_middleware(
        CommandRequestPolicyMiddleware,
        services_getter=lambda: app.state.engine_services,
    )

    @app.exception_handler(EngineProblem)
    async def engine_problem_handler(_request: Request, error: EngineProblem) -> JSONResponse:
        headers = {"WWW-Authenticate": "Bearer"} if error.status == 401 else None
        return _problem_response(
            status=error.status,
            code=error.code,
            title=error.title,
            detail=error.detail,
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_problem_handler(
        request: Request, _error: RequestValidationError
    ) -> JSONResponse:
        is_visual_profile = request.url.path == VISUAL_PROFILE_PATH
        return _problem_response(
            status=422,
            code=(
                "invalid_visual_profile_command"
                if is_visual_profile
                else "invalid_behavioral_command"
            ),
            title=(
                "Visual profile command rejected"
                if is_visual_profile
                else "Behavioral command rejected"
            ),
            detail=(
                "The request does not match the strict visual profile command schema."
                if is_visual_profile
                else "The request does not match the strict behavioral command schema."
            ),
        )

    @app.get("/health/live", response_model=HealthResponse)
    async def liveness() -> HealthResponse:
        return _health(app, "ok")

    @app.get(
        "/health/ready",
        response_model=HealthResponse,
        responses={503: {"model": HealthResponse}},
    )
    async def readiness(response: Response) -> HealthResponse:
        if not isinstance(app.state.engine_services, EngineServices):
            response.status_code = 503
            return _health(app, "not_ready")
        return _health(app, "ready")

    @app.post(
        EXECUTION_PATH,
        response_model=BehavioralRunResult,
        dependencies=[Depends(require_internal_authority)],
    )
    async def execute(command: BehavioralRunCommand, request: Request) -> BehavioralRunResult:
        cancellation = Event()
        monitor_stopped = asyncio.Event()
        monitor = asyncio.create_task(
            _monitor_disconnect(
                request,
                cancellation=cancellation,
                stopped=monitor_stopped,
            ),
            name="behavioral-engine-client-disconnect",
        )
        try:
            admitted = _services(request).registry.resolve(command.provider)
            with get_observability_runtime("ai-engine").span("behavioral.execute"):
                return await asyncio.to_thread(
                    execute_behavioral_run,
                    command,
                    provider=admitted.provider,
                    synthesizer=admitted.synthesizer,
                    should_cancel=cancellation.is_set,
                )
        except ProviderNotAdmittedError as error:
            raise EngineProblem(
                status=422,
                code="provider_not_admitted",
                title="Provider not admitted",
                detail=str(error),
            ) from error
        except BehavioralRunCancelledError as error:
            raise EngineProblem(
                status=409,
                code="behavioral_run_cancelled",
                title="Behavioral run cancelled",
                detail="The private execution was cancelled before completion.",
            ) from error
        except TimeoutError as error:
            raise EngineProblem(
                status=504,
                code="behavioral_run_deadline_exceeded",
                title="Behavioral run deadline exceeded",
                detail="The frozen behavioral execution exceeded its deadline.",
            ) from error
        except ValueError as error:
            raise EngineProblem(
                status=422,
                code="behavioral_run_rejected",
                title="Behavioral run rejected",
                detail=str(error),
            ) from error
        finally:
            monitor_stopped.set()
            monitor.cancel()
            await asyncio.gather(monitor, return_exceptions=True)

    @app.post(
        VISUAL_PROFILE_PATH,
        response_model=VisualStimulusProfile,
        dependencies=[Depends(require_internal_authority)],
    )
    async def profile_visual_asset(
        request: Request,
        x_simula_analysis_id: Annotated[UUID, Header()],
        x_simula_asset_id: Annotated[UUID, Header()],
        x_simula_organization_id: Annotated[UUID, Header()],
        x_simula_stimulus_id: Annotated[UUID, Header()],
        x_simula_content_sha256: Annotated[
            str,
            Header(pattern=r"^[0-9a-f]{64}$"),
        ],
    ) -> VisualStimulusProfile:
        services = _services(request)
        if services.visual_registry is None:
            raise EngineProblem(
                status=503,
                code="visual_profile_disabled",
                title="Visual profiling disabled",
                detail="The private visual profiling capability is not admitted.",
            )
        media_type = request.headers.get("content-type", "").strip().lower()
        content = await request.body()
        declared_length = request.headers.get("content-length")
        if (
            declared_length is None
            or not declared_length.isascii()
            or not declared_length.isdecimal()
            or int(declared_length) != len(content)
            or sha256(content).hexdigest() != x_simula_content_sha256
        ):
            raise EngineProblem(
                status=422,
                code="visual_asset_binding_mismatch",
                title="Visual asset binding mismatch",
                detail="The visual bytes do not match the declared immutable asset.",
            )
        try:
            command = VisualAnalysisCommand(
                analysis_id=x_simula_analysis_id,
                asset=VisualAssetIdentity.model_validate(
                    {
                        "asset_id": x_simula_asset_id,
                        "organization_id": x_simula_organization_id,
                        "stimulus_id": x_simula_stimulus_id,
                        "media_type": media_type,
                        "byte_size": len(content),
                        "content_sha256": x_simula_content_sha256,
                    }
                ),
                provider=TechnicalImageSignalProvider.descriptor,
            )
            admitted = services.visual_registry.resolve(command.provider)
            with get_observability_runtime("ai-engine").span("visual.profile"):
                return await asyncio.to_thread(
                    execute_visual_analysis,
                    command,
                    content,
                    provider=admitted,
                )
        except VisualProviderNotAdmittedError as error:
            raise EngineProblem(
                status=422,
                code="visual_provider_not_admitted",
                title="Visual provider not admitted",
                detail=str(error),
            ) from error
        except ValueError as error:
            raise EngineProblem(
                status=422,
                code="visual_profile_rejected",
                title="Visual profile rejected",
                detail=str(error),
            ) from error

    @app.post(
        METHODOLOGY_PREVIEW_PATH,
        response_model=MethodologyPreviewResult,
        dependencies=[Depends(require_internal_authority)],
    )
    async def execute_methodology_preview(
        command: MethodologyPreviewCommand,
    ) -> MethodologyPreviewResult:
        try:
            with get_observability_runtime("ai-engine").span("methodology.preview"):
                result = await asyncio.to_thread(
                    MethodologyEngine(DeterministicCohortProvider()).run,
                    run_id=command.run_id,
                    stimulus=command.stimulus,
                    population=command.population,
                    audience=command.audience,
                    configuration=command.configuration,
                    methodology_version=command.methodology_version,
                    cost_ceiling_microusd=command.cost_ceiling_microusd,
                )
                report = build_complete_report(
                    result,
                    report_id=command.report.report_id,
                    project_id=command.report.project_id,
                    stimulus_version_id=command.report.stimulus_version_id,
                    variant_key=command.report.variant_key,
                    variant_label=command.report.variant_label,
                    created_at=command.report.created_at,
                )
                return MethodologyPreviewResult(
                    methodology_result=result,
                    report=report,
                )
        except ValueError as error:
            raise EngineProblem(
                status=422,
                code="methodology_preview_rejected",
                title="Methodology preview rejected",
                detail=str(error),
            ) from error

    @app.post(
        VARIANT_COMPARISON_PATH,
        response_model=VariantComparisonResult,
        dependencies=[Depends(require_internal_authority)],
    )
    async def compare_methodology_reports(
        command: VariantComparisonCommand,
    ) -> VariantComparisonResult:
        baseline = command.reports[0]
        try:
            with get_observability_runtime("ai-engine").span("methodology.compare"):
                items = tuple(
                    VariantComparisonItem(
                        baseline_variant_key=baseline.variant_key,
                        candidate_variant_key=candidate.variant_key,
                        comparison=compare_variants(
                            baseline.artifact,
                            candidate.artifact,
                        ),
                    )
                    for candidate in command.reports[1:]
                )
            return VariantComparisonResult(items=items)
        except ValueError as error:
            raise EngineProblem(
                status=409,
                code="variant_configurations_differ",
                title="Variant configurations differ",
                detail=("All compared reports must use the same frozen methodology configuration."),
            ) from error

    @app.post(
        REPORT_EXPORT_PATH,
        response_model=ReportExportResult,
        dependencies=[Depends(require_internal_authority)],
    )
    async def render_report_export(
        command: ReportExportCommand,
    ) -> ReportExportResult:
        with get_observability_runtime("ai-engine").span("report.export"):
            exported = export_report(command.report, command.format)
        return ReportExportResult(
            format=exported.format,
            media_type=exported.media_type,
            filename=exported.filename,
            content_base64=base64.b64encode(exported.content).decode("ascii"),
            content_sha256=exported.content_sha256,
        )

    get_observability_runtime("ai-engine").instrument_fastapi(app)
    return app


app = create_app()
