"""Static safety and completeness checks for observability deployment assets."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALERTS = ROOT / "ops" / "observability" / "prometheus-alerts.yml"
DASHBOARD = ROOT / "ops" / "observability" / "grafana-dashboard.json"
REQUIRED_ALERTS = {
    "SimulaQueueBacklog",
    "SimulaRequiredDependencyUnavailable",
    "SimulaRlsControlMissing",
    "SimulaRunCreationDisabled",
    "SimulaStuckRunLease",
    "SimulaTerminalFailureRate",
}
REQUIRED_METRICS = {
    "simula_api_dependency_ready",
    "simula_api_http_request_duration_seconds_bucket",
    "simula_api_http_requests_total",
    "simula_worker_provider_failures_total",
    "simula_worker_queue_depth",
    "simula_worker_queue_oldest_ready_age_seconds",
    "simula_worker_run_state_count",
    "simula_worker_run_stuck_lease_count",
}
FORBIDDEN_CARDINALITY = {
    "agent_id",
    "organization_id",
    "project_id",
    "run_id",
    "stimulus",
    "user_id",
}


def main() -> None:
    alerts = ALERTS.read_text(encoding="utf-8")
    dashboard = json.loads(DASHBOARD.read_text(encoding="utf-8"))
    missing_alerts = sorted(alert for alert in REQUIRED_ALERTS if f"alert: {alert}" not in alerts)
    if missing_alerts:
        raise SystemExit(f"missing observability alerts: {', '.join(missing_alerts)}")
    if alerts.count("runbook:") != len(REQUIRED_ALERTS):
        raise SystemExit("every observability alert must link one runbook")
    serialized_dashboard = json.dumps(dashboard, sort_keys=True)
    missing_metrics = sorted(
        metric
        for metric in REQUIRED_METRICS
        if metric not in alerts and metric not in serialized_dashboard
    )
    if missing_metrics:
        raise SystemExit(f"missing observability metrics: {', '.join(missing_metrics)}")
    forbidden = sorted(
        label
        for label in FORBIDDEN_CARDINALITY
        if f"{{{{{label}}}}}" in serialized_dashboard or f"by ({label})" in alerts
    )
    if forbidden:
        raise SystemExit(f"forbidden high-cardinality observability labels: {', '.join(forbidden)}")
    if dashboard.get("editable") is not False or dashboard.get("uid") != "simula-runtime":
        raise SystemExit("the SIMULA dashboard identity and immutability must be fixed")
    print(
        json.dumps(
            {
                "alerts": len(REQUIRED_ALERTS),
                "dashboard_panels": len(dashboard.get("panels", [])),
                "status": "ok",
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
