"""Assert exact release-input tool versions."""

from __future__ import annotations

import json
import platform
import shutil
import subprocess
import sys

EXPECTED = {
    "node": "v24.18.0",
    "pnpm": "11.13.1",
    "supabase": "2.109.1",
    "uv": "0.11.19",
}
EXPECTED_PNPM_CONFIG = {
    "autoInstallPeers": False,
    "engineStrict": True,
    "nodeVersion": "24.18.0",
    "pmOnFail": "error",
    "resolutionMode": "highest",
    "savePrefix": "",
    "strictPeerDependencies": True,
}


def output(*command: str) -> str:
    executable = shutil.which(command[0])
    if executable is None:
        raise SystemExit(f"toolchain executable not found: {command[0]}")
    return subprocess.run(  # noqa: S603 - executable is an expected toolchain command.
        [executable, *command[1:]], check=True, capture_output=True, text=True
    ).stdout.strip()


def main() -> None:
    observed = {
        "node": output("node", "--version"),
        "pnpm": output("pnpm", "--version"),
        "supabase": output("pnpm", "exec", "supabase", "--version"),
        "uv": output("uv", "--version").split()[1],
    }
    failures = [
        f"{name}: expected {EXPECTED[name]}, got {value}"
        for name, value in observed.items()
        if value != EXPECTED[name]
    ]
    python = platform.python_version()
    if python != "3.14.6":
        failures.append(f"python: expected 3.14.6, got {python}")
    pnpm_config = json.loads(output("pnpm", "config", "list", "--location", "project", "--json"))
    for name, expected in EXPECTED_PNPM_CONFIG.items():
        observed_value = pnpm_config.get(name)
        if observed_value != expected:
            failures.append(f"pnpm {name}: expected {expected!r}, got {observed_value!r}")
    if failures:
        raise SystemExit("toolchain drift:\n" + "\n".join(failures))
    print(f"toolchain exact: {observed}; python={python}; executable={sys.executable}")


if __name__ == "__main__":
    main()
