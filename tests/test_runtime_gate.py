from __future__ import annotations

import ctypes
import json
import os
import signal
import subprocess
import sys
import tempfile
import time
import tomllib
from collections.abc import Callable
from pathlib import Path
from typing import Any, cast

import pytest

import scripts.verify_m0_runtime as runtime_module
from scripts.verify_m0_runtime import (
    AUTH_HEALTH_URL,
    CLEANUP_TIMEOUT,
    DATABASE_RESET_TIMEOUT,
    EXPECTED_SUPABASE_VERSION,
    IMAGE_BUILD_INPUTS,
    IMAGE_BUILD_TIMEOUT,
    INTEGRATION_TEST,
    INTEGRATION_TIMEOUT,
    LOCAL_PROJECT_ID,
    PREFLIGHT_TIMEOUT,
    PROBE_TIMEOUT,
    SERVICE_START_TIMEOUT,
    SUPABASE_RESET_ARGS,
    SUPABASE_START_ARGS,
    TOOLCHAIN_TIMEOUT,
    GateLock,
    OutputMode,
    RuntimeGate,
    RuntimeGateError,
    docker_endpoint_is_local,
    execute_command,
    probe_health,
    sanitized_environment,
    validate_compose_configuration,
)

RUN_ID = "0123456789ab"
DOCKER_CONTEXT = "desktop-linux"
DOCKER_ENDPOINT = "npipe:////./pipe/dockerDesktopLinuxEngine"
VALID_COMPOSE_CONFIGURATION = {
    "networks": {"simula-private": {"name": "simula-m0_simula-private"}},
    "services": {
        "redis": {
            "networks": {"simula-private": None},
            "ports": [
                {
                    "host_ip": "127.0.0.1",
                    "mode": "ingress",
                    "published": "6379",
                    "protocol": "tcp",
                    "target": 6379,
                }
            ],
        }
    },
}

Call = tuple[tuple[str, ...], Path, OutputMode, float, str | None]
FailureFor = Callable[[tuple[str, ...]], BaseException | None]


class FakeExecutor:
    def __init__(
        self,
        *,
        output_for: Callable[[tuple[str, ...]], str] | None = None,
        failure_for: FailureFor | None = None,
        on_command: Callable[[tuple[str, ...]], None] | None = None,
    ) -> None:
        self.calls: list[Call] = []
        self.output_for = output_for or (lambda _command: "")
        self.failure_for = failure_for or (lambda _command: None)
        self.on_command = on_command or (lambda _command: None)
        self.images: set[str] = set()
        self.containers: set[str] = set()

    def _state_output(self, command: tuple[str, ...]) -> str | None:
        if "image" in command and "ls" in command and "--quiet" in command:
            return "owned-image\n" if command[-1] in self.images else ""
        if "container" in command and "ls" in command and "--filter" in command:
            filter_value = command[command.index("--filter") + 1]
            if filter_value.startswith("name=^/") and filter_value.endswith("$"):
                name = filter_value.removeprefix("name=^/").removesuffix("$")
                return "owned-container\n" if name in self.containers else ""
        return None

    def _record_started_resource(self, command: tuple[str, ...]) -> None:
        if "build" in command and "--tag" in command:
            self.images.add(command[command.index("--tag") + 1])
        if "run" in command and "--name" in command:
            self.containers.add(command[command.index("--name") + 1])

    def _record_success(self, command: tuple[str, ...]) -> None:
        self._record_started_resource(command)
        if "container" in command and "rm" in command and "--force" in command:
            self.containers.discard(command[-1])
        if "image" in command and "rm" in command:
            self.images.discard(command[-1])

    def __call__(
        self,
        command: tuple[str, ...],
        *,
        cwd: Path,
        output: OutputMode = OutputMode.INHERIT,
        timeout_seconds: float,
        docker_context: str | None,
    ) -> subprocess.CompletedProcess[str]:
        self.calls.append((command, cwd, output, timeout_seconds, docker_context))
        self.on_command(command)
        failure = self.failure_for(command)
        if failure is not None:
            if isinstance(failure, subprocess.TimeoutExpired):
                self._record_started_resource(command)
            raise failure
        state_output = self._state_output(command)
        self._record_success(command)
        stdout = self.output_for(command) if state_output is None else state_output
        return subprocess.CompletedProcess(command, 0, stdout=stdout, stderr="")


def _repository(tmp_path: Path) -> Path:
    for path in (
        "compose.yaml",
        "supabase/seed.sql",
        "apps/web/Dockerfile",
        "services/api/Dockerfile",
        "services/worker/Dockerfile",
    ):
        target = tmp_path / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.touch()
    config = tmp_path / "supabase/config.toml"
    config.write_text(f'project_id = "{LOCAL_PROJECT_ID}"\n', encoding="utf-8")
    return tmp_path.resolve()


