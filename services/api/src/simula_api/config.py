"""Strict server-only configuration for the public API boundary."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlsplit


class ConfigurationError(ValueError):
    """Required runtime configuration is absent or unsafe."""


def _required(name: str) -> str:
    value = os.getenv(name)
    if value is None or not value.strip():
        raise ConfigurationError(f"{name} is required")
    return value.strip()


def _http_origin(value: str, *, name: str) -> str:
    parsed = urlsplit(value)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise ConfigurationError(f"{name} must contain exact HTTP origins")
    return value.removesuffix("/")


def _is_loopback(hostname: str | None) -> bool:
    return hostname in {"127.0.0.1", "localhost", "::1"}


@dataclass(frozen=True)
class ApiSettings:
    environment: str
    release_sha: str
    database_url: str
    supabase_url: str
    supabase_issuer: str
    supabase_jwks_url: str
    supabase_publishable_key: str
    redis_url: str
    rate_limit_key_prefix: str
    cursor_secret: bytes
    cors_origins: tuple[str, ...]

    @classmethod
    def from_environment(cls) -> ApiSettings:
        environment = _required("SIMULA_ENVIRONMENT")
        if environment not in {"local", "test", "preview", "staging", "production"}:
            raise ConfigurationError("SIMULA_ENVIRONMENT is unsupported")
        release_sha = _required("SIMULA_RELEASE_SHA")
        if not re.fullmatch(r"[0-9a-f]{40}", release_sha):
            raise ConfigurationError("SIMULA_RELEASE_SHA must be an exact 40-character git SHA")

        database_url = _required("SIMULA_DATABASE_URL")
        database = urlsplit(database_url)
        if database.scheme not in {"postgres", "postgresql"}:
            raise ConfigurationError("SIMULA_DATABASE_URL must be PostgreSQL")
        if database.username != "simula_api" and not re.fullmatch(
            r"simula_api\.[a-z0-9]{20}", database.username or ""
        ):
            raise ConfigurationError("SIMULA_DATABASE_URL must use simula_api")
        if not database.password or not database.hostname:
            raise ConfigurationError("SIMULA_DATABASE_URL needs injected credentials and a host")

        supabase_url = _http_origin(_required("SIMULA_SUPABASE_URL"), name="SIMULA_SUPABASE_URL")
        supabase = urlsplit(supabase_url)
        if environment in {"local", "test"}:
            if not _is_loopback(database.hostname) or not _is_loopback(supabase.hostname):
                raise ConfigurationError("local/test dependencies must remain on loopback")
        else:
            if database.scheme != "postgresql" or supabase.scheme != "https":
                raise ConfigurationError("deployed Supabase and PostgreSQL endpoints require TLS")
            ssl_modes = parse_qs(database.query).get("sslmode", [])
            if not ssl_modes or ssl_modes[-1].lower() != "verify-full":
                raise ConfigurationError("deployed PostgreSQL requires sslmode=verify-full")

        issuer = f"{supabase_url}/auth/v1"
        jwks_url = _required("SIMULA_SUPABASE_JWKS_URL").removesuffix("/")
        if jwks_url != f"{issuer}/.well-known/jwks.json":
            raise ConfigurationError("SIMULA_SUPABASE_JWKS_URL must match the Auth issuer")

        publishable_key = _required("SIMULA_SUPABASE_PUBLISHABLE_KEY")
        if not publishable_key.startswith("sb_publishable_"):
            raise ConfigurationError("only a Supabase publishable key is accepted")

        redis_url = _required("SIMULA_REDIS_URL")
        redis = urlsplit(redis_url)
        if (
            redis.scheme not in {"redis", "rediss"}
            or not redis.hostname
            or redis.query
            or redis.fragment
        ):
            raise ConfigurationError("SIMULA_REDIS_URL must be a Redis URL")
        if environment in {"local", "test"} and not _is_loopback(redis.hostname):
            raise ConfigurationError("local/test Redis must remain on loopback")

        rate_limit_key_prefix = os.getenv("SIMULA_RATE_LIMIT_KEY_PREFIX", "simula:rate:v1")
        if not re.fullmatch(r"[a-z][a-z0-9:_-]{2,127}", rate_limit_key_prefix):
            raise ConfigurationError("SIMULA_RATE_LIMIT_KEY_PREFIX is unsafe")

        cursor_secret = _required("SIMULA_CURSOR_SECRET")
        if len(cursor_secret.encode("utf-8")) < 32 or "replace" in cursor_secret.lower():
            raise ConfigurationError("SIMULA_CURSOR_SECRET must be an injected 32-byte secret")

        raw_origins = os.getenv("SIMULA_CORS_ORIGINS")
        if raw_origins is None and environment in {"local", "test"}:
            raw_origins = "http://127.0.0.1:3000,http://localhost:3000"
        if raw_origins is None:
            raise ConfigurationError("SIMULA_CORS_ORIGINS is required outside local/test")
        origins = tuple(
            _http_origin(origin.strip(), name="SIMULA_CORS_ORIGINS")
            for origin in raw_origins.split(",")
            if origin.strip()
        )
        if not origins or len(origins) != len(set(origins)) or "*" in origins:
            raise ConfigurationError("SIMULA_CORS_ORIGINS must be nonempty and unique")

        return cls(
            environment=environment,
            release_sha=release_sha,
            database_url=database_url,
            supabase_url=supabase_url,
            supabase_issuer=issuer,
            supabase_jwks_url=jwks_url,
            supabase_publishable_key=publishable_key,
            redis_url=redis_url,
            rate_limit_key_prefix=rate_limit_key_prefix,
            cursor_secret=cursor_secret.encode("utf-8"),
            cors_origins=origins,
        )
