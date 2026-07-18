"""Run the local-only Phase 2 browser gate against disposable runtime roles."""

from __future__ import annotations

import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import time
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import cast
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
NODE_TOOLCHAIN = Path(r"C:\Users\MSI\.codex\toolchains")
LOCAL_SUPABASE_DB_NAME = "supabase_db_simula-local"
LOCAL_FIXTURE_OWNER_EMAIL = "owner-a@simula.local"
LOCAL_FIXTURE_OWNER_PASSWORD = "SimulaLocalOnly!2026"  # noqa: S105 - local seed only.
API_URL = "http://127.0.0.1:8000/health/ready"
WEB_URL = "http://127.0.0.1:3100/"
START_TIMEOUT_SECONDS = 45


class BrowserGateError(RuntimeError):
    """A local browser gate cannot safely proceed."""


@dataclass(frozen=True)
class SupabaseRuntime:
    api_url: str
    publishable_key: str


def tool_environment() -> dict[str, str]:
    """Use the repository's exact Node toolchain without replacing caller settings."""

    environment = dict(os.environ)
    if os.name == "nt":
        additions = (NODE_TOOLCHAIN / "node-v24.18.0-win-x64", NODE_TOOLCHAIN / "bin")
        environment["PATH"] = os.pathsep.join(
            [*(str(path) for path in additions), environment["PATH"]]
        )
    return environment


def executable(name: str, *, environment: Mapping[str, str]) -> str:
    """Resolve a required tool before invoking a fixed command vector."""

    resolved = shutil.which(name, path=environment["PATH"])
    if resolved is None:
        raise BrowserGateError(f"required executable is unavailable: {name}")
    return resolved


def venv_python() -> str:
    """Return the repository-managed Python executable for direct service ownership."""

    candidate = (
        ROOT / ".venv" / "Scripts" / "python.exe"
        if os.name == "nt"
        else ROOT / ".venv" / "bin" / "python"
    )
    if not candidate.is_file():
        raise BrowserGateError("repository virtual-environment Python is unavailable")
    return str(candidate)


def node_executable(*, environment: Mapping[str, str]) -> str:
    """Return the exact pinned Node executable for direct Next ownership."""

    if os.name == "nt":
        candidate = NODE_TOOLCHAIN / "node-v24.18.0-win-x64" / "node.exe"
        if not candidate.is_file():
            raise BrowserGateError("pinned Node executable is unavailable")
        return str(candidate)
    return executable("node", environment=environment)


def pnpm_executable(*, environment: Mapping[str, str]) -> str:
    """Resolve the exact pnpm installed by the local or CI toolchain."""

    return executable("pnpm.cmd" if os.name == "nt" else "pnpm", environment=environment)


def docker_executable(*, environment: Mapping[str, str]) -> str:
    """Resolve Docker without assuming a Windows executable suffix."""

    return executable("docker.exe" if os.name == "nt" else "docker", environment=environment)


def run(
    command: Sequence[str],
    *,
    environment: Mapping[str, str],
    capture_output: bool = False,
    timeout_seconds: int = 180,
) -> subprocess.CompletedProcess[str]:
    """Run one repository-owned command without a shell."""

    return subprocess.run(  # noqa: S603 - callers provide fixed repository/local command vectors.
        command,
        check=True,
        cwd=ROOT,
        env=dict(environment),
        text=True,
        capture_output=capture_output,
        timeout=timeout_seconds,
    )


def local_supabase(environment: Mapping[str, str]) -> SupabaseRuntime:
    """Read only loopback public values from the locally running Supabase CLI."""

    pnpm = pnpm_executable(environment=environment)
    result = run(
        (pnpm, "exec", "supabase", "status", "--output", "env"),
        environment=environment,
        capture_output=True,
    )
    values: dict[str, str] = {}
    for line in result.stdout.splitlines():
        match = re.fullmatch(r'(API_URL|PUBLISHABLE_KEY)="(.*)"', line)
        if match:
            values[match.group(1)] = match.group(2)
    api_url = values.get("API_URL")
    publishable_key = values.get("PUBLISHABLE_KEY")
    if not api_url or not publishable_key:
        raise BrowserGateError("local Supabase public runtime values are unavailable")
    if not api_url.startswith("http://127.0.0.1:"):
        raise BrowserGateError("browser gate refuses non-loopback Supabase runtime")
    return SupabaseRuntime(api_url=api_url, publishable_key=publishable_key)


