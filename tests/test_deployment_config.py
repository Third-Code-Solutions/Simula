from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_railway_runtime_configs_use_valid_numeric_rollout_windows() -> None:
    expected_windows = {
        "railway.api.json": (15, 30),
        "railway.worker.json": (30, 15),
    }

    for filename, (draining_seconds, overlap_seconds) in expected_windows.items():
        config = json.loads((ROOT / filename).read_text(encoding="utf-8"))

        assert config["build"]["builder"] == "DOCKERFILE"
        assert config["deploy"]["drainingSeconds"] == draining_seconds
        assert config["deploy"]["overlapSeconds"] == overlap_seconds


def test_railway_web_uses_the_pinned_monorepo_dockerfile() -> None:
    config = json.loads((ROOT / "railway.web.json").read_text(encoding="utf-8"))

    assert config["build"]["builder"] == "DOCKERFILE"
    assert config["build"]["dockerfilePath"] == "apps/web/Dockerfile"
    assert "railway.web.json" in config["build"]["watchPatterns"]
    assert config["deploy"]["drainingSeconds"] == 15
    assert config["deploy"]["healthcheckPath"] == "/api/health"
    assert config["deploy"]["overlapSeconds"] == 30
    assert config["deploy"]["startCommand"] is None
    assert config["environments"]["production"]["build"]["buildEnvironment"] == "V2"


def test_web_image_accepts_public_build_values_and_dynamic_port() -> None:
    dockerfile = (ROOT / "apps" / "web" / "Dockerfile").read_text(encoding="utf-8")

    for key in (
        "NEXT_PUBLIC_SIMULA_API_URL",
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ):
        assert f"ARG {key}" in dockerfile

    assert "process.env.PORT||'3000'" in dockerfile


def test_api_image_installs_the_pinned_supabase_ca() -> None:
    dockerfile = (ROOT / "services" / "api" / "Dockerfile").read_text(encoding="utf-8")
    certificate = (ROOT / "services" / "api" / "certs" / "supabase-prod-ca-2021.crt").read_text(
        encoding="utf-8"
    )

    assert "supabase-prod-ca-2021.crt /etc/ssl/certs/supabase-prod-ca-2021.crt" in dockerfile
    assert certificate.startswith("-----BEGIN CERTIFICATE-----")
    assert "PRIVATE KEY" not in certificate
