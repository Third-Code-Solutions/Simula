"""Run the disposable Phase 2 M0 runtime gate without touching hosted services."""

from __future__ import annotations

import argparse
import importlib
import json
import os
import re
import secrets
import shutil
import signal
import socket
import stat
import subprocess
import sys
import tempfile
import time
import tomllib
from collections.abc import Callable, Mapping, Sequence
from enum import Enum
from http.client import HTTPConnection, HTTPException
from pathlib import Path
from types import FrameType
from typing import Any, BinaryIO, Protocol, Self, cast
from urllib.parse import urlsplit

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
LOCAL_PROJECT_ID = "simula-local"
AUTH_HEALTH_URL = "http://127.0.0.1:54321/auth/v1/health"
EXPECTED_SUPABASE_VERSION = "2.109.1"
REQUIRED_LOCAL_PORTS = (6379, 54320, 54321, 54322, 54324)

HOSTED_LINK_MARKERS = (
    Path("supabase/.temp/project-ref"),
    Path(".supabase/project-ref"),
)
REQUIRED_PATHS = (
    Path("compose.yaml"),
    Path("supabase/config.toml"),
    Path("supabase/seed.sql"),
    Path("apps/web/Dockerfile"),
    Path("services/api/Dockerfile"),
    Path("services/worker/Dockerfile"),
)

SUPABASE_START_ARGS = ("start", "--yes", "-x", "studio,imgproxy")
SUPABASE_RESET_ARGS = ("db", "reset", "--local", "--yes")
INTEGRATION_TEST = (
    "uv",
    "run",
    "--frozen",
    "pytest",
    "tests/integration/test_queue_runtime.py",
    "-m",
    "integration",
)

IMAGE_BUILD_INPUTS = (
    ("web", "apps/web/Dockerfile", "node"),
    ("api", "services/api/Dockerfile", "simula"),
    ("worker", "services/worker/Dockerfile", "simula"),
)

REMOVED_ENV_PREFIXES = ("DOCKER_", "COMPOSE_", "SUPABASE_")

PREFLIGHT_TIMEOUT = 20.0
TOOLCHAIN_TIMEOUT = 60.0
SERVICE_START_TIMEOUT = 300.0
DATABASE_RESET_TIMEOUT = 180.0
INTEGRATION_TIMEOUT = 240.0
IMAGE_BUILD_TIMEOUT = 600.0
PROBE_TIMEOUT = 60.0
CLEANUP_TIMEOUT = 180.0
PROCESS_TERMINATION_GRACE = 2.0
WINDOWS_LAUNCHER = (
    "import subprocess, sys; "
    "ready = sys.stdin.buffer.read(1); "
    "raise SystemExit(125 if ready != b'1' else "
    "subprocess.run(sys.argv[1:], check=False).returncode)"
)


class RuntimeGateError(RuntimeError):
    """A safe, user-actionable M0 runtime gate failure."""


class OutputMode(Enum):
    """Subprocess output handling."""

    INHERIT = "inherit"
    CAPTURE = "capture"
    DISCARD = "discard"


class CommandExecutor(Protocol):
    def __call__(
        self,
        command: tuple[str, ...],
        *,
        cwd: Path,
        output: OutputMode = OutputMode.INHERIT,
        timeout_seconds: float,
        docker_context: str | None,
    ) -> subprocess.CompletedProcess[str]: ...


class HealthProbe(Protocol):
    def __call__(self, url: str, *, timeout_seconds: float) -> int: ...


class PortProbe(Protocol):
    def __call__(self, host: str, port: int) -> bool: ...


class PosixFileLockModule(Protocol):
    LOCK_EX: int
    LOCK_NB: int
    LOCK_UN: int

    def flock(self, file_descriptor: int, operation: int) -> None: ...