def _successful_output(command: tuple[str, ...]) -> str:
    if command == ("docker", "context", "show"):
        return DOCKER_CONTEXT + "\n"
    if command[:3] == ("docker", "context", "inspect"):
        return f'"{DOCKER_ENDPOINT}"\n'
    if command == ("pnpm", "exec", "supabase", "--version"):
        return EXPECTED_SUPABASE_VERSION + "\n"
    if command[-3:] == ("config", "--format", "json"):
        return json.dumps(VALID_COMPOSE_CONFIGURATION)
    if command[-5:] == ("exec", "-T", "redis", "id", "-u"):
        return "999\n"
    if "image" in command and "inspect" in command:
        return ("node" if "simula-web:" in command[-1] else "simula") + "\n"
    return ""


def _process_is_running(process_id: int) -> bool:
    if os.name != "nt":
        try:
            os.kill(process_id, 0)
        except ProcessLookupError:
            return False
        except PermissionError:
            return True
        return True

    kernel32 = cast(Any, ctypes).WinDLL("kernel32", use_last_error=True)
    process_handle = kernel32.OpenProcess(0x1000, False, process_id)
    if not process_handle:
        return False
    try:
        exit_code = ctypes.c_ulong()
        if not kernel32.GetExitCodeProcess(process_handle, ctypes.byref(exit_code)):
            return False
        return exit_code.value == 259
    finally:
        kernel32.CloseHandle(process_handle)


def _force_kill_process(process_id: int) -> None:
    try:
        os.kill(process_id, signal.SIGTERM)
    except ProcessLookupError:
        pass


def _gate(
    repository: Path,
    executor: FakeExecutor,
    **overrides: Any,
) -> RuntimeGate:
    return RuntimeGate(
        repository_root=repository,
        executor=executor,
        health_probe=overrides.pop("health_probe", lambda _url, timeout_seconds: 200),
        port_probe=overrides.pop("port_probe", lambda _host, _port: True),
        run_id=overrides.pop("run_id", RUN_ID),
        lock_path=overrides.pop("lock_path", repository / "gate.lock"),
        **overrides,
    )


def _call(
    repository: Path,
    command: tuple[str, ...],
    output: OutputMode,
    timeout_seconds: float,
    docker_context: str | None = DOCKER_CONTEXT,
) -> Call:
    return command, repository, output, timeout_seconds, docker_context


def _docker(*arguments: str) -> tuple[str, ...]:
    return "docker", "--context", DOCKER_CONTEXT, *arguments


def _compose(gate: RuntimeGate, *arguments: str) -> tuple[str, ...]:
    return _docker(
        "compose",
        "--file",
        str(gate.repository_root / "compose.yaml"),
        "--project-directory",
        str(gate.repository_root),
        "--project-name",
        gate.compose_project,
        *arguments,
    )


def _preflight_calls(gate: RuntimeGate) -> list[Call]:
    repository = gate.repository_root
    calls = [
        _call(
            repository,
            ("docker", "context", "show"),
            OutputMode.CAPTURE,
            PREFLIGHT_TIMEOUT,
            None,
        ),
        _call(
            repository,
            (
                "docker",
                "context",
                "inspect",
                DOCKER_CONTEXT,
                "--format",
                "{{json .Endpoints.docker.Host}}",
            ),
            OutputMode.CAPTURE,
            PREFLIGHT_TIMEOUT,
            None,
        ),
        _call(repository, _docker("info"), OutputMode.CAPTURE, PREFLIGHT_TIMEOUT),
        _call(
            repository,
            _compose(gate, "config", "--format", "json"),
            OutputMode.CAPTURE,
            PREFLIGHT_TIMEOUT,
        ),
        _call(
            repository,
            ("pnpm", "toolchain:check"),
            OutputMode.INHERIT,
            TOOLCHAIN_TIMEOUT,
        ),
        _call(
            repository,
            ("pnpm", "exec", "supabase", "--version"),
            OutputMode.CAPTURE,
            PREFLIGHT_TIMEOUT,
        ),
        _call(
            repository,
            _docker(
                "container",
                "ls",
                "--all",
                "--filter",
                f"label=com.docker.compose.project={gate.compose_project}",
                "--quiet",
            ),
            OutputMode.CAPTURE,
            PREFLIGHT_TIMEOUT,
        ),
        _call(
            repository,
            _docker(
                "container",
                "ls",
                "--all",
                "--filter",
                f"name={gate.supabase_project}",
                "--quiet",
            ),
            OutputMode.CAPTURE,
            PREFLIGHT_TIMEOUT,
        ),
    ]
    for image in gate.image_users:
        calls.append(
            _call(
                repository,
                _docker("image", "ls", "--quiet", image),
                OutputMode.CAPTURE,
                PREFLIGHT_TIMEOUT,
            )
        )
    return calls


