---
title: ADR-0009 Observability Audit and Service Objectives
status: accepted
created: 2026-07-17
updated: 2026-07-17
owner: SRE and security leads
classification: PROPOSED
source_of_truth: true
---

# ADR-0009 — Observability, Audit, and Service Objectives

## Context

Async failures cross browser, API, queue, worker, database, and eventually providers. Raw stimuli/results are confidential and must not become telemetry. No external telemetry vendor is approved.

## Decision

### Correlation and traces

- API accepts a valid UUIDv4/UUIDv7 `X-Correlation-ID` or generates one; always echoes it.
- Run creation assigns immutable `run_id`; every event, attempt, result, and audit record carries run/correlation context.
- W3C `traceparent` is propagated where supported; external/provider spans contain no prompt/stimulus/result attributes.
- Browser-visible problems include correlation ID, never stack or secret.

### Structured log schema

JSON stdout fields: timestamp, level, service, environment, release SHA, event name, correlation/trace IDs, route template, method, status, duration, run/attempt IDs where applicable, safe tenant hash where needed, error class, retryability, queue age, and cost units. Field allowlist is enforced in tests.

Never log access/refresh tokens, cookies, API/database/provider keys, authorization headers, raw stimulus, raw result/rationale, personal data, SQL bind values, full provider payload, or signed URL. Exception diagnostics use redacted structured fields. Non-production target retention is 14 days per [[../Data/DEMO_DATA_POLICY|Demo Data Policy]].

### Audit events

Audit is a restricted append-only domain record, not an application log. Record actor type/ID, organization, action, object type/ID, outcome, timestamp, correlation ID, source service, and minimal safe change metadata. Phase 2 actions: sign-in outcome metadata (without token), organization/project/stimulus/run create/update, cancel, terminal result publication, denied privileged action, deletion, and operator action. Membership mutation and export/share events begin only when those deferred paths exist.

Application roles cannot update/delete audit rows. Audit insertion failure blocks high-risk state changes where atomic; otherwise raises a security alert and marks evidence incomplete.

### Metrics

- HTTP: request count/duration by route template/status; auth/authorization denials; rate/quota rejections.
- Queue/run: depth/oldest age, claims, visibility extensions, duplicate deliveries, invalid transitions, state counts/duration, retries, cancellation latency, terminal failures, stuck leases.
- Provider: calls, timeouts, rate/schema/policy failures, tokens/cost, disabled/fallback attempt. Phase 2 provider call count must stay zero for external providers.
- Database: pool use, query duration by named operation, migration version, RLS test status; never raw query labels with tenant data.
- Product/trust: first-run completion, provenance view, disclosure comprehension only from consented research; no dark analytics.

### Initial objectives

Engineering budgets for local/CI are in [[../Product/ACCEPTANCE_CRITERIA|Acceptance Criteria]]. Staging trial objectives, measured over a rolling 30 days once staging exists:

- API availability `≥99.0%` excluding planned maintenance; authenticated read p95 `≤500ms`; run-create p95 `≤1s`, excluding queue completion.
- Deterministic mock terminal result p95 `≤10s`; `≥99%` of valid accepted mock runs reach a terminal state within 60 seconds.
- Oldest ready queue message `<60s` under declared test load; no lease remains expired/running beyond two visibility windows.
- Cross-tenant successful access and secret/raw-content log events: exactly `0`.

These are initial reliability targets, not observed performance or production commitments. Phase 5 load evidence may revise them through an ADR.

### Alert ownership

- Page release/on-call owner: cross-tenant/secret signal, API unavailable, queue oldest age >5 minutes, stuck run >2 visibility windows, terminal-failure rate >10% for 10 minutes.
- Ticket: objective burn, dependency drift, repeated retry, storage/retention cleanup miss, dependency vulnerability without active exploit.
- Every alert links to a runbook and has owner, severity, silence rule, and test. No owner means no production readiness.

Phase 2 emits OpenTelemetry-compatible traces and Prometheus-format metrics or equivalent internal measurements without provisioning an external vendor.

## Rejected options

- Log full payloads for debugging: confidentiality and deletion risk.
- Correlation IDs only in logs: users/support need a safe reference.
- Arbitrary production-grade SLO claim before measurements: false certainty.
- Treat audit log and debug log as the same store: incompatible access/retention/integrity needs.

## Consequences

- Debugging content failures uses explicitly authorized artifacts, not default logs.
- Metrics label cardinality must be reviewed.
- Staging must collect enough measurements before Phase 7 readiness.

## Rollback

Disable a faulty telemetry exporter without disabling audit or core service. Revert to local JSON/metrics, rotate any leaked telemetry credentials, purge exposed data where possible, and open an incident for forbidden-field emission.
