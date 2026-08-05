"""Least-privilege PostgreSQL boundary with transaction-local verified claims."""

from __future__ import annotations

import hashlib
from collections.abc import AsyncIterator, Mapping, Sequence
from contextlib import asynccontextmanager
from time import perf_counter
from typing import Any, cast
from uuid import UUID

import psycopg
from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool, PoolTimeout
from simula_core.json_codec import canonical_json_dumps

from simula_api.auth import VerifiedIdentity
from simula_api.config import ApiSettings
from simula_api.cursor import CursorPosition
from simula_api.models import (
    AudienceDisclosureResponse,
    OrganizationResponse,
    ProjectDetail,
    ProjectPatch,
    ProjectResponse,
    ProvenanceAudience,
    ProvenanceExecution,
    ProvenanceExecutionLimits,
    ProvenanceProviderReceipt,
    ProvenanceProviderReceiptAvailable,
    ProvenanceProviderReceiptLegacyUnavailable,
    ProvenanceStimulus,
    SimulationProvenanceResponse,
    SimulationResultResponse,
    SimulationRunFailure,
    SimulationRunResponse,
    StimulusResponse,
    StimulusVersionResponse,
)
from simula_api.problems import AppProblem, ProblemError
from simula_api.telemetry import ApiTelemetry

JsonObject = Mapping[str, Any]
DatabaseRow = dict[str, Any]


def canonical_request_sha256(payload: JsonObject) -> str:
    return hashlib.sha256(canonical_json_dumps(dict(payload))).hexdigest()


