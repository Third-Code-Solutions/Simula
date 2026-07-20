---
title: SIMULA Observability
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-20
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
- Durable run-control alerts point to [[RUNBOOK_RUN_CREATION_DISABLED|the audited operator runbook]]. Hosted pager delivery and a named 24x7 contact tree remain staging requirements.

## SLO and alert design

[[../Decisions/ADR-0009-OBSERVABILITY-AUDIT-AND-SERVICE-OBJECTIVES|ADR-0009]] defines correlation, allowlisted logs, separate audit records, metrics, initial local/staging objectives, alert thresholds, and ownership. Targets remain proposed engineering objectives until measured; they are not production commitments.