class WindowsJob:
    """Contain one Windows command tree before its root process starts."""

    def __init__(self) -> None:
        ctypes_module = cast(Any, importlib.import_module("ctypes"))
        self._ctypes = ctypes_module
        self._kernel32 = ctypes_module.WinDLL("kernel32", use_last_error=True)
        create_job = self._kernel32.CreateJobObjectW
        create_job.argtypes = [ctypes_module.c_void_p, ctypes_module.c_wchar_p]
        create_job.restype = ctypes_module.c_void_p
        handle = create_job(None, None)
        if not handle:
            raise RuntimeGateError("could not create a Windows command-containment job")
        self._handle: int | None = int(handle)
        try:
            self._configure_kill_on_close()
        except BaseException:
            self._close_handle()
            raise

    def _configure_kill_on_close(self) -> None:
        ctypes_module = self._ctypes
        basic_limit_type = type(
            "JobBasicLimitInformation",
            (ctypes_module.Structure,),
            {
                "_fields_": (
                    ("PerProcessUserTimeLimit", ctypes_module.c_int64),
                    ("PerJobUserTimeLimit", ctypes_module.c_int64),
                    ("LimitFlags", ctypes_module.c_uint32),
                    ("MinimumWorkingSetSize", ctypes_module.c_size_t),
                    ("MaximumWorkingSetSize", ctypes_module.c_size_t),
                    ("ActiveProcessLimit", ctypes_module.c_uint32),
                    ("Affinity", ctypes_module.c_size_t),
                    ("PriorityClass", ctypes_module.c_uint32),
                    ("SchedulingClass", ctypes_module.c_uint32),
                )
            },
        )
        io_counters_type = type(
            "JobIoCounters",
            (ctypes_module.Structure,),
            {
                "_fields_": tuple(
                    (name, ctypes_module.c_uint64)
                    for name in (
                        "ReadOperationCount",
                        "WriteOperationCount",
                        "OtherOperationCount",
                        "ReadTransferCount",
                        "WriteTransferCount",
                        "OtherTransferCount",
                    )
                )
            },
        )
        extended_limit_type = type(
            "JobExtendedLimitInformation",
            (ctypes_module.Structure,),
            {
                "_fields_": (
                    ("BasicLimitInformation", basic_limit_type),
                    ("IoInfo", io_counters_type),
                    ("ProcessMemoryLimit", ctypes_module.c_size_t),
                    ("JobMemoryLimit", ctypes_module.c_size_t),
                    ("PeakProcessMemoryUsed", ctypes_module.c_size_t),
                    ("PeakJobMemoryUsed", ctypes_module.c_size_t),
                )
            },
        )
        information = extended_limit_type()
        information.BasicLimitInformation.LimitFlags = 0x00002000

        set_information = self._kernel32.SetInformationJobObject
        set_information.argtypes = [
            ctypes_module.c_void_p,
            ctypes_module.c_int,
            ctypes_module.c_void_p,
            ctypes_module.c_uint32,
        ]
        set_information.restype = ctypes_module.c_int
        if not set_information(
            self._handle,
            9,  # JobObjectExtendedLimitInformation
            ctypes_module.byref(information),
            ctypes_module.sizeof(information),
        ):
            raise RuntimeGateError("could not configure Windows job kill-on-close")

    def assign(self, process: subprocess.Popen[str]) -> None:
        if self._handle is None:
            raise RuntimeGateError("Windows command-containment job is already closed")
        process_handle = int(cast(Any, process)._handle)

        assign = self._kernel32.AssignProcessToJobObject
        assign.argtypes = [self._ctypes.c_void_p, self._ctypes.c_void_p]
        assign.restype = self._ctypes.c_int
        if not assign(self._handle, process_handle):
            raise RuntimeGateError("could not assign command to its Windows containment job")

    def terminate(self) -> None:
        if self._handle is None:
            return
        terminate = self._kernel32.TerminateJobObject
        terminate.argtypes = [self._ctypes.c_void_p, self._ctypes.c_uint32]
        terminate.restype = self._ctypes.c_int
        if not terminate(self._handle, 1):
            raise RuntimeGateError("could not terminate the Windows command-containment job")

    def _close_handle(self) -> bool:
        if self._handle is None:
            return True
        close_handle = self._kernel32.CloseHandle
        close_handle.argtypes = [self._ctypes.c_void_p]
        close_handle.restype = self._ctypes.c_int
        closed = bool(close_handle(self._handle))
        self._handle = None
        return closed

    def close(self) -> None:
        if not self._close_handle():
            raise RuntimeGateError("could not close the Windows command-containment job")


def sanitized_environment(
    source: Mapping[str, str] | None = None, *, docker_context: str | None = None
) -> dict[str, str]:
    """Remove routing overrides and hosted Supabase credentials from child processes."""

    environment = dict(os.environ if source is None else source)
    for name in tuple(environment):
        if name.startswith(REMOVED_ENV_PREFIXES):
            environment.pop(name)
    environment["SIMULA_REDIS_PORT"] = "6379"
    environment["SUPABASE_TELEMETRY_DISABLED"] = "1"
    if docker_context is not None:
        environment["DOCKER_CONTEXT"] = docker_context
    return environment