def _success_calls(gate: RuntimeGate) -> list[Call]:
    assert gate.supabase_workdir is not None
    repository = gate.repository_root
    workdir = str(gate.supabase_workdir)
    calls = _preflight_calls(gate)
    calls.extend(
        (
            _call(
                repository,
                _compose(gate, "up", "--detach", "--wait", "redis"),
                OutputMode.INHERIT,
                SERVICE_START_TIMEOUT,
            ),
            _call(
                repository,
                _compose(gate, "exec", "-T", "redis", "id", "-u"),
                OutputMode.CAPTURE,
                PREFLIGHT_TIMEOUT,
            ),
            _call(
                repository,
                ("pnpm", "exec", "supabase", "--workdir", workdir, *SUPABASE_START_ARGS),
                OutputMode.DISCARD,
                SERVICE_START_TIMEOUT,
            ),
            _call(
                repository,
                ("pnpm", "exec", "supabase", "--workdir", workdir, *SUPABASE_RESET_ARGS),
                OutputMode.INHERIT,
                DATABASE_RESET_TIMEOUT,
            ),
            _call(
                repository,
                INTEGRATION_TEST,
                OutputMode.INHERIT,
                INTEGRATION_TIMEOUT,
            ),
        )
    )

    for service, dockerfile, _expected_user in IMAGE_BUILD_INPUTS:
        image = f"simula-{service}:m0-{RUN_ID}"
        calls.append(
            _call(
                repository,
                _docker(
                    "build",
                    "--pull",
                    "--tag",
                    image,
                    "--file",
                    dockerfile,
                    ".",
                ),
                OutputMode.INHERIT,
                IMAGE_BUILD_TIMEOUT,
            )
        )
    for image in gate.image_users:
        calls.append(
            _call(
                repository,
                _docker("image", "inspect", "--format", "{{.Config.User}}", image),
                OutputMode.CAPTURE,
                PREFLIGHT_TIMEOUT,
            )
        )
    calls.extend(
        (
            _call(
                repository,
                _docker(
                    "run",
                    "--name",
                    gate.probe_containers["api"],
                    f"simula-api:m0-{RUN_ID}",
                    "python",
                    "-c",
                    "import simula_api",
                ),
                OutputMode.INHERIT,
                PROBE_TIMEOUT,
            ),
            _call(
                repository,
                _docker(
                    "run",
                    "--name",
                    gate.probe_containers["worker"],
                    f"simula-worker:m0-{RUN_ID}",
                    "python",
                    "-m",
                    "simula_worker",
                    "--check",
                ),
                OutputMode.INHERIT,
                PROBE_TIMEOUT,
            ),
        )
    )
    for container in reversed(tuple(gate.probe_containers.values())):
        calls.extend(
            (
                _call(
                    repository,
                    _docker(
                        "container",
                        "ls",
                        "--all",
                        "--filter",
                        f"name=^/{container}$",
                        "--quiet",
                    ),
                    OutputMode.CAPTURE,
                    PREFLIGHT_TIMEOUT,
                ),
                _call(
                    repository,
                    _docker("container", "rm", "--force", container),
                    OutputMode.INHERIT,
                    CLEANUP_TIMEOUT,
                ),
            )
        )
    calls.extend(
        (
            _call(
                repository,
                (
                    "pnpm",
                    "exec",
                    "supabase",
                    "--workdir",
                    workdir,
                    "stop",
                    "--project-id",
                    gate.supabase_project,
                    "--no-backup",
                ),
                OutputMode.INHERIT,
                CLEANUP_TIMEOUT,
            ),
            _call(
                repository,
                _compose(gate, "down", "--volumes", "--remove-orphans"),
                OutputMode.INHERIT,
                CLEANUP_TIMEOUT,
            ),
        )
    )
    for image in reversed(tuple(gate.image_users)):
        calls.extend(
            (
                _call(
                    repository,
                    _docker("image", "ls", "--quiet", image),
                    OutputMode.CAPTURE,
                    PREFLIGHT_TIMEOUT,
                ),
                _call(
                    repository,
                    _docker("image", "rm", image),
                    OutputMode.INHERIT,
                    CLEANUP_TIMEOUT,
                ),
            )
        )
    return calls


