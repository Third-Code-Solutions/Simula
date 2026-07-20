from __future__ import annotations

from secrets import token_urlsafe
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql

from scripts.run_control import execute_run_control

_ADMIN_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"


@pytest.mark.integration
def test_operator_cli_controls_only_the_audited_run_admission_latch() -> None:
    password = token_urlsafe(32)
    database_url = (
        f"postgresql://simula_operator:{password}@127.0.0.1:54322/postgres?sslmode=disable"
    )
    setup_id = uuid4()
    disable_id = uuid4()
    enable_id = uuid4()

    with psycopg.connect(_ADMIN_URL, autocommit=True) as administrator:
        administrator.execute(
            sql.SQL("alter role simula_operator password {}").format(sql.Literal(password))
        )
        administrator.execute(
            "select private.set_run_creation_control(true, %s, %s)",
            ("operator_recovery_verified", setup_id),
        )

    try:
        status = execute_run_control(database_url, command="status", correlation_id=None)
        assert status["enabled"] is True
        assert status["changed"] is None

        disabled = execute_run_control(
            database_url,
            command="disable",
            correlation_id=disable_id,
        )
        assert disabled["enabled"] is False
        assert disabled["reason"] == "operator_manual"
        assert disabled["changed"] is True

        replay = execute_run_control(
            database_url,
            command="disable",
            correlation_id=disable_id,
        )
        assert replay["changed"] is False

        enabled = execute_run_control(
            database_url,
            command="enable",
            correlation_id=enable_id,
        )
        assert enabled["enabled"] is True
        assert enabled["reason"] is None
        assert enabled["changed"] is True

        with psycopg.connect(_ADMIN_URL) as administrator:
            audit = administrator.execute(
                """
                select action, correlation_id::text, metadata ->> 'reason'
                from private.audit_events
                where correlation_id in (%s, %s)
                order by action
                """,
                (disable_id, enable_id),
            ).fetchall()
        assert audit == [
            ("operator.run_creation_disabled", str(disable_id), "operator_manual"),
            ("operator.run_creation_enabled", str(enable_id), "operator_recovery_verified"),
        ]
    finally:
        with psycopg.connect(_ADMIN_URL, autocommit=True) as administrator:
            administrator.execute(
                "select private.set_run_creation_control(true, %s, %s)",
                ("operator_recovery_verified", setup_id),
            )
            administrator.execute("alter role simula_operator password null")