def content_sha256(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _not_found() -> AppProblem:
    return AppProblem(
        status=404,
        code="not_found",
        title="Resource not found",
        detail="The requested resource was not found.",
    )


def _dependency_unavailable() -> AppProblem:
    return AppProblem(
        status=503,
        code="dependency_unavailable",
        title="Database unavailable",
        detail="The request could not reach its durable store. Retry shortly.",
        retry_after=5,
    )


def _database_problem(error: psycopg.Error) -> AppProblem:
    message = error.diag.message_primary
    if isinstance(
        error,
        (
            psycopg.errors.DeadlockDetected,
            psycopg.errors.LockNotAvailable,
            psycopg.errors.QueryCanceled,
            psycopg.errors.SerializationFailure,
        ),
    ):
        return _dependency_unavailable()
    if message in {"unauthorized"}:
        return AppProblem(
            status=401,
            code="unauthenticated",
            title="Authentication required",
            detail="Sign in again and retry the request.",
        )
    if message == "forbidden":
        return AppProblem(
            status=403,
            code="forbidden",
            title="Action forbidden",
            detail="Your current organization role cannot perform this action.",
        )
    if message == "not_found":
        return _not_found()
    if message == "idempotency_key_reused":
        return AppProblem(
            status=409,
            code="idempotency_key_reused",
            title="Idempotency key reused",
            detail="Use a new idempotency key for a different request.",
        )
    if message == "version_conflict":
        return AppProblem(
            status=409,
            code="version_conflict",
            title="Project version conflict",
            detail="Reload the project and apply the change again.",
        )
    if message in {"report_export_mismatch", "run_result_unavailable"}:
        return AppProblem(
            status=409,
            code="version_conflict",
            title="Resource state conflict",
            detail="The resource changed or is not ready for this operation.",
        )
    if message in {
        "quota_exceeded",
        "pending_run_quota_exceeded",
        "run_retention_quota_exceeded",
    }:
        return AppProblem(
            status=429,
            code="quota_exceeded",
            title="Resource quota reached",
            detail="Remove or retire an existing resource before retrying.",
        )
    if message == "queue_backpressure":
        return AppProblem(
            status=503,
            code="queue_backpressure",
            title="Run queue is recovering",
            detail="Run creation is temporarily paused while queued work recovers.",
            retry_after=30,
        )
    if message == "unsupported_scope":
        return AppProblem(
            status=422,
            code="unsupported_scope",
            title="Unsupported project scope",
            detail="Phase 2 supports English campaign messages for the Philippines only.",
        )
    if isinstance(message, str) and message.startswith("invalid_"):
        return AppProblem(
            status=422,
            code="validation_error",
            title="Request validation failed",
            detail="One or more fields are invalid.",
            errors=(ProblemError(field="request", code=message),),
        )
    return AppProblem(
        status=500,
        code="internal_error",
        title="Internal server error",
        detail="The request could not be completed. Use the correlation ID for support.",
    )


class DatabaseGateway:
    def __init__(self, settings: ApiSettings, *, telemetry: ApiTelemetry | None = None) -> None:
        self._release_sha = settings.release_sha
        self._migration_head = settings.migration_head
        self._telemetry = telemetry
        self._pool = AsyncConnectionPool(
            conninfo=settings.database_url,
            min_size=1,
            max_size=10,
            timeout=2.0,
            open=False,
            kwargs={"autocommit": False, "row_factory": dict_row},
        )

    async def open(self) -> None:
        try:
            await self._pool.open(wait=True, timeout=2.0)
        except (PoolTimeout, psycopg.OperationalError) as error:
            raise _dependency_unavailable() from error

    async def close(self) -> None:
        await self._pool.close(timeout=2.0)

    async def ready(self) -> bool:
        started_at = perf_counter()
        outcome = "error"
        try:
            async with self._pool.connection(timeout=2.0) as connection:
                async with connection.transaction():
                    cursor = await connection.execute("select 1 as ready")
                    row = await cursor.fetchone()
                    snapshot_cursor = await connection.execute(
                        "select * from private.runtime_observability_snapshot_v3()"
                    )
                    snapshot = await snapshot_cursor.fetchone()
                    schema_cursor = await connection.execute(
                        "select * from private.runtime_schema_readiness_v3()"
                    )
                    schema = await schema_cursor.fetchone()
            ready = (
                row is not None
                and cast(DatabaseRow, row)["ready"] == 1
                and schema is not None
                and str(cast(DatabaseRow, schema)["migration_version"]) == self._migration_head
                and cast(DatabaseRow, schema)["rls_force_enabled"] is True
            )
            if ready and snapshot is not None and self._telemetry is not None:
                self._record_runtime_snapshot(cast(DatabaseRow, snapshot))
            outcome = "success" if ready else "error"
            return ready
        except KeyError, TypeError, ValueError, PoolTimeout, psycopg.Error:
            return False
        finally:
            self._observe_database("readiness", outcome, started_at)

    @asynccontextmanager
    async def _transaction(
        self, identity: VerifiedIdentity, *, operation: str
    ) -> AsyncIterator[AsyncConnection[DatabaseRow]]:
        claims = canonical_json_dumps(identity.database_claims()).decode("utf-8")
        started_at = perf_counter()
        outcome = "error"
        try:
            async with self._pool.connection(timeout=2.0) as connection:
                async with connection.transaction():
                    await connection.execute(
                        """
                        select
                          pg_catalog.set_config('statement_timeout', '8000', true),
                          pg_catalog.set_config('lock_timeout', '2000', true),
                          pg_catalog.set_config(
                            'idle_in_transaction_session_timeout', '10000', true
                          ),
                          pg_catalog.set_config('request.jwt.claims', %s, true),
                          pg_catalog.set_config('simula.release_sha', %s, true)
                        """,
                        (claims, self._release_sha),
                    )
                    yield cast(AsyncConnection[DatabaseRow], connection)
                outcome = "success"
        except PoolTimeout as error:
            raise _dependency_unavailable() from error
        except psycopg.OperationalError as error:
            # SQLSTATE class 54 errors (including durable quota limits) are
            # OperationalError subclasses too. Only transport failures are a
            # dependency outage; command errors must reach their caller's
            # explicit database-problem mapping.
            if isinstance(error, psycopg.errors.ConnectionException):
                raise _dependency_unavailable() from error
            raise
        finally:
            self._observe_database(operation, outcome, started_at)

    def _observe_database(self, operation: str, outcome: str, started_at: float) -> None:
        if self._telemetry is None:
            return
        stats = self._pool.get_stats()
        self._telemetry.observe_database(
            operation,
            outcome,
            duration_seconds=perf_counter() - started_at,
            pool_size=int(stats.get("pool_size", 0)),
            pool_available=int(stats.get("pool_available", 0)),
        )

    def _record_runtime_snapshot(self, row: DatabaseRow) -> None:
        if self._telemetry is None:
            return
        states = (
            "queued",
            "running",
            "retrying",
            "cancel_requested",
            "succeeded",
            "failed",
            "canceled",
        )
        self._telemetry.set_runtime_snapshot(
            migration_version=int(row["migration_version"]),
            rls_force_enabled=bool(row["rls_force_enabled"]),
            state_counts={state: int(row[f"{state}_count"]) for state in states},
            stuck_lease_count=int(row["stuck_lease_count"]),
            oldest_cancellation_age_seconds=float(row["oldest_cancel_requested_age_seconds"]),
        )

    async def create_organization(
        self,
        identity: VerifiedIdentity,
        *,
        name: str,
        idempotency_key: str,
        request_sha256: str,
        correlation_id: UUID,
    ) -> tuple[OrganizationResponse, bool]:
        try:
            async with self._transaction(identity, operation="create_organization") as connection:
                cursor = await connection.execute(
                    """
                    select * from api.create_organization(%s, %s, %s, %s)
                    """,
                    (name, idempotency_key, request_sha256, correlation_id),
                )
                command = await cursor.fetchone()
                if command is None:
                    raise RuntimeError("organization command returned no row")
                cursor = await connection.execute(
                    """
                    select organizations.status, organizations.created_at
                    from api.organizations as organizations
                    where organizations.id = %s
                    """,
                    (command["organization_id"],),
                )
                stored = await cursor.fetchone()
                if stored is None:
                    raise RuntimeError("organization command response is unreadable")
        except psycopg.Error as error:
            raise _database_problem(error) from error
        return (
            OrganizationResponse(
                id=command["organization_id"],
                name=command["organization_name"],
                role=command["membership_role"],
                status=stored["status"],
                created_at=stored["created_at"],
            ),
            bool(command["replayed"]),
        )

    async def list_organizations(
        self,
        identity: VerifiedIdentity,
        *,
        after: CursorPosition | None,
        limit: int,
    ) -> list[OrganizationResponse]:
        async with self._transaction(identity, operation="list_organizations") as connection:
            parameters: tuple[Any, ...]
            predicate = ""
            if after is None:
                parameters = (limit,)
            else:
                predicate = "and (organizations.created_at, organizations.id) > (%s, %s)"
                parameters = (after.created_at, after.resource_id, limit)
            cursor = await connection.execute(
                f"""
                select
                  organizations.id,
                  organizations.name,
                  case
                    when private.is_platform_superadmin(private.verified_subject())
                      then 'owner'::api.organization_role
                    else memberships.role
                  end as role,
                  organizations.status,
                  organizations.created_at
                from api.organizations as organizations
                left join api.organization_memberships as memberships
                  on memberships.organization_id = organizations.id
                 and memberships.user_id = private.verified_subject()
                where (
                  memberships.user_id is not null
                  or private.is_platform_superadmin(private.verified_subject())
                )
                  {predicate}
                order by organizations.created_at, organizations.id
                limit %s
                """,  # noqa: S608 - predicate is one fixed internal fragment.
                parameters,
            )
            rows = await cursor.fetchall()
        return [OrganizationResponse.model_validate(row) for row in rows]

    async def is_platform_superadmin(self, identity: VerifiedIdentity) -> bool:
        async with self._transaction(identity, operation="platform_admin_access") as connection:
            cursor = await connection.execute(
                "select private.is_platform_superadmin(private.verified_subject()) as allowed"
            )
            row = await cursor.fetchone()
        return row is not None and bool(row["allowed"])

    async def visible_organization(
        self, identity: VerifiedIdentity, *, organization_id: UUID
    ) -> UUID:
        async with self._transaction(identity, operation="get_organization") as connection:
            cursor = await connection.execute(
                "select id from api.organizations where id = %s", (organization_id,)
            )
            row = await cursor.fetchone()
        if row is None:
            raise _not_found()
        return cast(UUID, row["id"])

    async def organization_for_project(
        self, identity: VerifiedIdentity, *, project_id: UUID
    ) -> UUID:
        async with self._transaction(identity, operation="get_project_organization") as connection:
            cursor = await connection.execute(
                "select organization_id from api.projects where id = %s", (project_id,)
            )
            row = await cursor.fetchone()
        if row is None:
            raise _not_found()
        return cast(UUID, row["organization_id"])

    async def organization_for_stimulus(
        self, identity: VerifiedIdentity, *, stimulus_id: UUID
    ) -> UUID:
        async with self._transaction(identity, operation="get_stimulus_organization") as connection:
            cursor = await connection.execute(
                "select organization_id from api.stimuli where id = %s", (stimulus_id,)
            )
            row = await cursor.fetchone()
        if row is None:
            raise _not_found()
        return cast(UUID, row["organization_id"])

    async def record_privileged_denial(
        self,
        identity: VerifiedIdentity,
        *,
        organization_id: UUID,
        action: str,
        object_type: str,
        object_id: UUID | None,
        correlation_id: UUID,
    ) -> None:
        try:
            async with self._transaction(
                identity, operation="privileged_denial_audit"
            ) as connection:
                await connection.execute(
                    "select api.record_privileged_denial(%s, %s, %s, %s, %s)",
                    (organization_id, action, object_type, object_id, correlation_id),
                )
        except psycopg.Error as error:
            raise _database_problem(error) from error

    async def record_sign_in_success(
        self,
        identity: VerifiedIdentity,
        *,
        session_id: UUID,
        correlation_id: UUID,
    ) -> bool:
        try:
            async with self._transaction(identity, operation="auth_audit") as connection:
                cursor = await connection.execute(
                    "select api.record_sign_in_success(%s, %s) as recorded",
                    (session_id, correlation_id),
                )
                row = await cursor.fetchone()
        except psycopg.Error as error:
            raise _database_problem(error) from error
        if row is None:
            raise RuntimeError("sign-in audit command returned no row")
        return bool(row["recorded"])

    async def create_project(
        self,
        identity: VerifiedIdentity,
        *,
        organization_id: UUID,
        payload: JsonObject,
        idempotency_key: str,
        request_sha256: str,
        correlation_id: UUID,
    ) -> tuple[ProjectResponse, bool]:
        try:
            async with self._transaction(identity, operation="create_project") as connection:
                cursor = await connection.execute(
                    """
                    select * from api.create_project(
                      %s, %s, %s, %s, %s, %s, %s, %s, %s
                    )
                    """,
                    (
                        organization_id,
                        payload["name"],
                        payload["objective"],
                        payload["market"],
                        payload["language"],
                        payload["category"],
                        idempotency_key,
                        request_sha256,
                        correlation_id,
                    ),
                )
                row = await cursor.fetchone()
                if row is None:
                    raise RuntimeError("project command returned no row")
        except psycopg.Error as error:
            raise _database_problem(error) from error
        return self._project_from_command(row), bool(row["replayed"])

    async def list_projects(
        self,
        identity: VerifiedIdentity,
        *,
        organization_id: UUID,
        after: CursorPosition | None,
        limit: int,
    ) -> list[ProjectResponse]:
        async with self._transaction(identity, operation="list_projects") as connection:
            visible = await connection.execute(
                "select 1 from api.organizations where id = %s", (organization_id,)
            )
            if await visible.fetchone() is None:
                raise _not_found()
            parameters: tuple[Any, ...]
            predicate = ""
            if after is None:
                parameters = (organization_id, limit)
            else:
                predicate = "and (projects.created_at, projects.id) > (%s, %s)"
                parameters = (
                    organization_id,
                    after.created_at,
                    after.resource_id,
                    limit,
                )
            cursor = await connection.execute(
                f"""
                select
                  projects.id,
                  projects.organization_id,
                  projects.name,
                  projects.objective,
                  projects.market,
                  projects.language,
                  projects.category,
                  projects.status,
                  projects.version,
                  projects.created_at,
                  projects.updated_at
                from api.projects as projects
                where projects.organization_id = %s
                  {predicate}
                order by projects.created_at, projects.id
                limit %s
                """,  # noqa: S608 - predicate is one fixed internal fragment.
                parameters,
            )
            rows = await cursor.fetchall()
        return [ProjectResponse.model_validate(row) for row in rows]

    async def get_project(self, identity: VerifiedIdentity, *, project_id: UUID) -> ProjectDetail:
        async with self._transaction(identity, operation="get_project") as connection:
            return await self._project_detail(connection, project_id)

    async def update_project(
        self,
        identity: VerifiedIdentity,
        *,
        project_id: UUID,
        expected_version: int,
        patch: ProjectPatch,
        correlation_id: UUID,
    ) -> ProjectResponse:
        try:
            async with self._transaction(identity, operation="update_project") as connection:
                current_cursor = await connection.execute(
                    """
                    select name, objective, market, language, category
                    from api.projects where id = %s
                    """,
                    (project_id,),
                )
                current = await current_cursor.fetchone()
                if current is None:
                    raise _not_found()
                updates = patch.model_dump(exclude_unset=True)
                merged = {**current, **updates}
                cursor = await connection.execute(
                    """
                    select * from api.update_project(
                      %s, %s, %s, %s, %s, %s, %s, %s
                    )
                    """,
                    (
                        project_id,
                        expected_version,
                        merged["name"],
                        merged["objective"],
                        merged["market"],
                        merged["language"],
                        merged["category"],
                        correlation_id,
                    ),
                )
                row = await cursor.fetchone()
                if row is None:
                    raise RuntimeError("project update returned no row")
        except psycopg.Error as error:
            raise _database_problem(error) from error
        return self._project_from_command(row)

    async def create_stimulus(
        self,
        identity: VerifiedIdentity,
        *,
        project_id: UUID,
        name: str,
        content: str,
        idempotency_key: str,
        request_sha256: str,
        correlation_id: UUID,
    ) -> tuple[StimulusResponse, bool]:
        try:
            async with self._transaction(identity, operation="create_stimulus") as connection:
                cursor = await connection.execute(
                    """
                    select * from api.create_stimulus(
                      %s, %s, %s, %s, %s, %s, %s
                    )
                    """,
                    (
                        project_id,
                        name,
                        content,
                        content_sha256(content),
                        idempotency_key,
                        request_sha256,
                        correlation_id,
                    ),
                )
                row = await cursor.fetchone()
                if row is None:
                    raise RuntimeError("stimulus command returned no row")
        except psycopg.Error as error:
            raise _database_problem(error) from error
        return self._stimulus_from_command(row), bool(row["replayed"])

    async def append_stimulus_version(
        self,
        identity: VerifiedIdentity,
        *,
        stimulus_id: UUID,
        content: str,
        idempotency_key: str,
        request_sha256: str,
        correlation_id: UUID,
    ) -> tuple[StimulusVersionResponse, bool]:
        try:
            async with self._transaction(identity, operation="version_stimulus") as connection:
                cursor = await connection.execute(
                    """
                    select * from api.append_stimulus_version(
                      %s, %s, %s, %s, %s, %s
                    )
                    """,
                    (
                        stimulus_id,
                        content,
                        content_sha256(content),
                        idempotency_key,
                        request_sha256,
                        correlation_id,
                    ),
                )
                row = await cursor.fetchone()
                if row is None:
                    raise RuntimeError("stimulus-version command returned no row")
        except psycopg.Error as error:
            raise _database_problem(error) from error
        return self._version_from_command(row), bool(row["replayed"])

    async def create_simulation_run(
        self,
        identity: VerifiedIdentity,
        *,
        project_id: UUID,
        stimulus_version_id: UUID,
        idempotency_key: str,
        request_sha256: str,
        correlation_id: UUID,
        traceparent: str,
    ) -> tuple[SimulationRunResponse, bool]:
        try:
            async with self._transaction(identity, operation="create_run") as connection:
                cursor = await connection.execute(
                    """
                    select * from api.create_simulation_run(%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        project_id,
                        stimulus_version_id,
                        idempotency_key,
                        request_sha256,
                        correlation_id,
                        traceparent,
                    ),
                )
                row = await cursor.fetchone()
                if row is None:
                    raise RuntimeError("simulation run command returned no row")
                await self._add_failure_context(
                    connection, row, run_id_key="run_id", state_key="run_state"
                )
        except psycopg.Error as error:
            raise _database_problem(error) from error
        return self._run_from_command(row), bool(row["replayed"])

    async def get_simulation_run_replay(
        self,
        identity: VerifiedIdentity,
        *,
        project_id: UUID,
        idempotency_key: str,
        request_sha256: str,
    ) -> SimulationRunResponse | None:
        try:
            async with self._transaction(identity, operation="get_run_replay") as connection:
                cursor = await connection.execute(
                    "select * from api.get_simulation_run_replay(%s, %s, %s)",
                    (project_id, idempotency_key, request_sha256),
                )
                row = await cursor.fetchone()
                if row is None:
                    return None
                await self._add_failure_context(
                    connection, row, run_id_key="run_id", state_key="run_state"
                )
        except psycopg.Error as error:
            raise _database_problem(error) from error
        return self._run_from_command(row)

    async def request_simulation_run_cancel(
        self,
        identity: VerifiedIdentity,
        *,
        run_id: UUID,
        correlation_id: UUID,
    ) -> SimulationRunResponse:
        try:
            async with self._transaction(identity, operation="request_cancellation") as connection:
                cursor = await connection.execute(
                    "select * from api.request_run_cancel(%s, %s)",
                    (run_id, correlation_id),
                )
                row = await cursor.fetchone()
                if row is None:
                    raise RuntimeError("simulation run cancellation returned no row")
                await self._add_failure_context(
                    connection, row, run_id_key="run_id", state_key="run_state"
                )
        except psycopg.Error as error:
            raise _database_problem(error) from error
        return self._run_from_command(row)

    async def get_simulation_run(
        self, identity: VerifiedIdentity, *, run_id: UUID
    ) -> SimulationRunResponse:
        async with self._transaction(identity, operation="get_run") as connection:
            cursor = await connection.execute(
                """
                select
                  id,
                  organization_id,
                  project_id,
                  stimulus_version_id,
                  audience_version_id,
                  state,
                  schema_version,
                  dispatch_generation,
                  version,
                  created_at,
                  correlation_id
                from api.simulation_runs
                where id = %s
                """,
                (run_id,),
            )
            row = await cursor.fetchone()
            if row is not None:
                await self._add_failure_context(connection, row, run_id_key="id", state_key="state")
        if row is None:
            raise _not_found()
        run = self._run_from_row(row)
        return run

    async def get_demo_audience(self, identity: VerifiedIdentity) -> AudienceDisclosureResponse:
        async with self._transaction(identity, operation="get_audience") as connection:
            cursor = await connection.execute(
                """
                select
                  versions.id,
                  audiences.name,
                  versions.version,
                  versions.kind,
                  versions.checksum_sha256,
                  versions.is_non_representative,
                  versions.limitations,
                  versions.manifest
                from api.audience_versions as versions
                join api.audiences as audiences on audiences.id = versions.audience_id
                where versions.audience_id = '00000000-0000-4000-8000-0000000000d0'::uuid
                  and versions.organization_id is null
                  and versions.kind = 'authored_demo'
                  and versions.admission_status = 'approved_demo'
                  and versions.is_non_representative
                  and audiences.is_public_demo
                  and audiences.organization_id is null
                """
            )
            row = await cursor.fetchone()
        if row is None:
            raise _not_found()
        manifest = row["manifest"]
        if not isinstance(manifest, Mapping):
            raise RuntimeError("demo audience manifest is malformed")
        return AudienceDisclosureResponse.model_validate(
            {
                "id": row["id"],
                "name": row["name"],
                "version": row["version"],
                "kind": row["kind"],
                "checksum_sha256": row["checksum_sha256"],
                "non_representative": row["is_non_representative"],
                "limitations": [row["limitations"]],
                "disclosure_version": manifest.get("disclosure_version"),
                "purpose": manifest.get("purpose"),
                "prohibited_uses": manifest.get("prohibited_uses"),
                "owner": manifest.get("owner"),
                "source": manifest.get("source"),
                "dependencies": manifest.get("dependencies"),
                "transformation": manifest.get("transformation"),
                "scope": manifest.get("scope"),
                "lifecycle": manifest.get("lifecycle"),
            }
        )

    async def get_simulation_result(
        self, identity: VerifiedIdentity, *, run_id: UUID
    ) -> SimulationResultResponse | None:
        async with self._transaction(identity, operation="get_result") as connection:
            cursor = await connection.execute(
                """
                select run_id, schema_version, artifact, artifact_sha256, created_at
                from api.simulation_results
                where run_id = %s
                """,
                (run_id,),
            )
            row = await cursor.fetchone()
        if row is None:
            return None
        return SimulationResultResponse(
            run_id=row["run_id"],
            schema_version=row["schema_version"],
            result=row["artifact"],
            artifact_sha256=row["artifact_sha256"],
            created_at=row["created_at"],
        )

    async def get_simulation_provenance(
        self, identity: VerifiedIdentity, *, run_id: UUID
    ) -> SimulationProvenanceResponse:
        async with self._transaction(identity, operation="get_provenance") as connection:
            cursor = await connection.execute(
                """
                select
                  runs.id,
                  runs.created_at,
                  runs.terminal_at,
                  runs.frozen_manifest,
                  runs.frozen_manifest_sha256,
                  runs.deterministic_seed,
                  results.created_at as result_created_at,
                  receipts.receipt_version,
                  receipts.receipt_kind,
                  receipts.provider_id,
                  receipts.provider_version,
                  receipts.model_id,
                  receipts.template_id,
                  receipts.response_schema_version,
                  receipts.finish_status,
                  receipts.input_tokens,
                  receipts.output_tokens,
                  receipts.cost_microusd,
                  receipts.started_at as provider_started_at,
                  receipts.ended_at as provider_ended_at,
                  receipts.safe_error_class
                from api.simulation_runs as runs
                left join api.simulation_results as results on results.run_id = runs.id
                left join lateral private.provider_success_receipt_for_run(runs.id) as receipts
                  on true
                where runs.id = %s
                """,
                (run_id,),
            )
            row = await cursor.fetchone()
        if row is None:
            raise _not_found()

        manifest = row["frozen_manifest"]
        if (
            not isinstance(manifest, Mapping)
            or "code" not in manifest
            or "configuration" not in manifest
            or "limits" not in manifest
        ):
            return SimulationProvenanceResponse(
                availability="legacy_unavailable",
                unavailable_reason="frozen_provenance_not_captured",
                run_id=row["id"],
                created_at=row["created_at"],
                terminal_at=row["terminal_at"],
                result_created_at=row["result_created_at"],
                frozen_manifest_sha256=row["frozen_manifest_sha256"],
                deterministic_seed=str(row["deterministic_seed"]),
            )

        stimulus = manifest.get("stimulus")
        audience = manifest.get("audience")
        audience_manifest = audience.get("manifest") if isinstance(audience, Mapping) else None
        execution = manifest.get("execution")
        code = manifest.get("code")
        configuration = manifest.get("configuration")
        limits = manifest.get("limits")
        if not all(
            isinstance(value, Mapping)
            for value in (
                stimulus,
                audience,
                audience_manifest,
                execution,
                code,
                configuration,
                limits,
            )
        ):
            raise RuntimeError("stored run provenance is malformed")
        frozen_stimulus = cast(Mapping[str, object], stimulus)
        frozen_audience = cast(Mapping[str, object], audience)
        frozen_audience_manifest = cast(Mapping[str, object], audience_manifest)
        frozen_execution = cast(Mapping[str, object], execution)
        frozen_code = cast(Mapping[str, object], code)
        frozen_configuration = cast(Mapping[str, object], configuration)
        frozen_limits = cast(Mapping[str, object], limits)
        provider_receipt: ProvenanceProviderReceipt | None = None
        if row["result_created_at"] is not None:
            if row["receipt_version"] is None:
                provider_receipt = ProvenanceProviderReceiptLegacyUnavailable(
                    availability="legacy_unavailable",
                    unavailable_reason="successful_result_receipt_not_captured",
                )
            else:
                provider_receipt = ProvenanceProviderReceiptAvailable.model_validate(
                    {
                        "availability": "available",
                        "schema_version": row["receipt_version"],
                        "receipt_kind": row["receipt_kind"],
                        "provider_id": row["provider_id"],
                        "provider_version": row["provider_version"],
                        "model_id": row["model_id"],
                        "template_id": row["template_id"],
                        "response_schema_version": row["response_schema_version"],
                        "finish_status": row["finish_status"],
                        "usage": {
                            "input_tokens": row["input_tokens"],
                            "output_tokens": row["output_tokens"],
                            "cost_microusd": row["cost_microusd"],
                        },
                        "started_at": row["provider_started_at"],
                        "ended_at": row["provider_ended_at"],
                        "safe_error_class": row["safe_error_class"],
                    }
                )
        return SimulationProvenanceResponse(
            availability="available",
            run_id=row["id"],
            created_at=row["created_at"],
            terminal_at=row["terminal_at"],
            result_created_at=row["result_created_at"],
            frozen_manifest_sha256=row["frozen_manifest_sha256"],
            deterministic_seed=str(row["deterministic_seed"]),
            stimulus=ProvenanceStimulus.model_validate(
                {
                    "version_id": frozen_stimulus["version_id"],
                    "content": frozen_stimulus["content"],
                    "content_sha256": frozen_stimulus["content_sha256"],
                }
            ),
            audience=ProvenanceAudience.model_validate(
                {
                    "version_id": frozen_audience["version_id"],
                    "kind": frozen_audience["kind"],
                    "checksum_sha256": frozen_audience["checksum_sha256"],
                    "cells": frozen_audience_manifest["audience_cells"],
                    "non_representative": frozen_audience["non_representative"],
                    "limitations": [
                        "Estimates nobody and is not representative of any population."
                    ],
                }
            ),
            execution=ProvenanceExecution.model_validate(
                {
                    "method_version": manifest["method_version"],
                    "disclosure_version": manifest["disclosure_version"],
                    "language": frozen_execution["language"],
                    "output_schema_version": frozen_execution["output_schema_version"],
                    "provider_id": frozen_execution["provider_id"],
                    "provider_version": frozen_execution["provider_version"],
                    "pipeline_release_id": "phase2_deterministic_mock_v1",
                    "code_release_sha": frozen_code["release_sha"],
                    "configuration_sha256": frozen_configuration["sha256"],
                }
            ),
            limits=ProvenanceExecutionLimits.model_validate(frozen_limits),
            provider_receipt=provider_receipt,
        )

    async def execute_product_command(
        self,
        identity: VerifiedIdentity,
        *,
        operation: str,
        query: str,
        parameters: Sequence[object],
    ) -> dict[str, Any]:
        """Execute one fixed Phase 3/4 JSON command through its database capability."""

        try:
            async with self._transaction(identity, operation="product_command") as connection:
                cursor = await connection.execute(query, tuple(parameters))
                row = await cursor.fetchone()
                if row is None or not isinstance(row.get("payload"), Mapping):
                    raise RuntimeError(f"{operation} returned an invalid payload")
                payload = dict(cast(Mapping[str, Any], row["payload"]))
        except psycopg.Error as error:
            raise _database_problem(error) from error
        return payload

    async def read_product_rows(
        self,
        identity: VerifiedIdentity,
        *,
        operation: str,
        query: str,
        parameters: Sequence[object],
    ) -> list[DatabaseRow]:
        """Read a bounded product projection; callers own fixed SQL and response models."""

        try:
            async with self._transaction(identity, operation="product_read") as connection:
                cursor = await connection.execute(query, tuple(parameters))
                rows = await cursor.fetchall()
        except psycopg.Error as error:
            raise _database_problem(error) from error
        return [dict(row) for row in rows]

    async def read_product_json(
        self,
        identity: VerifiedIdentity,
        *,
        operation: str,
        query: str,
        parameters: Sequence[object],
    ) -> Any:
        """Read one bounded JSON projection through a fixed database capability."""

        try:
            async with self._transaction(identity, operation="product_read") as connection:
                cursor = await connection.execute(query, tuple(parameters))
                row = await cursor.fetchone()
                if row is None:
                    raise _not_found()
                payload = row.get("payload")
        except psycopg.Error as error:
            raise _database_problem(error) from error
        return payload

    async def _project_detail(
        self, connection: AsyncConnection[DatabaseRow], project_id: UUID
    ) -> ProjectDetail:
        cursor = await connection.execute(
            """
            select
              projects.id,
              projects.organization_id,
              projects.name,
              projects.objective,
              projects.market,
              projects.language,
              projects.category,
              projects.status,
              projects.version,
              projects.created_at,
              projects.updated_at
            from api.projects as projects
            where projects.id = %s
            """,
            (project_id,),
        )
        project = await cursor.fetchone()
        if project is None:
            raise _not_found()
        cursor = await connection.execute(
            """
            select
              stimuli.id as stimulus_id,
              stimuli.organization_id,
              stimuli.project_id,
              stimuli.name,
              stimuli.status,
              stimuli.created_at as stimulus_created_at,
              versions.id as version_id,
              versions.version,
              versions.content,
              versions.content_sha256,
              versions.created_at as version_created_at
            from api.stimuli as stimuli
            left join api.stimulus_versions as versions
              on versions.organization_id = stimuli.organization_id
             and versions.stimulus_id = stimuli.id
            where stimuli.project_id = %s
            order by stimuli.created_at, stimuli.id, versions.version
            """,
            (project_id,),
        )
        rows = await cursor.fetchall()
        stimulus_rows: dict[UUID, DatabaseRow] = {}
        version_lists: dict[UUID, list[StimulusVersionResponse]] = {}
        for row in rows:
            stimulus_id = cast(UUID, row["stimulus_id"])
            if stimulus_id not in stimulus_rows:
                version_lists[stimulus_id] = []
                stimulus_rows[stimulus_id] = row
            if row["version_id"] is not None:
                version_lists[stimulus_id].append(
                    StimulusVersionResponse(
                        id=row["version_id"],
                        organization_id=row["organization_id"],
                        stimulus_id=stimulus_id,
                        version=row["version"],
                        content=row["content"],
                        content_sha256=row["content_sha256"],
                        created_at=row["version_created_at"],
                    )
                )
        stimuli = [
            StimulusResponse(
                id=stimulus_id,
                organization_id=row["organization_id"],
                project_id=row["project_id"],
                name=row["name"],
                status=row["status"],
                created_at=row["stimulus_created_at"],
                versions=version_lists[stimulus_id],
            )
            for stimulus_id, row in stimulus_rows.items()
        ]
        return ProjectDetail(**project, stimuli=stimuli)

    @staticmethod
    def _project_from_command(row: DatabaseRow) -> ProjectResponse:
        return ProjectResponse(
            id=row["project_id"],
            organization_id=row["organization_id"],
            name=row["project_name"],
            objective=row["objective"],
            market=row["market"],
            language=row["language"],
            category=row["category"],
            status=row["project_status"],
            version=row["project_version"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    @staticmethod
    def _stimulus_from_command(row: DatabaseRow) -> StimulusResponse:
        return StimulusResponse(
            id=row["stimulus_id"],
            organization_id=row["organization_id"],
            project_id=row["project_id"],
            name=row["stimulus_name"],
            status=row["stimulus_status"],
            created_at=row["stimulus_created_at"],
            versions=[
                StimulusVersionResponse(
                    id=row["stimulus_version_id"],
                    organization_id=row["organization_id"],
                    stimulus_id=row["stimulus_id"],
                    version=row["stimulus_version"],
                    content=row["content"],
                    content_sha256=row["content_sha256"],
                    created_at=row["version_created_at"],
                )
            ],
        )

    @staticmethod
    def _version_from_command(row: DatabaseRow) -> StimulusVersionResponse:
        return StimulusVersionResponse(
            id=row["version_id"],
            organization_id=row["organization_id"],
            stimulus_id=row["stimulus_id"],
            version=row["stimulus_version"],
            content=row["content"],
            content_sha256=row["content_sha256"],
            created_at=row["created_at"],
        )

    @staticmethod
    def _run_from_command(row: DatabaseRow) -> SimulationRunResponse:
        return SimulationRunResponse(
            id=row["run_id"],
            organization_id=row["organization_id"],
            project_id=row["project_id"],
            stimulus_version_id=row["stimulus_version_id"],
            audience_version_id=row["audience_version_id"],
            state=row["run_state"],
            schema_version=row["schema_version"],
            dispatch_generation=row["dispatch_generation"],
            job_id=row["job_id"],
            version=row["run_version"],
            created_at=row["created_at"],
            failure=DatabaseGateway._failure_context(row, state_key="run_state"),
        )

    @staticmethod
    def _run_from_row(row: DatabaseRow) -> SimulationRunResponse:
        run_id = cast(UUID, row["id"])
        return SimulationRunResponse(
            id=run_id,
            organization_id=row["organization_id"],
            project_id=row["project_id"],
            stimulus_version_id=row["stimulus_version_id"],
            audience_version_id=row["audience_version_id"],
            state=row["state"],
            schema_version=row["schema_version"],
            dispatch_generation=row["dispatch_generation"],
            job_id=f"run:{run_id}:dispatch:{row['dispatch_generation']}",
            version=row["version"],
            created_at=row["created_at"],
            failure=DatabaseGateway._failure_context(row, state_key="state"),
        )

    @staticmethod
    def _failure_context(row: DatabaseRow, *, state_key: str) -> SimulationRunFailure | None:
        if row[state_key] != "failed":
            return None
        code = row.get("terminal_error_code")
        correlation_id = row.get("correlation_id")
        if not isinstance(code, str) or not isinstance(correlation_id, UUID):
            raise RuntimeError("failed simulation run support context is malformed")
        return SimulationRunFailure(
            code=code,
            correlation_id=correlation_id,
            guidance=(
                "No substitute result was generated. Retry or use the correlation ID for support."
            ),
        )

    @staticmethod
    async def _add_failure_context(
        connection: AsyncConnection[DatabaseRow],
        row: DatabaseRow,
        *,
        run_id_key: str,
        state_key: str,
    ) -> None:
        if row[state_key] != "failed":
            return
        cursor = await connection.execute(
            "select * from api.get_run_failure_context(%s)",
            (row[run_id_key],),
        )
        failure_row = await cursor.fetchone()
        if failure_row is None:
            raise RuntimeError("failed simulation run support context is missing")
        row.update(failure_row)
