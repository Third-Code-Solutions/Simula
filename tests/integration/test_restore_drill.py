from __future__ import annotations

import os
import re
from time import perf_counter
from uuid import uuid4

import pytest

from tests.integration.test_database_boundary import (
    SUPABASE_DB_CONTAINER,
    _run_captured,
)

_APP_COUNT_QUERY = """
select pg_catalog.concat_ws(
  '|',
  (select pg_catalog.count(*) from api.audience_versions),
  (select pg_catalog.count(*) from api.audiences),
  (select pg_catalog.count(*) from api.organization_memberships),
  (select pg_catalog.count(*) from api.organizations),
  (select pg_catalog.count(*) from api.projects),
  (select pg_catalog.count(*) from api.simulation_results),
  (select pg_catalog.count(*) from api.simulation_runs),
  (select pg_catalog.count(*) from api.stimuli),
  (select pg_catalog.count(*) from api.stimulus_versions),
  (select pg_catalog.count(*) from private.audit_events),
  (select pg_catalog.count(*) from private.idempotency_keys),
  (select pg_catalog.count(*) from private.run_attempts),
  (select pg_catalog.count(*) from private.run_events),
  (select pg_catalog.count(*) from private.run_outbox),
  (select pg_catalog.count(*) from private.runtime_controls)
);
"""


def _database_password() -> str:
    inspected = _run_captured(
        [
            "docker",
            "inspect",
            "--format",
            "{{range .Config.Env}}{{println .}}{{end}}",
            SUPABASE_DB_CONTAINER,
        ]
    )
    if inspected.returncode != 0:
        pytest.fail("local Supabase database container is unavailable")
    password_line = next(
        (line for line in inspected.stdout.splitlines() if line.startswith("POSTGRES_PASSWORD=")),
        None,
    )
    if password_line is None:
        pytest.fail("local Supabase bootstrap password is unavailable")
    return password_line.removeprefix("POSTGRES_PASSWORD=")


def _database_command(arguments: list[str], *, password: str, check_message: str) -> str:
    result = _run_captured(
        ["docker", "exec", "-e", "PGPASSWORD", SUPABASE_DB_CONTAINER, *arguments],
        environment={**os.environ, "PGPASSWORD": password},
    )
    if result.returncode != 0:
        pytest.fail(check_message)
    return result.stdout.strip()


def _psql(database: str, query: str, *, password: str) -> str:
    return _database_command(
        [
            "psql",
            "-h",
            "127.0.0.1",
            "-U",
            "supabase_admin",
            "-d",
            database,
            "-X",
            "-t",
            "-A",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            query,
        ],
        password=password,
        check_message=f"could not inspect isolated restore database {database}",
    )


@pytest.mark.integration
def test_phase2_full_database_backup_restores_into_isolated_database() -> None:
    """OPS-RESTORE-001: prove a checksumed full restore without touching source."""

    password = _database_password()
    suffix = uuid4().hex
    target_database = f"simula_restore_{suffix}"
    backup_path = f"/var/lib/postgresql/data/simula-phase2-restore-{suffix}.dump"
    assert re.fullmatch(r"simula_restore_[0-9a-f]{32}", target_database)
    assert target_database != "postgres"
    started_at = perf_counter()
    target_created = False

    try:
        source_counts = _psql("postgres", _APP_COUNT_QUERY, password=password)
        _database_command(
            [
                "pg_dump",
                "-h",
                "127.0.0.1",
                "-U",
                "supabase_admin",
                "-d",
                "postgres",
                "-Fc",
                "--no-owner",
                "--no-privileges",
                "-f",
                backup_path,
            ],
            password=password,
            check_message="could not create isolated restore artifact",
        )
        checksum_output = _database_command(
            ["sha256sum", backup_path],
            password=password,
            check_message="could not checksum isolated restore artifact",
        )
        checksum = checksum_output.split(maxsplit=1)[0]
        assert re.fullmatch(r"[0-9a-f]{64}", checksum)

        _database_command(
            [
                "createdb",
                "-h",
                "127.0.0.1",
                "-U",
                "supabase_admin",
                "-T",
                "template0",
                target_database,
            ],
            password=password,
            check_message="could not create isolated restore target",
        )
        target_created = True
        _database_command(
            [
                "pg_restore",
                "-h",
                "127.0.0.1",
                "-U",
                "supabase_admin",
                "-d",
                target_database,
                "--exit-on-error",
                "--no-owner",
                "--no-privileges",
                backup_path,
            ],
            password=password,
            check_message="full database restore failed",
        )

        assert _psql(target_database, _APP_COUNT_QUERY, password=password) == source_counts
        assert (
            _psql(
                target_database,
                "select pg_catalog.max(version) from supabase_migrations.schema_migrations;",
                password=password,
            )
            == "20260719040000"
        )
        assert (
            _psql(
                target_database,
                "select enabled::text from private.runtime_controls "
                "where control_name = 'run_creation';",
                password=password,
            )
            == "true"
        )
        assert perf_counter() - started_at < 15 * 60
    finally:
        if target_created:
            _database_command(
                [
                    "dropdb",
                    "-h",
                    "127.0.0.1",
                    "-U",
                    "supabase_admin",
                    "--if-exists",
                    target_database,
                ],
                password=password,
                check_message="could not remove isolated restore target",
            )
        removed = _run_captured(
            ["docker", "exec", SUPABASE_DB_CONTAINER, "rm", "-f", "--", backup_path]
        )
        if removed.returncode != 0:
            pytest.fail("could not remove isolated restore artifact")