def ensure_free(port: int) -> None:
    """Fail closed instead of binding over a user-owned process."""

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as connection:
        connection.settimeout(0.25)
        if connection.connect_ex(("127.0.0.1", port)) == 0:
            raise BrowserGateError(f"local port {port} is already in use")


def configure_local_roles(environment: Mapping[str, str]) -> tuple[str, str]:
    """Set fresh credentials for the least-privilege roles in local Docker only."""

    docker = docker_executable(environment=environment)
    container = run(
        (docker, "ps", "--filter", f"name=^/{LOCAL_SUPABASE_DB_NAME}$", "--format", "{{.ID}}"),
        environment=environment,
        capture_output=True,
    ).stdout.strip()
    if not container:
        raise BrowserGateError("local Supabase database container is unavailable")
    api_credential = secrets.token_hex(32)
    worker_credential = secrets.token_hex(32)
    statement = (
        f"alter role simula_api password '{api_credential}'; "
        f"alter role simula_worker password '{worker_credential}';"
    )
    run(
        (
            docker,
            "exec",
            container,
            "psql",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-c",
            statement,
        ),
        environment=environment,
    )
    return api_credential, worker_credential


def runtime_environments(
    *,
    base: Mapping[str, str],
    supabase: SupabaseRuntime,
    api_credential: str,
    worker_credential: str,
) -> tuple[dict[str, str], dict[str, str], dict[str, str]]:
    """Construct per-service local-only environment maps."""

    public = {
        "NEXT_PUBLIC_SIMULA_API_URL": "http://127.0.0.1:8000",
        "NEXT_PUBLIC_SUPABASE_URL": supabase.api_url,
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": supabase.publishable_key,
    }
    common = {
        "SIMULA_ENVIRONMENT": "local",
        "SIMULA_RELEASE_SHA": "p2-browser-e2e",
        "SIMULA_LOG_LEVEL": "warning",
        "SIMULA_REDIS_URL": "redis://127.0.0.1:6379/0",
        "SIMULA_CORS_ORIGINS": "http://127.0.0.1:3100",
    }
    api = {
        **base,
        **common,
        **public,
        "SIMULA_CURSOR_SECRET": secrets.token_hex(32),
        "SIMULA_RATE_LIMIT_KEY_PREFIX": f"simula:e2e:{secrets.token_hex(16)}",
        "SIMULA_DATABASE_URL": (
            f"postgresql://simula_api:{api_credential}@127.0.0.1:54322/postgres?sslmode=disable"
        ),
        "SIMULA_SUPABASE_URL": supabase.api_url,
        "SIMULA_SUPABASE_JWKS_URL": f"{supabase.api_url}/auth/v1/.well-known/jwks.json",
        "SIMULA_SUPABASE_PUBLISHABLE_KEY": supabase.publishable_key,
    }
    worker = {
        **base,
        **common,
        "SIMULA_WORKER_DATABASE_URL": (
            "postgresql://simula_worker:"
            f"{worker_credential}@127.0.0.1:54322/postgres?sslmode=disable"
        ),
    }
    web = {**base, **public, "HOSTNAME": "127.0.0.1", "PORT": "3100"}
    return api, worker, web


