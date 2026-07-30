---
title: SIMULA Observability Alert Runbook
status: approved-for-staging
created: 2026-07-29
updated: 2026-07-29
owner: SRE lead
classification: PROPOSED
source_of_truth: true
---

# SIMULA Observability Alert Runbook

## Safety boundary

Use correlation and trace IDs to locate operational records. Never paste a
stimulus, result, agent rationale, user or tenant identifier, bearer token,
cookie, signed URL, provider payload, or database bind value into Sentry,
traces, dashboards, tickets, or chat.

Telemetry export can be disabled independently with
`SIMULA_TELEMETRY_ENABLED=false`. This does not disable audit records, local
structured logs, Prometheus metrics, readiness, or run-control enforcement.

## Required dependency unavailable

1. Check `/health/ready` and identify the bounded dependency label.
2. Check the matching database, Redis, rate-limit, auth, or run-admission
   readiness signal.
3. Do not bypass fail-closed admission. Restore the dependency or roll back the
   release.
4. Resolve only after five clean minutes and one authenticated canary request.

## Queue backlog

1. Compare queue depth, oldest-ready age, worker readiness, Redis memory, and
   durable queued/running state.
2. Confirm the exact release SHA and worker queue transport before scaling.
3. If poison or Redis pressure activated run control, follow
   [[RUNBOOK_RUN_CREATION_DISABLED]].
4. Resolve only after age is below 60 seconds and a queued canary reaches one
   terminal database result.

## Stuck run lease

1. Confirm worker database and queue readiness.
2. Inspect bounded lease and retry state by authorized operator tooling; never
   edit a run row directly.
3. Exercise the documented recovery command and verify the stale owner cannot
   publish a terminal result.
4. Resolve after the gauge is zero for two visibility windows.

## Terminal failure rate

1. Split failures by fixed provider-failure class and exact release.
2. Disable external provider admission if the failure is provider-related.
3. Compare against the previous release and roll back on a release regression.
4. Resolve after the ten-minute rate is below ten percent and a deterministic
   canary succeeds.

## RLS control missing

1. Stop release progression and disable new-run admission.
2. Confirm the database project, migration version, runtime role, and forced-RLS
   catalog evidence.
3. Do not repair through an application role. Use reviewed migration/operator
   authority.
4. Resolve only after pgTAP, cross-tenant HTTP, and runtime RLS gauges are green.

## Alert test and evidence

Before staging approval, induce each alert using disposable services or a test
rule override. Capture the alert firing and recovery timestamps, receiver,
owner acknowledgement, linked runbook, exact release SHA, and redaction review.
No alert is production-ready until delivery to the named on-call receiver and
recovery notification are proven.