def test_child_environment_removes_routing_and_hosted_overrides() -> None:
    environment = sanitized_environment(
        {
            "PATH": "safe-path",
            "DOCKER_HOST": "ssh://remote.example",
            "DOCKER_CONTEXT": "remote",
            "DOCKER_CONFIG": "remote-config",
            "COMPOSE_FILE": "outside.yaml",
            "COMPOSE_PROJECT_NAME": "unrelated",
            "SUPABASE_ACCESS_TOKEN": "credential",
            "SUPABASE_CLI_BINARY_OVERRIDE": "outside-binary",
            "SUPABASE_URL": "https://remote.example",
            "SUPABASE_WORKDIR": "outside",
            "SIMULA_REDIS_PORT": "6380",
        },
        docker_context=DOCKER_CONTEXT,
    )

    assert environment == {
        "PATH": "safe-path",
        "DOCKER_CONTEXT": DOCKER_CONTEXT,
        "SIMULA_REDIS_PORT": "6379",
        "SUPABASE_TELEMETRY_DISABLED": "1",
    }


def test_only_local_docker_endpoints_are_accepted() -> None:
    assert docker_endpoint_is_local("unix:///var/run/docker.sock")
    assert docker_endpoint_is_local(DOCKER_ENDPOINT)
    assert not docker_endpoint_is_local("ssh://builder.example")
    assert not docker_endpoint_is_local("tcp://127.0.0.1:2375")
    assert not docker_endpoint_is_local("tcp://192.0.2.10:2375")
    assert not docker_endpoint_is_local("tcp://localhost:2375")


def test_hosted_link_marker_refuses_every_command(tmp_path: Path) -> None:
    repository = _repository(tmp_path)
    marker = repository / "supabase/.temp/project-ref"
    marker.parent.mkdir(parents=True)
    marker.write_text("hosted-project", encoding="utf-8")
    executor = FakeExecutor(output_for=_successful_output)

    with pytest.raises(RuntimeGateError, match="hosted Supabase link marker"):
        _gate(repository, executor).run(preflight_only=True)

    assert executor.calls == []


def test_nonlocal_project_id_refuses_every_command(tmp_path: Path) -> None:
    repository = _repository(tmp_path)
    (repository / "supabase/config.toml").write_text(
        'project_id = "hosted-project"\n', encoding="utf-8"
    )
    executor = FakeExecutor(output_for=_successful_output)

    with pytest.raises(RuntimeGateError, match="project_id must be exactly 'simula-local'"):
        _gate(repository, executor).run(preflight_only=True)

    assert executor.calls == []


def test_concurrent_gate_refuses_before_commands(tmp_path: Path) -> None:
    repository = _repository(tmp_path)
    lock_path = repository / "gate.lock"
    executor = FakeExecutor(output_for=_successful_output)

    with GateLock(lock_path):
        with pytest.raises(RuntimeGateError, match="owns the local resource lock"):
            _gate(repository, executor, lock_path=lock_path).run(preflight_only=True)

    assert executor.calls == []


def test_default_gate_lock_is_shared_across_repository_clones(tmp_path: Path) -> None:
    first_repository = _repository(tmp_path / "first")
    second_repository = _repository(tmp_path / "second")
    first = _gate(
        first_repository,
        FakeExecutor(),
        run_id="111111111111",
        lock_path=None,
    )
    second = _gate(
        second_repository,
        FakeExecutor(),
        run_id="222222222222",
        lock_path=None,
    )

    assert first.lock_path == second.lock_path


