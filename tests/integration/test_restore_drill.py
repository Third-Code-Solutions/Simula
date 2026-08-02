from __future__ import annotations

import os
import re
from pathlib import Path
from time import perf_counter
from uuid import uuid4

import pytest

from tests.integration.test_database_boundary import (
    SUPABASE_DB_CONTAINER,
    _run_captured,
)

_MIGRATIONS_DIRECTORY = Path(__file__).parents[2] / "supabase" / "migrations"
_APPLICATION_TABLES_QUERY = """
select schemaname || '.' || tablename
from pg_catalog.pg_tables
where schemaname in ('api', 'private')
order by schemaname, tablename;
"""


def _repository_migration_head() -> str:
    versions = {
        migration.name.split("_", maxsplit=1)[0]
        for migration in _MIGRATIONS_DIRECTORY.glob("*.sql")
        if re.fullmatch(r"[0-9]{14}_.+\.sql", migration.name)
    }
    if not versions:
        raise RuntimeError("repository has no timestamped Supabase migrations")
    return max(versions)


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


def _application_counts(database: str, *, password: str) -> dict[str, int]:
    tables = tuple(
        value
        for value in _psql(
            database,
            _APPLICATION_TABLES_QUERY,
            password=password,
        ).splitlines()
        if value
    )
    if not tables or any(
        re.fullmatch(r"(?:api|private)\.[a-z][a-z0-9_]*", table) is None for table in tables
    ):
        pytest.fail("application table inventory is invalid")
    return {
        table: int(
            _psql(
                database,
                # Identifier comes only from pg_catalog and the strict regex above.
                f"select pg_catalog.count(*) from {table};",  # noqa: S608
                password=password,
            )
        )
        for table in tables
    }


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
        source_counts = _application_counts("postgres", password=password)
        source_run_creation_enabled = _psql(
            "postgres",
            "select enabled::text from private.runtime_controls "
            "where control_name = 'run_creation';",
            password=password,
        )
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

        assert _application_counts(target_database, password=password) == source_counts
        assert (
            _psql(
                target_database,
                "select pg_catalog.max(version) from supabase_migrations.schema_migrations;",
                password=password,
            )
            == _repository_migration_head()
        )
        assert (
            _psql(
                target_database,
                "select enabled::text from private.runtime_controls "
                "where control_name = 'run_creation';",
                password=password,
            )
            == source_run_creation_enabled
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