def start_process(
    command: Sequence[str],
    *,
    environment: Mapping[str, str],
    log_name: str,
    working_directory: Path = ROOT,
) -> subprocess.Popen[bytes]:
    """Start one contained local process with logs excluded from version control."""

    log_directory = ROOT / ".playwright-cli"
    log_directory.mkdir(exist_ok=True)
    log_path = log_directory / log_name
    log_handle = log_path.open("wb")
    try:
        return subprocess.Popen(  # noqa: S603 - callers provide fixed repository commands.
            command,
            cwd=working_directory,
            env=dict(environment),
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    finally:
        log_handle.close()


def prepare_standalone_assets() -> Path:
    """Copy browser assets that Next excludes from its standalone server output."""

    web_root = ROOT / "apps" / "web"
    build_root = web_root / ".next"
    standalone_root = build_root / "standalone" / "apps" / "web"
    static_source = build_root / "static"
    if not static_source.is_dir():
        raise BrowserGateError("Next standalone build is missing browser static assets")
    shutil.copytree(static_source, standalone_root / ".next" / "static", dirs_exist_ok=True)

    public_source = web_root / "public"
    if public_source.is_dir():
        shutil.copytree(public_source, standalone_root / "public", dirs_exist_ok=True)
    return standalone_root


def stop_process(process: subprocess.Popen[bytes]) -> None:
    """Stop only a process this gate created."""

    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def response_is_ok(url: str) -> bool:
    try:
        with urlopen(url, timeout=1) as response:  # noqa: S310 - fixed local loopback URLs.
            status = cast(int | None, response.getcode())
            return status == 200
    except URLError:
        return False


def wait_for_runtime(processes: Sequence[subprocess.Popen[bytes]]) -> None:
    """Require both listener health checks before browser tests may use the ports."""

    deadline = time.monotonic() + START_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if any(process.poll() is not None for process in processes):
            raise BrowserGateError("a local browser-gate service exited before readiness")
        if response_is_ok(API_URL) and response_is_ok(WEB_URL):
            return
        time.sleep(0.25)
    raise BrowserGateError("local browser-gate services did not become ready")


def main() -> None:
    """Build, prove, and clean up the Phase 2 local browser runtime."""

    environment = tool_environment()
    ensure_free(8000)
    ensure_free(3100)
    pnpm = pnpm_executable(environment=environment)
    python = venv_python()
    node = node_executable(environment=environment)
    run((pnpm, "redis:up"), environment=environment)
    supabase = local_supabase(environment)
    api_credential, worker_credential = configure_local_roles(environment)
    api_environment, worker_environment, web_environment = runtime_environments(
        base=environment,
        supabase=supabase,
        api_credential=api_credential,
        worker_credential=worker_credential,
    )
    run(
        (pnpm, "--filter", "@simula/web", "build"),
        environment=web_environment,
        timeout_seconds=240,
    )
    standalone_web_root = prepare_standalone_assets()
    processes = [
        start_process(
            (python, "-m", "simula_api"),
            environment=api_environment,
            log_name="p2-api.log",
        ),
        start_process(
            (python, "-m", "simula_worker"),
            environment=worker_environment,
            log_name="p2-worker.log",
        ),
        start_process(
            (
                node,
                str(standalone_web_root / "server.js"),
            ),
            environment=web_environment,
            log_name="p2-web.log",
            working_directory=standalone_web_root,
        ),
    ]
    try:
        wait_for_runtime(processes)
        e2e_environment = {
            **environment,
            "SIMULA_E2E_BASE_URL": "http://127.0.0.1:3100",
            "SIMULA_E2E_OWNER_EMAIL": LOCAL_FIXTURE_OWNER_EMAIL,
            "SIMULA_E2E_OWNER_PASSWORD": LOCAL_FIXTURE_OWNER_PASSWORD,
        }
        test_command = [pnpm, "exec", "playwright", "test"]
        if test_filter := os.getenv("SIMULA_E2E_GREP"):
            test_command.extend(("--grep", test_filter))
        run(
            test_command,
            environment=e2e_environment,
            timeout_seconds=180,
        )
    finally:
        for process in reversed(processes):
            stop_process(process)

    print("Phase 2 local browser gate passed")


if __name__ == "__main__":
    try:
        main()
    except (BrowserGateError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        print(f"Phase 2 local browser gate failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