def execute_command(
    command: tuple[str, ...],
    *,
    cwd: Path,
    output: OutputMode = OutputMode.INHERIT,
    timeout_seconds: float,
    docker_context: str | None,
) -> subprocess.CompletedProcess[str]:
    """Execute one argument vector in a killable process group without a shell."""

    executable = shutil.which(command[0])
    if executable is None:
        raise RuntimeGateError(f"required executable not found: {command[0]}")

    arguments = [executable, *command[1:]]
    environment = sanitized_environment(docker_context=docker_context)
    stdout: int | None = None
    stderr: int | None = None
    if output is OutputMode.CAPTURE:
        stdout = subprocess.PIPE
        stderr = subprocess.PIPE
    elif output is OutputMode.DISCARD:
        stdout = subprocess.DEVNULL
        stderr = subprocess.DEVNULL

    windows_job: WindowsJob | None = None
    communication_input: str | None = None
    if os.name == "nt":
        windows_job = WindowsJob()
        try:
            process = subprocess.Popen(  # noqa: S603 - fixed argument vector, no shell.
                [sys.executable, "-c", WINDOWS_LAUNCHER, *arguments],
                cwd=cwd,
                env=environment,
                stdin=subprocess.PIPE,
                stdout=stdout,
                stderr=stderr,
                text=True,
                creationflags=0x00000200,  # CREATE_NEW_PROCESS_GROUP
            )
        except BaseException:
            windows_job.close()
            raise
        try:
            windows_job.assign(process)
        except BaseException:
            windows_job.terminate()
            if process.poll() is None:
                process.kill()
            try:
                process.wait(timeout=PROCESS_TERMINATION_GRACE)
            except subprocess.TimeoutExpired:
                pass
            _close_process_streams(process)
            windows_job.close()
            raise
        communication_input = "1"
    else:
        process = subprocess.Popen(  # noqa: S603 - repository-owned argument vectors, no shell.
            arguments,
            cwd=cwd,
            env=environment,
            stdout=stdout,
            stderr=stderr,
            text=True,
            start_new_session=True,
        )

    try:
        captured_stdout, captured_stderr = process.communicate(
            input=communication_input, timeout=timeout_seconds
        )
    except subprocess.TimeoutExpired as error:
        try:
            _terminate_process_tree(process, windows_job=windows_job)
        finally:
            _close_process_streams(process)
            if windows_job is not None:
                windows_job.close()
        raise subprocess.TimeoutExpired(
            command,
            timeout_seconds,
            output=error.output,
            stderr=error.stderr,
        ) from error
    except BaseException:
        try:
            _terminate_process_tree(process, windows_job=windows_job)
        finally:
            _close_process_streams(process)
            if windows_job is not None:
                windows_job.close()
        raise

    if windows_job is not None:
        windows_job.terminate()
        windows_job.close()
    else:
        _terminate_process_tree(process)

    completed = subprocess.CompletedProcess(
        command,
        process.returncode,
        stdout=captured_stdout,
        stderr=captured_stderr,
    )
    completed.check_returncode()
    return completed


