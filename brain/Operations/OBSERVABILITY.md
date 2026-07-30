---
title: SIMULA Observability
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-29
owner: SRE lead
classification: PROPOSED
source_of_truth: true
---

# SIMULA Observability

## Phase 2 on-call questions

1. Which bounded route template and status class is failing or slow now?
2. Which required dependency is preventing the API or worker from being safely ready?
3. Can one request and resulting run be followed by correlation/trace context without exposing stimulus, result, identity, or credential data?
4. Are queue age, retries, terminal failures, cancellation latency, or expired leases increasing?

Every Phase 2 telemetry signal must answer at least one of these questions. Unbounded labels, raw URLs, tenant/user identifiers, request bodies, stimuli, results, tokens, and exception messages are prohibited.

## Signals

- Structured application, audit, security, and job-event logs.
- Request/job/provider/evaluation traces where useful.
- API, queue, worker, provider, database, storage, simulation, cost, and evaluation metrics.
- Frontend errors and journey health without leaking confidential content.

## Correlation

Stable correlation IDs connect browser-visible errors, API request, queue message, worker attempt, provider call, database mutation, audit event, and incident. Tenant/user identifiers in telemetry must be minimized and access-controlled.

## Critical indicators

- Availability, latency, error rate, saturation.
- Queue depth/age, run duration, retries, terminal failures, cancellations, stuck jobs.
- Provider timeout/rate/schema failure, token/cost usage, fallback events.
- RLS/authorization denials and anomalous export/share activity.
- Model/prompt/method/data version adoption and regression signals.
- Evaluation drift and segment-performance warnings.

## Logging policy

Allowlist fields. Redact secrets and sensitive content. Do not log raw credentials, full stimuli/responses by default, database/service-role keys, provider tokens, or personal research data. Define retention and access per signal class.

## Phase 2 verified controls

- API and worker processors stamp trusted `service`, `environment`, and `release_sha` on every log and overwrite forged caller values. Allowlisted event fields and payload redaction remain mandatory.
- API liveness reports only process life; API readiness checks configured dependencies. Worker liveness probes the running worker process; worker readiness measures its live database and Redis dependencies.
- Fixed-cardinality metrics cover database query count/duration, pool use, migration/RLS state, durable run states, cancellation age, stuck leases, visibility extension, duplicate delivery, invalid transitions, retries, terminal failures, provider failure classes, and cancellation finalization. Tenant, user, content, row, and credential labels remain forbidden.
- Dispatcher logs one fixed `organization_deletion_reconciliation_pass` event
  only when a pass claims, releases, or finalizes work. It reports bounded
  counts only; request, organization, resource, object, job, and error text are
  never logged.
- Durable run-control alerts point to [[RUNBOOK_RUN_CREATION_DISABLED|the audited operator runbook]]. Hosted pager delivery and a named 24x7 contact tree remain staging requirements.

## M7 exporter implementation

- NestJS API/dispatcher and Python API/worker/AI-engine services initialize
  OpenTelemetry before runtime work. Next.js initializes Sentry through its
  server, edge, and browser instrumentation boundaries.
- Sentry is error-only. Performance transaction export is disabled so
  OpenTelemetry remains the trace authority.
- Export is disabled by default. Enabling requires an exact environment and
  40-character release SHA, Sentry DSN, OTLP HTTP/protobuf trace endpoint, and
  bounded sampling rate. Non-local exporters require HTTPS; local HTTP is
  loopback-only.
- Sentry events drop request, user, URL, body, breadcrumb, context, arbitrary
  extra, transaction, and exception-message data. OpenTelemetry exports generic
  span names and a fixed operational attribute allowlist.
- Provider HTTP spans, worker jobs, and behavioral executions never attach
  prompt, stimulus, result, rationale, tenant, user, project, run, or synthetic
  agent identifiers.
- Local Prometheus metrics remain the metric authority. The immutable Grafana
  dashboard is `ops/observability/grafana-dashboard.json`; alert rules are
  `ops/observability/prometheus-alerts.yml`; response steps are in
  [[OBSERVABILITY_RUNBOOK]].
- `pnpm observability:check` enforces the required dashboard/alert inventory and
  rejects high-cardinality identity labels.

Hosted Sentry/collector connectivity, dashboard import, alert delivery,
acknowledgement, recovery notification, and redaction inspection remain staging
gates. No vendor connection or production readiness is claimed from static
configuration.

## SLO and alert design

[[../Decisions/ADR-0009-OBSERVABILITY-AUDIT-AND-SERVICE-OBJECTIVES|ADR-0009]] defines correlation, allowlisted logs, separate audit records, metrics, initial local/staging objectives, alert thresholds, and ownership. Targets remain proposed engineering objectives until measured; they are not production commitments.
