"""Bounded, payload-free API metrics and W3C trace context."""

from __future__ import annotations

from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram, generate_latest

_HTTP_METHODS = frozenset({"DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"})
_DEPENDENCIES = frozenset({"auth", "database", "queue", "rate_limit", "run_admission"})
_REJECTION_KINDS = frozenset({"authentication", "authorization", "quota", "rate"})
_DATABASE_OPERATIONS = frozenset(
    {
        "auth_audit",
        "create_organization",
        "create_project",
        "create_run",
        "create_stimulus",
        "get_audience",
        "get_organization",
        "get_project",
        "get_project_organization",
        "get_provenance",
        "get_result",
        "get_run",
        "get_run_replay",
        "get_stimulus_organization",
        "list_organizations",
        "list_projects",
        "privileged_denial_audit",
        "product_command",
        "product_read",
        "readiness",
        "request_cancellation",
        "update_project",
        "version_stimulus",
    }
)
_DATABASE_OUTCOMES = frozenset({"error", "success"})
_RUN_STATES = frozenset(
    {"cancel_requested", "canceled", "failed", "queued", "retrying", "running", "succeeded"}
)


class ApiTelemetry:
    """Per-process RED metrics with fixed, low-cardinality labels."""

    def __init__(self) -> None:
        self.registry = CollectorRegistry(auto_describe=True)
        self._requests = Counter(
            "simula_api_http_requests_total",
            "Completed API HTTP requests.",
            ("method", "route", "status_class"),
            registry=self.registry,
        )
        self._duration = Histogram(
            "simula_api_http_request_duration_seconds",
            "API HTTP request duration by bounded route template.",
            ("method", "route", "status_class"),
            buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
            registry=self.registry,
        )
        self._dependency_ready = Gauge(
            "simula_api_dependency_ready",
            "Whether a required API dependency passed its bounded live probe.",
            ("dependency",),
            registry=self.registry,
        )
        self._rejections = Counter(
            "simula_api_rejections_total",
            "API requests rejected by bounded policy class.",
            ("kind",),
            registry=self.registry,
        )
        self._database_queries = Counter(
            "simula_api_database_queries_total",
            "API database transactions by fixed operation and outcome.",
            ("operation", "outcome"),
            registry=self.registry,
        )
        self._database_duration = Histogram(
            "simula_api_database_query_duration_seconds",
            "API database transaction duration by fixed operation and outcome.",
            ("operation", "outcome"),
            buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 8.0),
            registry=self.registry,
        )
        self._database_pool = Gauge(
            "simula_api_database_pool_connections",
            "API database pool connections by bounded state.",
            ("state",),
            registry=self.registry,
        )
        self._migration_version = Gauge(
            "simula_database_migration_version",
            "Latest application migration version observed by this process.",
            registry=self.registry,
        )
        self._rls_force_enabled = Gauge(
            "simula_database_rls_force_enabled",
            "Whether all application tables have RLS enabled and forced.",
            registry=self.registry,
        )
        self._run_states = Gauge(
            "simula_run_state_count",
            "Current durable simulation runs by bounded state.",
            ("state",),
            registry=self.registry,
        )
        self._stuck_leases = Gauge(
            "simula_run_stuck_lease_count",
            "Current expired worker leases on non-terminal runs.",
            registry=self.registry,
        )
        self._oldest_cancellation = Gauge(
            "simula_run_oldest_cancellation_age_seconds",
            "Age of the oldest durable cancellation request.",
            registry=self.registry,
        )
        for dependency in sorted(_DEPENDENCIES):
            self._dependency_ready.labels(dependency=dependency).set(0)
        for state in ("available", "in_use"):
            self._database_pool.labels(state=state).set(0)
        for state in sorted(_RUN_STATES):
            self._run_states.labels(state=state).set(0)

    def observe_http(
        self, *, method: str, route: str, status: int, duration_seconds: float
    ) -> None:
        labels = {
            "method": method if method in _HTTP_METHODS else "OTHER",
            "route": route,
            "status_class": _status_class(status),
        }
        self._requests.labels(**labels).inc()
        self._duration.labels(**labels).observe(max(0.0, duration_seconds))

    def set_dependency_ready(self, dependency: str, ready: bool) -> None:
        if dependency not in _DEPENDENCIES:
            raise ValueError("dependency metric label is not allowlisted")
        self._dependency_ready.labels(dependency=dependency).set(1 if ready else 0)

    def observe_rejection(self, kind: str) -> None:
        if kind not in _REJECTION_KINDS:
            raise ValueError("rejection metric label is not allowlisted")
        self._rejections.labels(kind=kind).inc()

    def observe_database(
        self,
        operation: str,
        outcome: str,
        *,
        duration_seconds: float,
        pool_size: int,
        pool_available: int,
    ) -> None:
        if operation not in _DATABASE_OPERATIONS:
            raise ValueError("database operation metric label is not allowlisted")
        if outcome not in _DATABASE_OUTCOMES:
            raise ValueError("database outcome metric label is not allowlisted")
        if pool_size < 0 or pool_available < 0 or pool_available > pool_size:
            raise ValueError("database pool snapshot is invalid")
        labels = {"operation": operation, "outcome": outcome}
        self._database_queries.labels(**labels).inc()
        self._database_duration.labels(**labels).observe(max(0.0, duration_seconds))
        self._database_pool.labels(state="available").set(pool_available)
        self._database_pool.labels(state="in_use").set(pool_size - pool_available)

    def set_runtime_snapshot(
        self,
        *,
        migration_version: int,
        rls_force_enabled: bool,
        state_counts: dict[str, int],
        stuck_lease_count: int,
        oldest_cancellation_age_seconds: float,
    ) -> None:
        if set(state_counts) != _RUN_STATES:
            raise ValueError("run state snapshot labels are not allowlisted")
        values = [*state_counts.values(), stuck_lease_count]
        if any(isinstance(value, bool) or value < 0 for value in values):
            raise ValueError("runtime snapshot counts must be non-negative integers")
        if migration_version < 0 or oldest_cancellation_age_seconds < 0:
            raise ValueError("runtime snapshot values must be non-negative")
        self._migration_version.set(migration_version)
        self._rls_force_enabled.set(1 if rls_force_enabled else 0)
        for state, count in state_counts.items():
            self._run_states.labels(state=state).set(count)
        self._stuck_leases.set(stuck_lease_count)
        self._oldest_cancellation.set(oldest_cancellation_age_seconds)

    def render(self) -> bytes:
        return generate_latest(self.registry)


def _status_class(status: int) -> str:
    return f"{status // 100}xx" if 100 <= status <= 599 else "other"
