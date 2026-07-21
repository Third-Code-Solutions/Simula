from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


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
