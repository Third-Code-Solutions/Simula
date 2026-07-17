"""FastAPI application factory for the Phase 2 walking skeleton."""

from __future__ import annotations

import os
import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from time import perf_counter
from typing import cast
from uuid import UUID, uuid4

import httpx
import structlog
from fastapi import FastAPI, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from simula_core.runtime import RuntimeMetadata
from starlette.datastructures import Headers, MutableHeaders
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send
from structlog.contextvars import bind_contextvars, reset_contextvars

from simula_api.auth import SupabaseTokenVerifier
from simula_api.config import ApiSettings, ConfigurationError
from simula_api.cursor import CursorCodec
from simula_api.database import DatabaseGateway
from simula_api.problems import (
    AppProblem,
    app_problem_handler,
    http_problem_handler,
    validation_problem_handler,
)
from simula_api.routes import router
from simula_api.services import AppServices

CORRELATION_HEADER = "x-correlation-id"
RELEASE_SHA_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
DEPLOYED_RELEASE_SHA_PATTERN = re.compile(r"^[0-9a-f]{7,64}$")
ALLOWED_ENVIRONMENTS = frozenset({"local", "test", "preview", "staging", "production"})
ALLOWED_LOG_LEVELS = frozenset({"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"})
MAX_BODY_BYTES = 64 * 1024
MAX_HEADER_BYTES = 16 * 1024

logger = structlog.get_logger()


class RequestTooLargeError(Exception):
    """Actual request bytes exceeded the API envelope after header checks."""


def _runtime_configuration_ready() -> bool:
    environment = os.getenv("SIMULA_ENVIRONMENT")
    release_sha = os.getenv("SIMULA_RELEASE_SHA")
    log_level = os.getenv("SIMULA_LOG_LEVEL")
    if environment not in ALLOWED_ENVIRONMENTS:
        return False
    if release_sha is None or not RELEASE_SHA_PATTERN.fullmatch(release_sha):
        return False
    if environment in {"preview", "staging", "production"} and not (
        DEPLOYED_RELEASE_SHA_PATTERN.fullmatch(release_sha)
    ):
        return False
    if log_level is None or log_level.upper() not in ALLOWED_LOG_LEVELS:
        return False
    try:
        ApiSettings.from_environment()
    except ConfigurationError:
        return False
    return True


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    environment: str
    release_sha: str
    service: str
    status: str


def _correlation_id(raw_value: str | None) -> str:
    if raw_value is not None:
        try:
            parsed = UUID(raw_value)
            if parsed.version in {4, 7} and raw_value.lower() == str(parsed):
                return str(parsed)
        except ValueError:
            pass
    return str(uuid4())


def _route_template(scope: Scope) -> str:
    route = scope.get("route")
    path = getattr(route, "path", None)
    return path if isinstance(path, str) else "unmatched"


def _runtime_metadata() -> dict[str, str]:
    return cast(dict[str, str], RuntimeMetadata.from_environment(service="api").model_dump())


def _safe_problem(
    *, correlation_id: str, status: int, code: str, title: str, detail: str
) -> dict[str, object]:
    return {
        "type": f"https://simula.invalid/problems/{code.replace('_', '-')}",
        "title": title,
        "status": status,
        "code": code,
        "detail": detail,
        "instance": "",
        "correlation_id": correlation_id,
    }


