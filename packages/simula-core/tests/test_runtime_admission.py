from __future__ import annotations

import pytest
from simula_core.runtime_admission import (
    REQUIRED_DATABASE_MIGRATION_HEAD,
    RuntimeAdmissionError,
    parse_deployment_admission,
)

PRODUCTION = {
    "SIMULA_DATABASE_MIGRATION_HEAD": REQUIRED_DATABASE_MIGRATION_HEAD,
    "SIMULA_PRODUCTION_ADMISSION_ENABLED": "true",
    "SIMULA_PRODUCTION_ROLLOUT_ID": "018f274b-3c77-4b22-b749-c9274230ef9a",
    "SIMULA_RELEASE_PROVENANCE_URL": (
        "https://github.com/Third-Code-Solutions/Simula/actions/runs/12345678"
    ),
    "SIMULA_RELEASE_BUNDLE_SHA256": "a" * 64,
    "SIMULA_RELEASE_SIGSTORE_BUNDLE_SHA256": "b" * 64,
}


def test_local_and_test_bind_to_the_compiled_migration_head() -> None:
    admission = parse_deployment_admission("test", {})

    assert admission.migration_head == REQUIRED_DATABASE_MIGRATION_HEAD
    assert admission.production_admission is None


def test_every_deployed_environment_requires_the_exact_migration_head() -> None:
    admission = parse_deployment_admission(
        "staging",
        {"SIMULA_DATABASE_MIGRATION_HEAD": REQUIRED_DATABASE_MIGRATION_HEAD},
    )

    assert admission.migration_head == REQUIRED_DATABASE_MIGRATION_HEAD
    with pytest.raises(RuntimeAdmissionError, match="must equal"):
        parse_deployment_admission("staging", {"SIMULA_DATABASE_MIGRATION_HEAD": "20260730220000"})


def test_production_requires_bound_rollout_and_signed_provenance() -> None:
    admission = parse_deployment_admission("production", PRODUCTION)

    assert admission.production_admission is not None
    assert admission.production_admission.rollout_id == PRODUCTION["SIMULA_PRODUCTION_ROLLOUT_ID"]
    assert (
        admission.production_admission.provenance_url == PRODUCTION["SIMULA_RELEASE_PROVENANCE_URL"]
    )
    assert (
        admission.production_admission.release_bundle_sha256
        == PRODUCTION["SIMULA_RELEASE_BUNDLE_SHA256"]
    )
    assert (
        admission.production_admission.sigstore_bundle_sha256
        == PRODUCTION["SIMULA_RELEASE_SIGSTORE_BUNDLE_SHA256"]
    )


@pytest.mark.parametrize(
    ("name", "value"),
    (
        ("SIMULA_PRODUCTION_ADMISSION_ENABLED", ""),
        ("SIMULA_PRODUCTION_ADMISSION_ENABLED", "false"),
        ("SIMULA_PRODUCTION_ROLLOUT_ID", "not-a-uuid"),
        ("SIMULA_RELEASE_BUNDLE_SHA256", "a" * 63),
        ("SIMULA_RELEASE_SIGSTORE_BUNDLE_SHA256", "a" * 63),
        (
            "SIMULA_RELEASE_PROVENANCE_URL",
            "https://github.com/attacker/repository/actions/runs/12345678",
        ),
        (
            "SIMULA_RELEASE_PROVENANCE_URL",
            "https://github.com/Third-Code-Solutions/Simula/actions/runs/123?query=1",
        ),
        (
            "SIMULA_RELEASE_PROVENANCE_URL",
            "https://github.com:444/Third-Code-Solutions/Simula/actions/runs/12345678",
        ),
        (
            "SIMULA_RELEASE_PROVENANCE_URL",
            "https://github.com:invalid/Third-Code-Solutions/Simula/actions/runs/12345678",
        ),
    ),
)
def test_production_rejects_unsafe_admission_evidence(name: str, value: str) -> None:
    with pytest.raises(RuntimeAdmissionError):
        parse_deployment_admission("production", {**PRODUCTION, name: value})
