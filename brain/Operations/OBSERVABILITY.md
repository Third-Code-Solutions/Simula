---
title: SIMULA Observability
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-17
owner: SRE lead
classification: PROPOSED
source_of_truth: true
---

# SIMULA Observability

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

## SLO and alert design

[[../Decisions/ADR-0009-OBSERVABILITY-AUDIT-AND-SERVICE-OBJECTIVES|ADR-0009]] defines correlation, allowlisted logs, separate audit records, metrics, initial local/staging objectives, alert thresholds, and ownership. Targets remain proposed engineering objectives until measured; they are not production commitments.