@pytest.mark.skipif(os.name == "nt", reason="POSIX private-lock semantics")
def test_default_gate_lock_refuses_permissive_or_unowned_directory(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(tempfile, "gettempdir", lambda: str(tmp_path))
    directory = tmp_path / f"simula-m0-runtime-{cast(Any, os).getuid()}"
    directory.mkdir(mode=0o755)
    directory.chmod(0o755)

    with pytest.raises(RuntimeGateError, match="private and owned"):
        _gate(
            _repository(tmp_path / "repository"),
            FakeExecutor(),
            lock_path=None,
        )


@pytest.mark.skipif(os.name == "nt", reason="POSIX no-follow semantics")
def test_gate_lock_refuses_symlink_without_modifying_target(tmp_path: Path) -> None:
    target = tmp_path / "victim"
    target.write_text("unchanged", encoding="utf-8")
    lock_path = tmp_path / "gate.lock"
    lock_path.symlink_to(target)

    with pytest.raises(RuntimeGateError, match="safely open"):
        with GateLock(lock_path):
            pass

    assert target.read_text(encoding="utf-8") == "unchanged"


def test_remote_docker_context_refuses_before_engine_or_mutation(tmp_path: Path) -> None:
    repository = _repository(tmp_path)

    def output(command: tuple[str, ...]) -> str:
        if command == ("docker", "context", "show"):
            return "remote\n"
        if command[:3] == ("docker", "context", "inspect"):
            return '"ssh://builder.example"\n'
        return ""

    executor = FakeExecutor(output_for=output)

    with pytest.raises(RuntimeGateError, match="Docker context is not a local"):
        _gate(repository, executor).run(preflight_only=True)

    assert [call[0] for call in executor.calls] == [
        ("docker", "context", "show"),
        (
            "docker",
            "context",
            "inspect",
            "remote",
            "--format",
            "{{json .Endpoints.docker.Host}}",
        ),
    ]


def test_docker_failure_occurs_before_runtime_mutation(tmp_path: Path) -> None:
    repository = _repository(tmp_path)
    info = _docker("info")
    executor = FakeExecutor(
        output_for=_successful_output,
        failure_for=lambda command: (
            subprocess.CalledProcessError(1, command) if command == info else None
        ),
    )

    with pytest.raises(RuntimeGateError, match="local Docker CLI or engine unavailable"):
        _gate(repository, executor).run()

    assert [call[0] for call in executor.calls][-1] == info


@pytest.mark.parametrize(
    "case",
    ("malformed", "public-host", "internal-network", "extra-port", "extra-network"),
)
def test_compose_runtime_boundary_fails_closed(case: str) -> None:
    configuration = json.loads(json.dumps(VALID_COMPOSE_CONFIGURATION))

    if case == "malformed":
        raw_configuration = "not-json"
    else:
        redis_service = configuration["services"]["redis"]
        if case == "public-host":
            redis_service["ports"][0]["host_ip"] = "0.0.0.0"  # noqa: S104
        elif case == "internal-network":
            configuration["networks"]["simula-private"]["internal"] = True
        elif case == "extra-port":
            redis_service["ports"].append(
                {
                    "host_ip": "127.0.0.1",
                    "published": "6380",
                    "protocol": "tcp",
                    "target": 6380,
                }
            )
        elif case == "extra-network":
            redis_service["networks"]["default"] = None
        raw_configuration = json.dumps(configuration)

    with pytest.raises(RuntimeGateError):
        validate_compose_configuration(raw_configuration)


def test_compose_runtime_boundary_accepts_loopback_and_private_dns() -> None:
    validate_compose_configuration(json.dumps(VALID_COMPOSE_CONFIGURATION))


def test_unavailable_port_refuses_before_namespace_or_runtime_mutation(tmp_path: Path) -> None:
    repository = _repository(tmp_path)
    executor = FakeExecutor(output_for=_successful_output)

    with pytest.raises(RuntimeGateError, match="6379"):
        _gate(
            repository,
            executor,
            port_probe=lambda _host, port: port != 6379,
        ).run()

    commands = [call[0] for call in executor.calls]
    assert ("pnpm", "exec", "supabase", "--version") in commands
    assert not any("container" in command for command in commands)


def test_preexisting_namespace_refuses_before_runtime_mutation(tmp_path: Path) -> None:
    repository = _repository(tmp_path)

    def output(command: tuple[str, ...]) -> str:
        if "label=com.docker.compose.project=" in " ".join(command):
            return "existing-container\n"
        return _successful_output(command)

    executor = FakeExecutor(output_for=output)

    with pytest.raises(RuntimeGateError, match="pre-existing resource"):
        _gate(repository, executor).run()

    assert "up" not in executor.calls[-1][0]


def test_preflight_only_uses_exact_read_only_commands(tmp_path: Path) -> None:
    repository = _repository(tmp_path)
    executor = FakeExecutor(output_for=_successful_output)
    gate = _gate(repository, executor)

    gate.run(preflight_only=True)

    assert executor.calls == _preflight_calls(gate)
    assert gate.supabase_workdir is None


def test_success_uses_isolated_resources_and_exact_cleanup(tmp_path: Path) -> None:
    repository = _repository(tmp_path)
    observed_projects: list[str] = []

    def inspect_temporary_project(command: tuple[str, ...]) -> None:
        if command[-4:] != SUPABASE_START_ARGS:
            return
        workdir = Path(command[command.index("--workdir") + 1])
        with (workdir / "supabase/config.toml").open("rb") as config_file:
            observed_projects.append(str(tomllib.load(config_file)["project_id"]))

    executor = FakeExecutor(output_for=_successful_output, on_command=inspect_temporary_project)
    probes: list[tuple[str, float]] = []

    def health(url: str, *, timeout_seconds: float) -> int:
        probes.append((url, timeout_seconds))
        return 200

    gate = _gate(repository, executor, health_probe=health)
    gate.run()

    assert executor.calls == _success_calls(gate)
    assert observed_projects == [gate.supabase_project]
    assert probes == [(AUTH_HEALTH_URL, 10.0)]
    assert gate.supabase_workdir is not None
    assert not gate.supabase_workdir.exists()


def test_verification_failure_still_cleans_owned_stacks(tmp_path: Path) -> None:
    repository = _repository(tmp_path)
    executor = FakeExecutor(
        output_for=_successful_output,
        failure_for=lambda command: (
            subprocess.CalledProcessError(1, command) if command == INTEGRATION_TEST else None
        ),
    )
    gate = _gate(repository, executor)

    with pytest.raises(RuntimeGateError, match="Redis/ARQ integration tests failed"):
        gate.run()

    commands = [call[0] for call in executor.calls]
    assert commands[-2] == (
        "pnpm",
        "exec",
        "supabase",
        "--workdir",
        str(gate.supabase_workdir),
        "stop",
        "--project-id",
        gate.supabase_project,
        "--no-backup",
    )
    assert commands[-1] == _compose(gate, "down", "--volumes", "--remove-orphans")


def test_timeout_still_cleans_owned_stacks(tmp_path: Path) -> None:
    repository = _repository(tmp_path)
    executor = FakeExecutor(
        output_for=_successful_output,
        failure_for=lambda command: (
            subprocess.TimeoutExpired(command, INTEGRATION_TIMEOUT)
            if command == INTEGRATION_TEST
            else None
        ),
    )
    gate = _gate(repository, executor)

    with pytest.raises(RuntimeGateError, match="timed out after 240s"):
        gate.run()

    assert executor.calls[-1][0] == _compose(gate, "down", "--volumes", "--remove-orphans")


def test_probe_timeout_force_removes_exact_owned_container(tmp_path: Path) -> None:
    repository = _repository(tmp_path)
    gate: RuntimeGate

    def failure(command: tuple[str, ...]) -> BaseException | None:
        api_probe = gate.probe_containers["api"]
        if command[:5] == _docker("run", "--name") and api_probe in command:
            return subprocess.TimeoutExpired(command, PROBE_TIMEOUT)
        return None

    executor = FakeExecutor(output_for=_successful_output, failure_for=failure)
    gate = _gate(repository, executor)

    with pytest.raises(RuntimeGateError, match="probe API image import timed out after 60s"):
        gate.run()

    commands = [call[0] for call in executor.calls]
    api_probe = gate.probe_containers["api"]
    lookup = _docker(
        "container",
        "ls",
        "--all",
        "--filter",
        f"name=^/{api_probe}$",
        "--quiet",
    )
    removal = _docker("container", "rm", "--force", api_probe)
    assert lookup in commands
    assert removal in commands
    assert commands.index(lookup) < commands.index(removal)
    assert gate.probe_containers["worker"] not in " ".join(" ".join(item) for item in commands)


def test_build_failure_treats_absent_image_as_clean(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    repository = _repository(tmp_path)
    web_image = f"simula-web:m0-{RUN_ID}"
    web_build = _docker(
        "build",
        "--pull",
        "--tag",
        web_image,
        "--file",
        "apps/web/Dockerfile",
        ".",
    )
    executor = FakeExecutor(
        output_for=_successful_output,
        failure_for=lambda command: (
            subprocess.CalledProcessError(1, command) if command == web_build else None
        ),
    )
    gate = _gate(repository, executor)

    with pytest.raises(RuntimeGateError, match=r"build isolated image .* failed"):
        gate.run()

    commands = [call[0] for call in executor.calls]
    assert _docker("image", "ls", "--quiet", web_image) in commands
    assert _docker("image", "rm", web_image) not in commands
    assert "cleanup failed" not in capsys.readouterr().err


def test_executor_timeout_terminates_descendant_process(tmp_path: Path) -> None:
    child_pid_file = tmp_path / "child.pid"
    parent_code = (
        "import pathlib, subprocess, sys, time; "
        "child = subprocess.Popen([sys.executable, '-c', "
        "'import time; time.sleep(120)']); "
        "pathlib.Path(sys.argv[1]).write_text(str(child.pid), encoding='utf-8'); "
        "time.sleep(120)"
    )

    with pytest.raises(subprocess.TimeoutExpired):
        execute_command(
            (sys.executable, "-c", parent_code, str(child_pid_file)),
            cwd=tmp_path,
            output=OutputMode.CAPTURE,
            timeout_seconds=3.0,
            docker_context=None,
        )

    assert child_pid_file.exists()
    child_pid = int(child_pid_file.read_text(encoding="utf-8"))
    deadline = time.monotonic() + 5.0
    try:
        while _process_is_running(child_pid) and time.monotonic() < deadline:
            time.sleep(0.05)
        assert not _process_is_running(child_pid)
    finally:
        if _process_is_running(child_pid):
            _force_kill_process(child_pid)


def test_discard_mode_suppresses_stdout_and_stderr(
    tmp_path: Path, capfd: pytest.CaptureFixture[str]
) -> None:
    execute_command(
        (
            sys.executable,
            "-c",
            "import sys; print('stdout-secret'); print('stderr-secret', file=sys.stderr)",
        ),
        cwd=tmp_path,
        output=OutputMode.DISCARD,
        timeout_seconds=5.0,
        docker_context=None,
    )

    captured = capfd.readouterr()
    assert "secret" not in captured.out
    assert "secret" not in captured.err


def test_executor_timeout_kills_stubborn_descendant_after_leader_exits(
    tmp_path: Path,
) -> None:
    child_pid_file = tmp_path / "stubborn-child.pid"
    child_ready_file = tmp_path / "stubborn-child.ready"
    child_code = "\n".join(
        (
            "import os, pathlib, signal, sys, time",
            "if os.name != 'nt': signal.signal(signal.SIGTERM, signal.SIG_IGN)",
            "pathlib.Path(sys.argv[1]).write_text('ready', encoding='utf-8')",
            "time.sleep(120)",
        )
    )
    parent_code = "\n".join(
        (
            "import pathlib, subprocess, sys, time",
            "child = subprocess.Popen([sys.executable, '-c', sys.argv[3], sys.argv[2]])",
            "pathlib.Path(sys.argv[1]).write_text(str(child.pid), encoding='utf-8')",
            "ready = pathlib.Path(sys.argv[2])",
            "deadline = time.monotonic() + 5",
            "while not ready.exists() and time.monotonic() < deadline: time.sleep(0.01)",
        )
    )

    with pytest.raises(subprocess.TimeoutExpired):
        execute_command(
            (
                sys.executable,
                "-c",
                parent_code,
                str(child_pid_file),
                str(child_ready_file),
                child_code,
            ),
            cwd=tmp_path,
            output=OutputMode.CAPTURE,
            timeout_seconds=2.0,
            docker_context=None,
        )

    assert child_pid_file.exists()
    child_pid = int(child_pid_file.read_text(encoding="utf-8"))
    deadline = time.monotonic() + 5.0
    try:
        while _process_is_running(child_pid) and time.monotonic() < deadline:
            time.sleep(0.05)
        assert not _process_is_running(child_pid)
    finally:
        if _process_is_running(child_pid):
            _force_kill_process(child_pid)


def test_nonzero_leader_exit_sweeps_stubborn_descendant(tmp_path: Path) -> None:
    child_pid_file = tmp_path / "nonzero-child.pid"
    child_ready_file = tmp_path / "nonzero-child.ready"
    child_code = "\n".join(
        (
            "import os, pathlib, signal, sys, time",
            "if os.name != 'nt': signal.signal(signal.SIGTERM, signal.SIG_IGN)",
            "pathlib.Path(sys.argv[1]).write_text('ready', encoding='utf-8')",
            "time.sleep(120)",
        )
    )
    parent_code = "\n".join(
        (
            "import pathlib, subprocess, sys, time",
            "child = subprocess.Popen([sys.executable, '-c', sys.argv[3], sys.argv[2]])",
            "ready = pathlib.Path(sys.argv[2])",
            "deadline = time.monotonic() + 5",
            "while not ready.exists() and time.monotonic() < deadline: time.sleep(0.01)",
            "pathlib.Path(sys.argv[1]).write_text(str(child.pid), encoding='utf-8')",
            "raise SystemExit(7)",
        )
    )

    with pytest.raises(subprocess.CalledProcessError) as error:
        execute_command(
            (
                sys.executable,
                "-c",
                parent_code,
                str(child_pid_file),
                str(child_ready_file),
                child_code,
            ),
            cwd=tmp_path,
            output=OutputMode.DISCARD,
            timeout_seconds=10.0,
            docker_context=None,
        )
    assert error.value.returncode == 7

    assert child_pid_file.exists()
    child_pid = int(child_pid_file.read_text(encoding="utf-8"))
    deadline = time.monotonic() + 5.0
    try:
        while _process_is_running(child_pid) and time.monotonic() < deadline:
            time.sleep(0.05)
        assert not _process_is_running(child_pid)
    finally:
        if _process_is_running(child_pid):
            _force_kill_process(child_pid)


@pytest.mark.skipif(os.name != "nt", reason="Windows Job Object semantics")
def test_windows_job_kills_target_when_owner_is_force_terminated(tmp_path: Path) -> None:
    target_pid_file = tmp_path / "job-target.pid"
    target_code = (
        "import os, pathlib, sys, time; "
        "pathlib.Path(sys.argv[1]).write_text(str(os.getpid()), encoding='utf-8'); "
        "time.sleep(120)"
    )
    owner_code = (
        "import sys; from pathlib import Path; "
        "from scripts.verify_m0_runtime import OutputMode, execute_command; "
        "execute_command((sys.executable, '-c', sys.argv[2], sys.argv[1]), "
        "cwd=Path.cwd(), output=OutputMode.DISCARD, timeout_seconds=120, "
        "docker_context=None)"
    )
    owner = subprocess.Popen(  # noqa: S603 - fixed interpreter and test-owned arguments.
        (sys.executable, "-c", owner_code, str(target_pid_file), target_code),
        cwd=runtime_module.REPOSITORY_ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    target_pid: int | None = None
    try:
        deadline = time.monotonic() + 10.0
        while not target_pid_file.exists() and owner.poll() is None:
            if time.monotonic() >= deadline:
                break
            time.sleep(0.05)
        assert target_pid_file.exists()
        target_pid = int(target_pid_file.read_text(encoding="utf-8"))
        assert _process_is_running(target_pid)

        os.kill(owner.pid, signal.SIGTERM)
        owner.wait(timeout=5.0)

        deadline = time.monotonic() + 5.0
        while _process_is_running(target_pid) and time.monotonic() < deadline:
            time.sleep(0.05)
        assert not _process_is_running(target_pid)
    finally:
        if owner.poll() is None:
            owner.kill()
            owner.wait(timeout=5.0)
        if target_pid is not None and _process_is_running(target_pid):
            _force_kill_process(target_pid)


def test_primary_failure_survives_cleanup_failure(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    repository = _repository(tmp_path)

    def failure(command: tuple[str, ...]) -> BaseException | None:
        if command == INTEGRATION_TEST or "stop" in command:
            return subprocess.CalledProcessError(1, command)
        return None

    executor = FakeExecutor(output_for=_successful_output, failure_for=failure)
    gate = _gate(repository, executor)

    with pytest.raises(RuntimeGateError, match="Redis/ARQ integration tests failed"):
        gate.run()

    assert f"cleanup failed: Supabase project {gate.supabase_project}" in capsys.readouterr().err
    assert executor.calls[-1][0] == _compose(gate, "down", "--volumes", "--remove-orphans")


def test_keyboard_interrupt_path_still_cleans_owned_stacks(tmp_path: Path) -> None:
    repository = _repository(tmp_path)

    def terminate(command: tuple[str, ...]) -> None:
        if command == INTEGRATION_TEST:
            runtime_module._raise_keyboard_interrupt(signal.SIGINT, None)

    executor = FakeExecutor(output_for=_successful_output, on_command=terminate)
    gate = _gate(repository, executor)

    with pytest.raises(KeyboardInterrupt):
        gate.run()

    assert executor.calls[-1][0] == _compose(gate, "down", "--volumes", "--remove-orphans")


def test_health_probe_ignores_proxy_and_does_not_follow_redirect(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    interactions: list[tuple[object, ...]] = []

    class RedirectResponse:
        status = 302

    class FakeConnection:
        def __init__(self, host: str, port: int, *, timeout: float) -> None:
            interactions.append(("connect", host, port, timeout))

        def request(self, method: str, path: str, *, headers: dict[str, str]) -> None:
            interactions.append(("request", method, path, headers))

        def getresponse(self) -> RedirectResponse:
            interactions.append(("response",))
            return RedirectResponse()

        def close(self) -> None:
            interactions.append(("close",))

    monkeypatch.setenv("HTTPS_PROXY", "http://proxy.example:8080")
    monkeypatch.setattr(runtime_module, "HTTPConnection", FakeConnection)

    assert probe_health(AUTH_HEALTH_URL, timeout_seconds=7.0) == 302
    assert interactions == [
        ("connect", "127.0.0.1", 54321, 7.0),
        ("request", "GET", "/auth/v1/health", {"Host": "127.0.0.1:54321"}),
        ("response",),
        ("close",),
    ]

    with pytest.raises(ValueError, match="fixed loopback"):
        probe_health("https://remote.example/health", timeout_seconds=7.0)