def _terminate_process_tree(
    process: subprocess.Popen[str], *, windows_job: WindowsJob | None = None
) -> None:
    """Terminate the spawned process group/tree, escalating when required."""

    if os.name == "nt":
        if windows_job is not None:
            windows_job.terminate()
        else:
            taskkill = shutil.which("taskkill")
            try:
                if taskkill is not None:
                    subprocess.run(  # noqa: S603 - fixed utility and owned child PID.
                        [taskkill, "/PID", str(process.pid), "/T", "/F"],
                        check=False,
                        capture_output=True,
                        timeout=10.0,
                    )
            except OSError, subprocess.SubprocessError:
                pass
        if process.poll() is None:
            process.kill()
    else:
        kill_process_group = cast(
            Callable[[int, int], None],
            getattr(os, "killpg"),  # noqa: B009 - Windows stubs omit POSIX-only symbols.
        )
        try:
            kill_process_group(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        deadline = time.monotonic() + PROCESS_TERMINATION_GRACE
        while _process_group_exists(kill_process_group, process.pid):
            if time.monotonic() >= deadline:
                break
            time.sleep(0.05)
        if _process_group_exists(kill_process_group, process.pid):
            try:
                kill_process_group(
                    process.pid,
                    getattr(signal, "SIGKILL"),  # noqa: B009 - Windows stubs omit it.
                )
            except ProcessLookupError:
                pass
    try:
        process.wait(timeout=PROCESS_TERMINATION_GRACE)
    except subprocess.TimeoutExpired:
        process.kill()
        try:
            process.wait(timeout=PROCESS_TERMINATION_GRACE)
        except subprocess.TimeoutExpired:
            pass


def _process_group_exists(kill_process_group: Callable[[int, int], None], pgid: int) -> bool:
    try:
        kill_process_group(pgid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def _close_process_streams(process: subprocess.Popen[str]) -> None:
    for stream in (process.stdin, process.stdout, process.stderr):
        if stream is not None:
            stream.close()


def probe_health(url: str, *, timeout_seconds: float) -> int:
    """Probe Auth directly over loopback without proxy or redirect handling."""

    if url != AUTH_HEALTH_URL:
        raise ValueError("health probe URL must be the fixed loopback Auth endpoint")
    connection = HTTPConnection("127.0.0.1", 54321, timeout=timeout_seconds)
    try:
        connection.request("GET", "/auth/v1/health", headers={"Host": "127.0.0.1:54321"})
        return int(connection.getresponse().status)
    finally:
        connection.close()


def validate_compose_configuration(raw_configuration: str) -> None:
    """Require the local Redis port and Compose DNS boundary used by the gate."""

    try:
        configuration = json.loads(raw_configuration)
    except (json.JSONDecodeError, TypeError) as error:
        raise RuntimeGateError("Compose configuration did not return valid JSON") from error
    if not isinstance(configuration, dict):
        raise RuntimeGateError("Compose configuration must be a JSON object")

    services = configuration.get("services")
    if not isinstance(services, dict):
        raise RuntimeGateError("Compose configuration is missing services")
    redis_service = services.get("redis")
    if not isinstance(redis_service, dict):
        raise RuntimeGateError("Compose configuration is missing the Redis service")

    service_networks = redis_service.get("networks")
    if not isinstance(service_networks, dict) or set(service_networks) != {"simula-private"}:
        raise RuntimeGateError("Redis must use only the simula-private Compose network")

    networks = configuration.get("networks")
    if not isinstance(networks, dict):
        raise RuntimeGateError("Compose configuration is missing networks")
    private_network = networks.get("simula-private")
    if not isinstance(private_network, dict):
        raise RuntimeGateError("Compose configuration is missing simula-private")
    internal = private_network.get("internal")
    if internal is not None and internal is not False:
        raise RuntimeGateError(
            "simula-private must be non-internal for Docker Desktop host publishing"
        )

    ports = redis_service.get("ports")
    if not isinstance(ports, list) or len(ports) != 1:
        raise RuntimeGateError("Redis must publish exactly one port")
    published_port = ports[0]
    if not isinstance(published_port, dict):
        raise RuntimeGateError("Redis published-port configuration is invalid")
    if (
        published_port.get("host_ip") != "127.0.0.1"
        or published_port.get("target") != 6379
        or published_port.get("published") != "6379"
        or published_port.get("protocol") != "tcp"
    ):
        raise RuntimeGateError(
            "Redis must publish TCP 6379 only on Windows/host loopback 127.0.0.1"
        )


def port_is_available(host: str, port: int) -> bool:
    """Return whether this process can exclusively bind a required loopback port."""

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            if os.name == "nt":
                probe.setsockopt(
                    socket.SOL_SOCKET,
                    cast(Any, socket).SO_EXCLUSIVEADDRUSE,
                    1,
                )
            probe.bind((host, port))
    except OSError:
        return False
    return True


def docker_endpoint_is_local(endpoint: str) -> bool:
    """Accept only local OS sockets or Windows named pipes."""

    parsed = urlsplit(endpoint)
    if parsed.scheme == "unix":
        return parsed.path.startswith("/")
    if parsed.scheme == "npipe":
        return parsed.path.casefold().startswith("//./pipe/")
    return False


def _default_lock_path() -> Path:
    suffix = "windows" if os.name == "nt" else str(cast(Any, os).getuid())
    directory = Path(tempfile.gettempdir()) / f"simula-m0-runtime-{suffix}"
    try:
        directory.mkdir(mode=0o700, exist_ok=True)
        metadata = directory.lstat()
    except OSError as error:
        raise RuntimeGateError("could not create the private runtime-lock directory") from error
    if not stat.S_ISDIR(metadata.st_mode):
        raise RuntimeGateError("runtime-lock path must be a directory")
    if os.name != "nt" and (
        metadata.st_uid != cast(Any, os).getuid() or stat.S_IMODE(metadata.st_mode) & 0o077
    ):
        raise RuntimeGateError("runtime-lock directory must be private and owned by this user")
    return directory / "gate.lock"


def _open_lock_file(path: Path) -> BinaryIO:
    flags = os.O_RDWR | os.O_CREAT
    if os.name != "nt":
        flags |= int(cast(Any, os).O_NOFOLLOW)
    descriptor = os.open(path, flags, 0o600)
    try:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode):
            raise RuntimeGateError("runtime lock must be a regular file")
        if os.name != "nt" and (
            metadata.st_uid != cast(Any, os).getuid() or stat.S_IMODE(metadata.st_mode) & 0o077
        ):
            raise RuntimeGateError("runtime lock must be private and owned by this user")
        return cast(BinaryIO, os.fdopen(descriptor, "r+b"))
    except BaseException:
        os.close(descriptor)
        raise


class GateLock:
    """Cross-platform advisory lock released automatically when the process exits."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._handle: BinaryIO | None = None

    def __enter__(self) -> Self:
        try:
            handle = _open_lock_file(self.path)
        except OSError as error:
            raise RuntimeGateError("could not safely open the runtime lock") from error
        if os.fstat(handle.fileno()).st_size == 0:
            handle.write(b"\0")
            handle.flush()
        handle.seek(0)
        try:
            if os.name == "nt":
                import msvcrt

                windows_locking = cast(Any, msvcrt)
                windows_locking.locking(handle.fileno(), windows_locking.LK_NBLCK, 1)
            else:
                fcntl = cast(PosixFileLockModule, importlib.import_module("fcntl"))
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            handle.close()
            raise RuntimeGateError(
                "another M0 runtime gate owns the local resource lock"
            ) from error
        self._handle = handle
        return self

    def __exit__(
        self,
        _exception_type: type[BaseException] | None,
        _exception: BaseException | None,
        _traceback: object,
    ) -> None:
        handle = self._handle
        if handle is None:
            return
        handle.seek(0)
        try:
            if os.name == "nt":
                import msvcrt

                windows_locking = cast(Any, msvcrt)
                windows_locking.locking(handle.fileno(), windows_locking.LK_UNLCK, 1)
            else:
                fcntl = cast(PosixFileLockModule, importlib.import_module("fcntl"))
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        finally:
            handle.close()
            self._handle = None


class RuntimeGate:
    """Orchestrate one isolated local M0 runtime proof and exact cleanup."""

    def __init__(
        self,
        *,
        repository_root: Path = REPOSITORY_ROOT,
        executor: CommandExecutor = execute_command,
        health_probe: HealthProbe = probe_health,
        port_probe: PortProbe = port_is_available,
        requested_docker_context: str | None = None,
        run_id: str | None = None,
        lock_path: Path | None = None,
    ) -> None:
        self.repository_root = repository_root.resolve()
        self.executor = executor
        self.health_probe = health_probe
        self.port_probe = port_probe
        self.requested_docker_context = requested_docker_context
        self.run_id = run_id or secrets.token_hex(6)
        if re.fullmatch(r"[a-f0-9]{12}", self.run_id) is None:
            raise RuntimeGateError("runtime run ID must be 12 lowercase hexadecimal characters")
        self.lock_path = lock_path or _default_lock_path()
        self.compose_project = f"simula-m0-{self.run_id}"
        self.supabase_project = f"simula-m0-{self.run_id}"
        self.image_users = {
            f"simula-{service}:m0-{self.run_id}": expected_user
            for service, _dockerfile, expected_user in IMAGE_BUILD_INPUTS
        }
        self.probe_containers = {
            service: f"{self.compose_project}-{service}-probe" for service in ("api", "worker")
        }
        self._docker_context: str | None = None
        self._runtime_directory: tempfile.TemporaryDirectory[str] | None = None
        self.supabase_workdir: Path | None = None
        self._redis_start_attempted = False
        self._supabase_start_attempted = False
        self._attempted_images: list[str] = []
        self._attempted_probe_containers: list[str] = []

    def _step(
        self,
        label: str,
        command: tuple[str, ...],
        *,
        output: OutputMode = OutputMode.INHERIT,
        timeout_seconds: float,
    ) -> subprocess.CompletedProcess[str]:
        print(f"[m0] {label}")
        try:
            return self.executor(
                command,
                cwd=self.repository_root,
                output=output,
                timeout_seconds=timeout_seconds,
                docker_context=self._docker_context,
            )
        except RuntimeGateError:
            raise
        except subprocess.TimeoutExpired as error:
            raise RuntimeGateError(f"{label} timed out after {timeout_seconds:g}s") from error
        except (OSError, subprocess.SubprocessError) as error:
            raise RuntimeGateError(f"{label} failed") from error

    def _assert_local_only(self) -> None:
        linked = [
            str(path) for path in HOSTED_LINK_MARKERS if (self.repository_root / path).is_file()
        ]
        if linked:
            raise RuntimeGateError(
                "hosted Supabase link marker detected; refusing all runtime mutations: "
                + ", ".join(linked)
            )

        missing = [
            str(path) for path in REQUIRED_PATHS if not (self.repository_root / path).is_file()
        ]
        if missing:
            raise RuntimeGateError("required repository path missing: " + ", ".join(missing))

        try:
            with (self.repository_root / "supabase/config.toml").open("rb") as config_file:
                config = tomllib.load(config_file)
        except (OSError, tomllib.TOMLDecodeError) as error:
            raise RuntimeGateError("cannot parse local Supabase configuration") from error
        if config.get("project_id") != LOCAL_PROJECT_ID:
            raise RuntimeGateError(
                f"Supabase project_id must be exactly {LOCAL_PROJECT_ID!r} for this local gate"
            )

    def _select_local_docker_context(self) -> None:
        context = self.requested_docker_context
        if context is None:
            context = self._step(
                "select Docker context",
                ("docker", "context", "show"),
                output=OutputMode.CAPTURE,
                timeout_seconds=PREFLIGHT_TIMEOUT,
            ).stdout.strip()
        if not context:
            raise RuntimeGateError("Docker context name is empty")

        endpoint_json = self._step(
            "inspect Docker context endpoint",
            (
                "docker",
                "context",
                "inspect",
                context,
                "--format",
                "{{json .Endpoints.docker.Host}}",
            ),
            output=OutputMode.CAPTURE,
            timeout_seconds=PREFLIGHT_TIMEOUT,
        ).stdout.strip()
        try:
            endpoint = json.loads(endpoint_json)
        except json.JSONDecodeError as error:
            raise RuntimeGateError("Docker context endpoint is not valid JSON") from error
        if not isinstance(endpoint, str) or not docker_endpoint_is_local(endpoint):
            raise RuntimeGateError(
                "Docker context is not a local Unix socket or Windows named pipe"
            )
        self._docker_context = context

    def _docker(self, *arguments: str) -> tuple[str, ...]:
        if self._docker_context is None:
            raise RuntimeGateError("Docker context was not selected")
        return ("docker", "--context", self._docker_context, *arguments)

    def _compose(self, *arguments: str) -> tuple[str, ...]:
        return self._docker(
            "compose",
            "--file",
            str(self.repository_root / "compose.yaml"),
            "--project-directory",
            str(self.repository_root),
            "--project-name",
            self.compose_project,
            *arguments,
        )

    def _assert_ports_available(self) -> None:
        unavailable = [
            str(port) for port in REQUIRED_LOCAL_PORTS if not self.port_probe("127.0.0.1", port)
        ]
        if unavailable:
            raise RuntimeGateError(
                "required loopback ports are already in use or unavailable: "
                + ", ".join(unavailable)
            )

    def _assert_namespaces_unused(self) -> None:
        checks = (
            (
                "Compose project",
                self._docker(
                    "container",
                    "ls",
                    "--all",
                    "--filter",
                    f"label=com.docker.compose.project={self.compose_project}",
                    "--quiet",
                ),
            ),
            (
                "Supabase project",
                self._docker(
                    "container",
                    "ls",
                    "--all",
                    "--filter",
                    f"name={self.supabase_project}",
                    "--quiet",
                ),
            ),
        )
        for label, command in checks:
            if self._step(
                f"verify unused {label} namespace",
                command,
                output=OutputMode.CAPTURE,
                timeout_seconds=PREFLIGHT_TIMEOUT,
            ).stdout.strip():
                raise RuntimeGateError(f"pre-existing resource occupies the {label} namespace")

        for image in self.image_users:
            if self._step(
                f"verify unused image tag {image}",
                self._docker("image", "ls", "--quiet", image),
                output=OutputMode.CAPTURE,
                timeout_seconds=PREFLIGHT_TIMEOUT,
            ).stdout.strip():
                raise RuntimeGateError(f"pre-existing image occupies the run-owned tag: {image}")

    def preflight(self) -> None:
        """Run read-only checks before any disposable runtime resource is started."""

        self._assert_local_only()
        self._select_local_docker_context()
        try:
            self._step(
                "check local Docker engine",
                self._docker("info"),
                output=OutputMode.CAPTURE,
                timeout_seconds=PREFLIGHT_TIMEOUT,
            )
        except RuntimeGateError as error:
            raise RuntimeGateError(
                "local Docker CLI or engine unavailable. On Windows, verify firmware "
                "virtualization, Virtual Machine Platform/WSL2, then reboot before retrying."
            ) from error
        compose_configuration = self._step(
            "validate pinned Compose runtime boundary",
            self._compose("config", "--format", "json"),
            output=OutputMode.CAPTURE,
            timeout_seconds=PREFLIGHT_TIMEOUT,
        ).stdout
        validate_compose_configuration(compose_configuration)
        self._step(
            "check exact repository toolchain",
            ("pnpm", "toolchain:check"),
            timeout_seconds=TOOLCHAIN_TIMEOUT,
        )
        version = self._step(
            "check exact Supabase CLI",
            ("pnpm", "exec", "supabase", "--version"),
            output=OutputMode.CAPTURE,
            timeout_seconds=PREFLIGHT_TIMEOUT,
        ).stdout.strip()
        if version != EXPECTED_SUPABASE_VERSION:
            raise RuntimeGateError(
                f"Supabase CLI drift: expected {EXPECTED_SUPABASE_VERSION}, "
                f"got {version or '<empty>'}"
            )
        self._assert_ports_available()
        self._assert_namespaces_unused()

    def _prepare_supabase_workdir(self) -> None:
        temporary = tempfile.TemporaryDirectory(prefix=f"simula-m0-{self.run_id}-")
        self._runtime_directory = temporary
        workdir = Path(temporary.name)
        try:
            shutil.copytree(
                self.repository_root / "supabase",
                workdir / "supabase",
                ignore=shutil.ignore_patterns(".temp"),
            )
            config_path = workdir / "supabase/config.toml"
            config_text = config_path.read_text(encoding="utf-8")
            updated, replacements = re.subn(
                rf'(?m)^project_id\s*=\s*"{re.escape(LOCAL_PROJECT_ID)}"\s*$',
                f'project_id = "{self.supabase_project}"',
                config_text,
            )
            if replacements != 1:
                raise RuntimeGateError("could not isolate the temporary Supabase project ID")
            config_path.write_text(updated, encoding="utf-8")
        except (OSError, shutil.Error) as error:
            raise RuntimeGateError("could not prepare isolated Supabase workdir") from error
        self.supabase_workdir = workdir

    def _supabase(self, *arguments: str) -> tuple[str, ...]:
        if self.supabase_workdir is None:
            raise RuntimeGateError("isolated Supabase workdir was not prepared")
        return (
            "pnpm",
            "exec",
            "supabase",
            "--workdir",
            str(self.supabase_workdir),
            *arguments,
        )

    def _verify_redis(self) -> None:
        self._redis_start_attempted = True
        self._step(
            "start isolated local Redis",
            self._compose("up", "--detach", "--wait", "redis"),
            timeout_seconds=SERVICE_START_TIMEOUT,
        )
        uid = self._step(
            "inspect Redis runtime UID",
            self._compose("exec", "-T", "redis", "id", "-u"),
            output=OutputMode.CAPTURE,
            timeout_seconds=PREFLIGHT_TIMEOUT,
        ).stdout.strip()
        if not uid.isdecimal() or int(uid) <= 0:
            raise RuntimeGateError(f"Redis container returned an invalid non-root UID: {uid!r}")

    def _verify_supabase(self) -> None:
        self._supabase_start_attempted = True
        self._step(
            "start isolated local Supabase",
            self._supabase(*SUPABASE_START_ARGS),
            output=OutputMode.DISCARD,
            timeout_seconds=SERVICE_START_TIMEOUT,
        )
        print("[m0] probe local Supabase Auth health")
        try:
            status = self.health_probe(AUTH_HEALTH_URL, timeout_seconds=10.0)
        except (HTTPException, OSError, ValueError) as error:
            raise RuntimeGateError("local Supabase Auth health probe failed") from error
        if status != 200:
            raise RuntimeGateError(f"local Supabase Auth health returned HTTP {status}")
        self._step(
            "reset isolated local Supabase database",
            self._supabase(*SUPABASE_RESET_ARGS),
            timeout_seconds=DATABASE_RESET_TIMEOUT,
        )

    def _verify_images(self) -> None:
        image_by_service = {
            service: f"simula-{service}:m0-{self.run_id}"
            for service, _dockerfile, _expected_user in IMAGE_BUILD_INPUTS
        }
        for service, dockerfile, _expected_user in IMAGE_BUILD_INPUTS:
            image = image_by_service[service]
            self._attempted_images.append(image)
            self._step(
                f"build isolated image {image}",
                self._docker(
                    "build",
                    "--pull",
                    "--tag",
                    image,
                    "--file",
                    dockerfile,
                    ".",
                ),
                timeout_seconds=IMAGE_BUILD_TIMEOUT,
            )

        for image, expected_user in self.image_users.items():
            observed_user = self._step(
                f"inspect {image} runtime user",
                self._docker("image", "inspect", "--format", "{{.Config.User}}", image),
                output=OutputMode.CAPTURE,
                timeout_seconds=PREFLIGHT_TIMEOUT,
            ).stdout.strip()
            if observed_user != expected_user:
                raise RuntimeGateError(
                    f"{image} runtime user drift: expected {expected_user!r}, "
                    f"got {observed_user or '<empty>'!r}"
                )

        api_probe = self.probe_containers["api"]
        self._attempted_probe_containers.append(api_probe)
        self._step(
            "probe API image import",
            self._docker(
                "run",
                "--name",
                api_probe,
                image_by_service["api"],
                "python",
                "-c",
                "import simula_api",
            ),
            timeout_seconds=PROBE_TIMEOUT,
        )
        worker_probe = self.probe_containers["worker"]
        self._attempted_probe_containers.append(worker_probe)
        self._step(
            "probe worker image lifecycle",
            self._docker(
                "run",
                "--name",
                worker_probe,
                image_by_service["worker"],
                "python",
                "-m",
                "simula_worker",
                "--check",
            ),
            timeout_seconds=PROBE_TIMEOUT,
        )

    def _cleanup(self) -> list[str]:
        failures: list[str] = []
        for container in reversed(self._attempted_probe_containers):
            try:
                observed = self._step(
                    f"find isolated probe container {container}",
                    self._docker(
                        "container",
                        "ls",
                        "--all",
                        "--filter",
                        f"name=^/{container}$",
                        "--quiet",
                    ),
                    output=OutputMode.CAPTURE,
                    timeout_seconds=PREFLIGHT_TIMEOUT,
                ).stdout.strip()
                if observed:
                    self._step(
                        f"force-remove isolated probe container {container}",
                        self._docker("container", "rm", "--force", container),
                        timeout_seconds=CLEANUP_TIMEOUT,
                    )
            except RuntimeGateError, KeyboardInterrupt:
                failures.append(f"probe container {container}")
        if self._supabase_start_attempted:
            try:
                self._step(
                    "stop isolated local Supabase",
                    self._supabase(
                        "stop",
                        "--project-id",
                        self.supabase_project,
                        "--no-backup",
                    ),
                    timeout_seconds=CLEANUP_TIMEOUT,
                )
            except RuntimeGateError, KeyboardInterrupt:
                failures.append(f"Supabase project {self.supabase_project}")
        if self._redis_start_attempted:
            try:
                self._step(
                    "remove isolated Compose resources",
                    self._compose("down", "--volumes", "--remove-orphans"),
                    timeout_seconds=CLEANUP_TIMEOUT,
                )
            except RuntimeGateError, KeyboardInterrupt:
                failures.append(f"Compose project {self.compose_project}")
        for image in reversed(self._attempted_images):
            try:
                observed = self._step(
                    f"find isolated image {image}",
                    self._docker("image", "ls", "--quiet", image),
                    output=OutputMode.CAPTURE,
                    timeout_seconds=PREFLIGHT_TIMEOUT,
                ).stdout.strip()
                if observed:
                    self._step(
                        f"remove isolated image {image}",
                        self._docker("image", "rm", image),
                        timeout_seconds=CLEANUP_TIMEOUT,
                    )
            except RuntimeGateError, KeyboardInterrupt:
                failures.append(f"image {image}")
        if self._runtime_directory is not None:
            try:
                self._runtime_directory.cleanup()
            except OSError:
                failures.append("temporary Supabase workdir")
            self._runtime_directory = None
        return failures

    def _run_locked(self, *, preflight_only: bool) -> None:
        self.preflight()
        if preflight_only:
            print("[m0] preflight passed; no runtime resources started")
            return

        primary_error: BaseException | None = None
        try:
            self._prepare_supabase_workdir()
            self._verify_redis()
            self._verify_supabase()
            self._step(
                "run Redis/ARQ integration tests",
                INTEGRATION_TEST,
                timeout_seconds=INTEGRATION_TIMEOUT,
            )
            self._verify_images()
        except BaseException as error:
            primary_error = error

        cleanup_failures = self._cleanup()
        if cleanup_failures:
            print("[m0] cleanup failed: " + ", ".join(cleanup_failures), file=sys.stderr)
        if primary_error is not None:
            raise primary_error
        if cleanup_failures:
            raise RuntimeGateError("runtime proof passed, but isolated cleanup failed")
        print("[m0] runtime gate passed; isolated runtime resources removed")

    def run(self, *, preflight_only: bool = False) -> None:
        """Hold the resource lock across preflight, proof, and cleanup."""

        with GateLock(self.lock_path):
            self._run_locked(preflight_only=preflight_only)


def _raise_keyboard_interrupt(_signum: int, _frame: FrameType | None) -> None:
    raise KeyboardInterrupt


def parse_args(arguments: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--preflight-only",
        action="store_true",
        help="run local-only and tool/engine checks without starting runtime resources",
    )
    parser.add_argument(
        "--docker-context",
        help="explicit Docker context; rejected unless its endpoint is local",
    )
    return parser.parse_args(arguments)


def main(arguments: Sequence[str] | None = None) -> int:
    args = parse_args(arguments)
    previous_sigterm = signal.getsignal(signal.SIGTERM)
    signal.signal(signal.SIGTERM, _raise_keyboard_interrupt)
    try:
        RuntimeGate(requested_docker_context=args.docker_context).run(
            preflight_only=args.preflight_only
        )
    except RuntimeGateError as error:
        print(f"M0 runtime gate failed: {error}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("M0 runtime gate interrupted; isolated cleanup was attempted", file=sys.stderr)
        return 130
    finally:
        signal.signal(signal.SIGTERM, previous_sigterm)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