class CorrelationMiddleware:
    """Bound headers/body, add correlation, and emit payload-free request logs."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_headers = Headers(scope=scope)
        correlation_id = _correlation_id(request_headers.get(CORRELATION_HEADER))
        scope.setdefault("state", {})["correlation_id"] = correlation_id
        context_tokens = bind_contextvars(correlation_id=correlation_id)
        metadata = _runtime_metadata()
        method = scope.get("method", "UNKNOWN")
        started_at = perf_counter()
        response_started = False
        status_code = 500
        body_bytes = 0

        async def send_with_correlation(message: Message) -> None:
            nonlocal response_started, status_code
            if message["type"] == "http.response.start":
                response_started = True
                status_code = message["status"]
                MutableHeaders(scope=message)[CORRELATION_HEADER] = correlation_id
            await send(message)

        async def receive_limited() -> Message:
            nonlocal body_bytes
            message = await receive()
            if message["type"] == "http.request":
                body = message.get("body", b"")
                if not isinstance(body, bytes):
                    raise RequestTooLargeError
                body_bytes += len(body)
                if body_bytes > MAX_BODY_BYTES:
                    raise RequestTooLargeError
            return message

        header_bytes = sum(len(key) + len(value) + 4 for key, value in scope.get("headers", []))
        declared_length = request_headers.get("content-length")
        declared_too_large = declared_length is not None and (
            not declared_length.isdecimal() or int(declared_length) > MAX_BODY_BYTES
        )

        try:
            if header_bytes > MAX_HEADER_BYTES or declared_too_large:
                status_code = 413 if declared_too_large else 431
                response = JSONResponse(
                    _safe_problem(
                        correlation_id=correlation_id,
                        status=status_code,
                        code="request_too_large",
                        title="Request exceeds API limits",
                        detail="Reduce the request size and retry.",
                    ),
                    media_type="application/problem+json",
                    status_code=status_code,
                )
                await response(scope, receive_limited, send_with_correlation)
                return
            await self.app(scope, receive_limited, send_with_correlation)
        except RequestTooLargeError:
            status_code = 413
            if response_started:
                raise
            response = JSONResponse(
                _safe_problem(
                    correlation_id=correlation_id,
                    status=413,
                    code="request_too_large",
                    title="Request exceeds API limits",
                    detail="Reduce the request size and retry.",
                ),
                media_type="application/problem+json",
                status_code=413,
            )
            await response(scope, receive_limited, send_with_correlation)
        except Exception as error:
            status_code = 500
            logger.error(
                "http_request_failed",
                **metadata,
                correlation_id=correlation_id,
                error_class=type(error).__name__,
                method=method,
                route_template=_route_template(scope),
                status=status_code,
            )
            if response_started:
                raise
            response = JSONResponse(
                _safe_problem(
                    correlation_id=correlation_id,
                    status=500,
                    code="internal_error",
                    title="Internal server error",
                    detail=(
                        "The request could not be completed. Use the correlation ID for support."
                    ),
                ),
                media_type="application/problem+json",
                status_code=500,
            )
            await response(scope, receive_limited, send_with_correlation)
        finally:
            logger.info(
                "http_request_completed",
                **metadata,
                correlation_id=correlation_id,
                duration_ms=round((perf_counter() - started_at) * 1000, 3),
                method=method,
                route_template=_route_template(scope),
                status=status_code,
            )
            reset_contextvars(**context_tokens)


def _health_response(status: str) -> HealthResponse:
    metadata = RuntimeMetadata.from_environment(service="api")
    release_sha = metadata.release_sha
    if not RELEASE_SHA_PATTERN.fullmatch(release_sha):
        release_sha = "invalid"
    return HealthResponse(
        **metadata.model_dump(exclude={"release_sha"}), release_sha=release_sha, status=status
    )


def create_app(*, services: AppServices | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        metadata = RuntimeMetadata.from_environment(service="api")
        owned_client: httpx.AsyncClient | None = None
        owned_database: DatabaseGateway | None = None
        app.state.domain_services = services
        app.state.domain_ready = services is not None
        logger.info("service_started", **metadata.model_dump())
        if services is None:
            try:
                settings = ApiSettings.from_environment()
                owned_client = httpx.AsyncClient(timeout=httpx.Timeout(2.0), follow_redirects=False)
                owned_database = DatabaseGateway(settings)
                await owned_database.open()
                app.state.domain_services = AppServices(
                    verifier=SupabaseTokenVerifier(settings, owned_client),
                    database=owned_database,
                    cursors=CursorCodec(settings.cursor_secret),
                )
                app.state.domain_ready = await owned_database.ready()
            except (AppProblem, ConfigurationError) as error:
                app.state.domain_services = None
                app.state.domain_ready = False
                logger.warning("domain_dependencies_unavailable", error_class=type(error).__name__)
        try:
            yield
        finally:
            if owned_database is not None:
                await owned_database.close()
            if owned_client is not None:
                await owned_client.aclose()
            logger.info("service_stopped", **metadata.model_dump())

    app = FastAPI(
        description=(
            "SIMULA public API. Phase 2 exposes authenticated organization, project, "
            "and immutable stimulus commands."
        ),
        docs_url=None,
        lifespan=lifespan,
        openapi_url=None,
        redoc_url=None,
        title="SIMULA API",
        version="0.0.0",
    )
    app.state.domain_services = services
    app.state.domain_ready = services is not None
    try:
        settings = ApiSettings.from_environment()
    except ConfigurationError:
        settings = None
    if settings is not None:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.cors_origins),
            allow_credentials=False,
            allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
            allow_headers=[
                "Authorization",
                "Content-Type",
                "Idempotency-Key",
                "If-Match",
                "X-Correlation-ID",
            ],
            expose_headers=["ETag", "Idempotent-Replayed", "X-Correlation-ID"],
            max_age=600,
        )
    app.add_middleware(CorrelationMiddleware)
    app.add_exception_handler(AppProblem, app_problem_handler)
    app.add_exception_handler(RequestValidationError, validation_problem_handler)
    app.add_exception_handler(StarletteHTTPException, http_problem_handler)
    app.include_router(router)

    @app.get("/health/live", operation_id="get_liveness", response_model=HealthResponse)
    async def liveness() -> HealthResponse:
        return _health_response("ok")

    @app.get(
        "/health/ready",
        operation_id="get_readiness",
        response_model=HealthResponse,
        responses={503: {"description": "Runtime configuration or dependency is unsafe."}},
    )
    async def readiness(response: Response) -> HealthResponse:
        if not _runtime_configuration_ready() or not app.state.domain_ready:
            response.status_code = 503
            return _health_response("not_ready")
        return _health_response("ready")

    return app


app = create_app()
