"""RFC 9457-compatible, content-safe API failures."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import structlog
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import JSONResponse

logger = structlog.get_logger()


@dataclass(frozen=True)
class ProblemError:
    field: str
    code: str


class AppProblem(Exception):
    def __init__(
        self,
        *,
        status: int,
        code: str,
        title: str,
        detail: str,
        errors: Sequence[ProblemError] = (),
        retry_after: int | None = None,
    ) -> None:
        super().__init__(code)
        self.status = status
        self.code = code
        self.title = title
        self.detail = detail
        self.errors = tuple(errors)
        self.retry_after = retry_after


def _correlation_id(request: Request) -> str:
    value = getattr(request.state, "correlation_id", None)
    return value if isinstance(value, str) else "unavailable"


def _payload(request: Request, problem: AppProblem) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "type": f"https://simula.invalid/problems/{problem.code.replace('_', '-')}",
        "title": problem.title,
        "status": problem.status,
        "code": problem.code,
        "detail": problem.detail,
        "instance": request.url.path,
        "correlation_id": _correlation_id(request),
    }
    if problem.errors:
        payload["errors"] = [{"field": error.field, "code": error.code} for error in problem.errors]
    return payload


def problem_response(request: Request, problem: AppProblem) -> JSONResponse:
    headers: dict[str, str] = {}
    if problem.status == 401:
        headers["WWW-Authenticate"] = "Bearer"
    if problem.retry_after is not None:
        headers["Retry-After"] = str(problem.retry_after)
    route = request.scope.get("route")
    route_template = getattr(route, "path", "unmatched")
    logger.info(
        "api_request_denied",
        code=problem.code,
        correlation_id=_correlation_id(request),
        route_template=route_template,
        status=problem.status,
    )
    return JSONResponse(
        _payload(request, problem),
        status_code=problem.status,
        media_type="application/problem+json",
        headers=headers,
    )


async def app_problem_handler(request: Request, error: Exception) -> JSONResponse:
    if not isinstance(error, AppProblem):
        raise TypeError("application problem handler received an unexpected exception")
    return problem_response(request, error)


async def validation_problem_handler(request: Request, error: Exception) -> JSONResponse:
    if not isinstance(error, RequestValidationError):
        raise TypeError("validation handler received an unexpected exception")
    field_errors: list[ProblemError] = []
    for item in error.errors():
        location = item.get("loc", ())
        field = ".".join(str(part) for part in location if part not in {"body", "query", "header"})
        field_errors.append(
            ProblemError(field=field or "request", code=str(item.get("type", "invalid")))
        )
    return problem_response(
        request,
        AppProblem(
            status=422,
            code="validation_error",
            title="Request validation failed",
            detail="One or more fields are invalid.",
            errors=field_errors,
        ),
    )


async def http_problem_handler(request: Request, error: Exception) -> JSONResponse:
    if not isinstance(error, StarletteHTTPException):
        raise TypeError("HTTP handler received an unexpected exception")
    if error.status_code == 404:
        problem = AppProblem(
            status=404,
            code="not_found",
            title="Resource not found",
            detail="The requested resource was not found.",
        )
    elif error.status_code == 405:
        problem = AppProblem(
            status=405,
            code="method_not_allowed",
            title="Method not allowed",
            detail="The requested method is not supported for this resource.",
        )
    else:
        problem = AppProblem(
            status=error.status_code,
            code="invalid_request",
            title="Request failed",
            detail="The request could not be completed.",
        )
    return problem_response(request, problem)


def unauthenticated() -> AppProblem:
    return AppProblem(
        status=401,
        code="unauthenticated",
        title="Authentication required",
        detail="Sign in again and retry the request.",
    )
