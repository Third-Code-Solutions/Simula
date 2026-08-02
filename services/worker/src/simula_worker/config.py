"""Strict worker runtime configuration.

The worker is intentionally unable to start with the API, owner, or postgres
database roles.  Its database authority is limited to the ``simula_worker``
execution functions granted in the schema.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Literal, cast
from urllib.parse import parse_qs, urlparse

from simula_core.runtime_admission import (
    REQUIRED_DATABASE_MIGRATION_HEAD,
    ProductionAdmission,
    RuntimeAdmissionError,
    parse_deployment_admission,
)


class ConfigurationError(ValueError):
    """Raised when worker runtime configuration is missing or unsafe."""


_LOCAL_ENVIRONMENTS = frozenset({"local", "test"})
_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1", "localhost"})
_VALID_ENVIRONMENTS = frozenset({"local", "test", "preview", "staging", "production"})
_PLACEHOLDER_FRAGMENTS = ("replace", "example", "changeme")


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ConfigurationError(f"{name} is required")
    return value


def _parse_postgres_url(url: str, *, environment: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise ConfigurationError("SIMULA_WORKER_DATABASE_URL must use postgres or postgresql")
    if parsed.username != "simula_worker" and not re.fullmatch(
        r"simula_worker\.[a-z0-9]{20}", parsed.username or ""
    ):
        raise ConfigurationError("SIMULA_WORKER_DATABASE_URL must authenticate as simula_worker")
    if not parsed.password or not parsed.hostname:
        raise ConfigurationError("SIMULA_WORKER_DATABASE_URL must include credentials and a host")
    if parsed.fragment:
        raise ConfigurationError("SIMULA_WORKER_DATABASE_URL must not include a fragment")

    sslmode = parse_qs(parsed.query).get("sslmode", [""])[-1].lower()
    if environment in _LOCAL_ENVIRONMENTS:
        if parsed.hostname not in _LOOPBACK_HOSTS:
            raise ConfigurationError("local/test worker database must use a loopback host")
        return
    if parsed.scheme != "postgresql" or sslmode != "verify-full":
        raise ConfigurationError(
            "non-local worker database must use postgresql with sslmode=verify-full"
        )


def _parse_redis_url(url: str, *, environment: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"redis", "rediss"}:
        raise ConfigurationError("SIMULA_REDIS_URL must use redis or rediss")
    if not parsed.hostname or parsed.fragment:
        raise ConfigurationError("SIMULA_REDIS_URL must include a host and no fragment")
    if environment in _LOCAL_ENVIRONMENTS:
        if parsed.hostname not in _LOOPBACK_HOSTS:
            raise ConfigurationError("local/test Redis must use a loopback host")
        return
    if parsed.scheme == "redis" and not parsed.hostname.endswith(".railway.internal"):
        raise ConfigurationError(
            "non-local Redis must use rediss or a Railway private-network hostname"
        )


def _parse_behavioral_engine_url(url: str, *, environment: str) -> None:
    parsed = urlparse(url)
    if (
        not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        raise ConfigurationError(
            "SIMULA_BEHAVIORAL_ENGINE_URL must contain only a safe service origin"
        )
    if environment in _LOCAL_ENVIRONMENTS:
        if parsed.scheme != "http" or parsed.hostname not in _LOOPBACK_HOSTS:
            raise ConfigurationError("local/test behavioral engine must use a loopback HTTP origin")
        return
    if parsed.scheme != "http" or not parsed.hostname.endswith(".railway.internal"):
        raise ConfigurationError(
            "deployed behavioral engine must use a Railway private-network HTTP origin"
        )


def _parse_behavioral_engine_token() -> str:
    token = _required("SIMULA_BEHAVIORAL_ENGINE_TOKEN")
    if (
        not 32 <= len(token) <= 256
        or token.strip() != token
        or any(fragment in token.lower() for fragment in _PLACEHOLDER_FRAGMENTS)
    ):
        raise ConfigurationError(
            "SIMULA_BEHAVIORAL_ENGINE_TOKEN must be a non-placeholder value "
            "from 32 through 256 characters"
        )
    return token


@dataclass(frozen=True, slots=True)
class WorkerSettings:
    environment: str
    release_sha: str
    database_url: str
    redis_url: str
    metrics_port: int
    queue_transport: Literal["arq", "bullmq"] = "arq"
    behavioral_engine_transport: Literal["disabled", "private_http"] = "disabled"
    behavioral_engine_url: str | None = None
    behavioral_engine_token: str | None = None
    migration_head: str = REQUIRED_DATABASE_MIGRATION_HEAD
    production_admission: ProductionAdmission | None = None

    @classmethod
    def from_environment(cls) -> WorkerSettings:
        environment = _required("SIMULA_ENVIRONMENT").lower()
        if environment not in _VALID_ENVIRONMENTS:
            raise ConfigurationError("SIMULA_ENVIRONMENT is unsupported")
        release_sha = _required("SIMULA_RELEASE_SHA")
        if not re.fullmatch(r"[0-9a-f]{40}", release_sha):
            raise ConfigurationError("SIMULA_RELEASE_SHA must be an exact 40-character git SHA")
        try:
            deployment_admission = parse_deployment_admission(environment)
        except RuntimeAdmissionError as error:
            raise ConfigurationError(str(error)) from error
        database_url = _required("SIMULA_WORKER_DATABASE_URL")
        redis_url = _required("SIMULA_REDIS_URL")
        raw_metrics_port = os.getenv("SIMULA_WORKER_METRICS_PORT", "9464")
        queue_transport = os.getenv("SIMULA_WORKER_QUEUE_TRANSPORT", "arq").strip().lower()
        if queue_transport not in {"arq", "bullmq"}:
            raise ConfigurationError("SIMULA_WORKER_QUEUE_TRANSPORT must be arq or bullmq")
        admitted_queue_transport = cast(Literal["arq", "bullmq"], queue_transport)
        engine_transport = (
            os.getenv("SIMULA_BEHAVIORAL_ENGINE_TRANSPORT", "disabled").strip().lower()
        )
        if engine_transport not in {"disabled", "private_http"}:
            raise ConfigurationError(
                "SIMULA_BEHAVIORAL_ENGINE_TRANSPORT must be disabled or private_http"
            )
        admitted_engine_transport = cast(Literal["disabled", "private_http"], engine_transport)
        if admitted_engine_transport == "private_http" and admitted_queue_transport != "bullmq":
            raise ConfigurationError("private behavioral engine requires the BullMQ v2 transport")
        engine_url: str | None = None
        engine_token: str | None = None
        if admitted_engine_transport == "private_http":
            engine_url = _required("SIMULA_BEHAVIORAL_ENGINE_URL")
            _parse_behavioral_engine_url(engine_url, environment=environment)
            engine_token = _parse_behavioral_engine_token()
        try:
            metrics_port = int(raw_metrics_port)
        except ValueError as error:
            raise ConfigurationError("SIMULA_WORKER_METRICS_PORT must be an integer") from error
        if metrics_port not in range(1, 65_536):
            raise ConfigurationError("SIMULA_WORKER_METRICS_PORT must be from 1 through 65535")
        _parse_postgres_url(database_url, environment=environment)
        _parse_redis_url(redis_url, environment=environment)
        return cls(
            environment=environment,
            release_sha=release_sha,
            database_url=database_url,
            redis_url=redis_url,
            metrics_port=metrics_port,
            queue_transport=admitted_queue_transport,
            behavioral_engine_transport=admitted_engine_transport,
            behavioral_engine_url=engine_url,
            behavioral_engine_token=engine_token,
            migration_head=deployment_admission.migration_head,
            production_admission=deployment_admission.production_admission,
        )
