from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import cast
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
RUNTIME_SQL = REPOSITORY_ROOT / "tests" / "database" / "runtime_adversarial.sql"
M2_RUNTIME_SQL = REPOSITORY_ROOT / "tests" / "database" / "m2_commands_adversarial.sql"
SUPABASE_DB_CONTAINER = "supabase_db_simula-local"
EXPECTED_API_URL = "http://127.0.0.1:54321"
LOCAL_FIXTURE_PASSWORD = "SimulaLocalOnly!2026"  # noqa: S105 - disposable local fixture.
LOCAL_USERS = {
    "owner-a@simula.local": "00000000-0000-4000-8000-000000000001",
    "viewer-a@simula.local": "00000000-0000-4000-8000-000000000002",
    "owner-b@simula.local": "00000000-0000-4000-8000-000000000003",
}


@dataclass(frozen=True)
class LocalSupabase:
    api_url: str
    publishable_key: str


def _run_captured(
    command: list[str],
    *,
    environment: dict[str, str] | None = None,
    input_text: str | None = None,
    timeout_seconds: float = 30,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(  # noqa: S603
        command,
        cwd=REPOSITORY_ROOT,
        input=input_text,
        text=True,
        capture_output=True,
        check=False,
        env=environment,
        timeout=timeout_seconds,
    )


def _parse_env_output(output: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in output.splitlines():
        line = raw_line.strip()
        if not line or "=" not in line:
            continue
        key, raw_value = line.split("=", 1)
        if raw_value.startswith('"'):
            decoded = json.loads(raw_value)
            if isinstance(decoded, str):
                values[key] = decoded
        else:
            values[key] = raw_value
    return values


@pytest.fixture(scope="module")
def local_supabase() -> LocalSupabase:
    pnpm = shutil.which("pnpm")
    if pnpm is None:
        pytest.fail("pnpm executable is unavailable")
    status = _run_captured(
        [pnpm, "exec", "supabase", "status", "--output", "env"],
        timeout_seconds=90,
    )
    if status.returncode != 0:
        pytest.fail("local Supabase status failed; start the disposable local stack first")

    values = _parse_env_output(status.stdout)
    api_url = values.get("API_URL")
    publishable_key = values.get("PUBLISHABLE_KEY") or values.get("ANON_KEY")
    if api_url != EXPECTED_API_URL or not publishable_key:
        pytest.fail("local Supabase returned an unsafe endpoint or no publishable key")
    return LocalSupabase(api_url=api_url, publishable_key=publishable_key)


def _request_json(
    *,
    method: str,
    url: str,
    headers: dict[str, str],
    payload: dict[str, object] | None = None,
) -> tuple[int, dict[str, object]]:
    if not url.startswith(f"{EXPECTED_API_URL}/"):
        raise AssertionError("test HTTP target escaped fixed loopback Supabase")
    body = None if payload is None else json.dumps(payload).encode()
    request = Request(url, data=body, headers=headers, method=method)  # noqa: S310
    try:
        with urlopen(request, timeout=10) as response:  # noqa: S310
            status = response.status
            response_body = response.read().decode()
    except HTTPError as error:
        try:
            status = error.code
            response_body = error.read().decode()
        finally:
            error.close()

    if not response_body:
        return status, {}
    parsed = json.loads(response_body)
    if not isinstance(parsed, dict):
        raise AssertionError("Supabase returned a non-object response")
    return status, cast(dict[str, object], parsed)


def _sign_in(supabase: LocalSupabase, email: str) -> str:
    query = urlencode({"grant_type": "password"})
    status, response = _request_json(
        method="POST",
        url=f"{supabase.api_url}/auth/v1/token?{query}",
        headers={
            "apikey": supabase.publishable_key,
            "Content-Type": "application/json",
        },
        payload={"email": email, "password": LOCAL_FIXTURE_PASSWORD},
    )
    assert status == 200
    user = response.get("user")
    assert isinstance(user, dict)
    assert user.get("id") == LOCAL_USERS[email]
    access_token = response.get("access_token")
    assert isinstance(access_token, str) and access_token
    return access_token


def _assert_data_api_denied(
    supabase: LocalSupabase,
    *,
    access_token: str | None,
) -> None:
    headers = {"apikey": supabase.publishable_key}
    if access_token is not None:
        headers["Authorization"] = f"Bearer {access_token}"

    status, response = _request_json(
        method="GET",
        url=f"{supabase.api_url}/rest/v1/organizations?select=id",
        headers=headers,
    )
    assert status == 404
    assert response.get("code") == "PGRST205"

    profile_headers = {**headers, "Accept-Profile": "api"}
    status, response = _request_json(
        method="GET",
        url=f"{supabase.api_url}/rest/v1/organizations?select=id",
        headers=profile_headers,
    )
    assert status == 406
    assert response.get("code") == "PGRST106"

    rpc_headers = {
        **headers,
        "Content-Profile": "api",
        "Content-Type": "application/json",
    }
    status, response = _request_json(
        method="POST",
        url=f"{supabase.api_url}/rest/v1/rpc/list_organizations",
        headers=rpc_headers,
        payload={},
    )
    assert status == 406
    assert response.get("code") == "PGRST106"


@pytest.mark.integration
def test_authored_users_sign_in_and_data_api_stays_default_deny(
    local_supabase: LocalSupabase,
) -> None:
    access_tokens = [_sign_in(local_supabase, email) for email in LOCAL_USERS]

    _assert_data_api_denied(local_supabase, access_token=None)
    for access_token in access_tokens:
        _assert_data_api_denied(local_supabase, access_token=access_token)


def _run_runtime_sql(sql_path: Path, success_marker: str) -> None:
    inspect = _run_captured(
        [
            "docker",
            "inspect",
            "--format",
            "{{range .Config.Env}}{{println .}}{{end}}",
            SUPABASE_DB_CONTAINER,
        ]
    )
    if inspect.returncode != 0:
        pytest.fail("local Supabase database container is unavailable")

    password_line = next(
        (line for line in inspect.stdout.splitlines() if line.startswith("POSTGRES_PASSWORD=")),
        None,
    )
    if password_line is None:
        pytest.fail("local Supabase test bootstrap password is unavailable")
    password = password_line.removeprefix("POSTGRES_PASSWORD=")

    sql_test = _run_captured(
        [
            "docker",
            "exec",
            "-i",
            "-e",
            "PGPASSWORD",
            SUPABASE_DB_CONTAINER,
            "psql",
            "-h",
            "127.0.0.1",
            "-U",
            "supabase_admin",
            "-d",
            "postgres",
            "-X",
        ],
        environment={**os.environ, "PGPASSWORD": password},
        input_text=sql_path.read_text(encoding="utf-8"),
    )
    if sql_test.returncode != 0:
        safe_output = (sql_test.stdout + sql_test.stderr)[-4000:]
        pytest.fail(f"runtime adversarial SQL failed:\n{safe_output}")
    assert success_marker in sql_test.stdout


@pytest.mark.integration
def test_runtime_role_claims_rls_and_atomic_command_graph() -> None:
    _run_runtime_sql(RUNTIME_SQL, "runtime adversarial database tests: PASS")


@pytest.mark.integration
def test_m2_project_and_stimulus_command_graph() -> None:
    _run_runtime_sql(M2_RUNTIME_SQL, "m2 command adversarial database tests: PASS")
