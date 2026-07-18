"""Strict worker runtime configuration.

The worker is intentionally unable to start with the API, owner, or postgres
database roles.  Its database authority is limited to the ``simula_worker``
execution functions granted in the schema.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse


class ConfigurationError(ValueError):
    """Raised when worker runtime configuration is missing or unsafe."""


_LOCAL_ENVIRONMENTS = frozenset({"local", "test"})
_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1", "localhost"})
_VALID_ENVIRONMENTS = frozenset({"local", "test", "preview", "staging", "production"})


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ConfigurationError(f"{name} is required")
    return value


def _parse_postgres_url(url: str, *, environment: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise ConfigurationError("SIMULA_WORKER_DATABASE_URL must use postgres or postgresql")
    if parsed.username != "simula_worker":
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
    if parsed.scheme != "postgresql" or sslmode not in {"require", "verify-ca", "verify-full"}:
        raise ConfigurationError("non-local worker database must use postgresql with TLS sslmode")


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
    if parsed.scheme != "rediss":
        raise ConfigurationError("non-local Redis must use rediss")


@dataclass(frozen=True, slots=True)
class WorkerSettings:
    environment: str
    database_url: str
    redis_url: str
    metrics_port: int

    @classmethod
    def from_environment(cls) -> WorkerSettings:
        environment = _required("SIMULA_ENVIRONMENT").lower()
        if environment not in _VALID_ENVIRONMENTS:
            raise ConfigurationError("SIMULA_ENVIRONMENT is unsupported")
        database_url = _required("SIMULA_WORKER_DATABASE_URL")
        redis_url = _required("SIMULA_REDIS_URL")
        raw_metrics_port = os.getenv("SIMULA_WORKER_METRICS_PORT", "9464")
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
            database_url=database_url,
            redis_url=redis_url,
            metrics_port=metrics_port,
        )
