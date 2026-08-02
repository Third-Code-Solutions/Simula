"""Shared fail-closed admission for deployed SIMULA runtimes."""

from __future__ import annotations

import os
import re
from collections.abc import Mapping
from dataclasses import dataclass
from urllib.parse import urlsplit

REQUIRED_DATABASE_MIGRATION_HEAD = "20260802150000"

_DEPLOYED_ENVIRONMENTS = frozenset({"preview", "staging", "production"})
_UUID_V4 = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
_RELEASE_PROVENANCE_PATH = re.compile(r"/Third-Code-Solutions/Simula/actions/runs/[0-9]+")


class RuntimeAdmissionError(ValueError):
    """A deployed runtime is not bound to the approved release evidence."""


@dataclass(frozen=True, slots=True)
class ProductionAdmission:
    rollout_id: str
    provenance_url: str
    release_bundle_sha256: str
    sigstore_bundle_sha256: str


@dataclass(frozen=True, slots=True)
class DeploymentAdmission:
    migration_head: str
    production_admission: ProductionAdmission | None = None


def _required(source: Mapping[str, str], name: str) -> str:
    value = source.get(name, "").strip()
    if not value:
        raise RuntimeAdmissionError(f"{name} is required.")
    return value


def _provenance_url(raw_value: str) -> str:
    try:
        value = urlsplit(raw_value)
        port = value.port
    except ValueError as error:
        raise RuntimeAdmissionError(
            "SIMULA_RELEASE_PROVENANCE_URL must identify the SIMULA GitHub Actions run."
        ) from error
    if (
        value.scheme != "https"
        or value.hostname != "github.com"
        or value.username is not None
        or value.password is not None
        or port is not None
        or value.query
        or value.fragment
        or _RELEASE_PROVENANCE_PATH.fullmatch(value.path) is None
    ):
        raise RuntimeAdmissionError(
            "SIMULA_RELEASE_PROVENANCE_URL must identify the SIMULA GitHub Actions run."
        )
    return raw_value


def parse_deployment_admission(
    environment: str,
    source: Mapping[str, str] | None = None,
) -> DeploymentAdmission:
    """Bind every deployed runtime to the exact schema and production evidence."""

    runtime_environment = os.environ if source is None else source
    if environment not in _DEPLOYED_ENVIRONMENTS:
        return DeploymentAdmission(migration_head=REQUIRED_DATABASE_MIGRATION_HEAD)

    migration_head = _required(runtime_environment, "SIMULA_DATABASE_MIGRATION_HEAD")
    if migration_head != REQUIRED_DATABASE_MIGRATION_HEAD:
        raise RuntimeAdmissionError(
            f"SIMULA_DATABASE_MIGRATION_HEAD must equal {REQUIRED_DATABASE_MIGRATION_HEAD}."
        )
    if environment != "production":
        return DeploymentAdmission(migration_head=REQUIRED_DATABASE_MIGRATION_HEAD)

    if _required(runtime_environment, "SIMULA_PRODUCTION_ADMISSION_ENABLED") != "true":
        raise RuntimeAdmissionError(
            "SIMULA_PRODUCTION_ADMISSION_ENABLED must be true in production."
        )
    rollout_id = _required(runtime_environment, "SIMULA_PRODUCTION_ROLLOUT_ID")
    if _UUID_V4.fullmatch(rollout_id) is None:
        raise RuntimeAdmissionError("SIMULA_PRODUCTION_ROLLOUT_ID must be a lowercase UUIDv4.")
    release_bundle_sha256 = _required(runtime_environment, "SIMULA_RELEASE_BUNDLE_SHA256")
    if re.fullmatch(r"[0-9a-f]{64}", release_bundle_sha256) is None:
        raise RuntimeAdmissionError(
            "SIMULA_RELEASE_BUNDLE_SHA256 must be an exact lowercase SHA-256."
        )
    sigstore_bundle_sha256 = _required(runtime_environment, "SIMULA_RELEASE_SIGSTORE_BUNDLE_SHA256")
    if re.fullmatch(r"[0-9a-f]{64}", sigstore_bundle_sha256) is None:
        raise RuntimeAdmissionError(
            "SIMULA_RELEASE_SIGSTORE_BUNDLE_SHA256 must be an exact lowercase SHA-256."
        )
    provenance_url = _provenance_url(
        _required(runtime_environment, "SIMULA_RELEASE_PROVENANCE_URL")
    )

    return DeploymentAdmission(
        migration_head=REQUIRED_DATABASE_MIGRATION_HEAD,
        production_admission=ProductionAdmission(
            rollout_id=rollout_id,
            provenance_url=provenance_url,
            release_bundle_sha256=release_bundle_sha256,
            sigstore_bundle_sha256=sigstore_bundle_sha256,
        ),
    )
