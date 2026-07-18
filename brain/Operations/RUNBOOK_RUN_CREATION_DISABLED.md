---
title: Run Creation Disabled Runbook
status: approved-for-prototype
created: 2026-07-18
updated: 2026-07-18
owner: Release on-call
classification: OBSERVED
source_of_truth: true
---

# Run Creation Disabled Runbook

## Trigger and ownership

The worker emits `run_creation_disabled` with `severity=page`, `alert_owner=release_on_call`, `silence_rule=recovery_verified`, and this runbook path when the durable database control disables new runs. Phase 2 validates this local structured-alert contract; a hosted pager/contact route is not provisioned.

## Immediate response

1. Acknowledge the event. Record its timestamp, environment, release SHA, reason, and correlation/trace context. Never copy stimulus or result content into the incident record.
2. Confirm the durable control and backlog from the database using the least-privilege operator path. Do not bypass the latch or edit run rows directly.
3. Stop new run traffic if the API is not already returning the safe disabled response. Keep reads, audit, and existing terminal results available.
4. Inspect API/worker structured logs and metrics for queue age, dispatch recovery, poison/retry exhaustion, dependency readiness, rejections, database pool/query health, migration/RLS status, durable run states, cancellation age, duplicate delivery, visibility extension, and stuck leases.
5. If state may be corrupt, pause dispatcher/worker consumption. Preserve PostgreSQL intent and Redis evidence; do not flush Redis or rewrite terminal state.

## Recovery

1. Repair the dependency or code/configuration mismatch. Use the exact release SHA and checked-in migration head.
2. Run `pnpm verify` against disposable local services. Require exit 0.
3. Verify pending work reconciles from PostgreSQL without duplicate results, false confirmation, or extra provider work.
4. Use the audited operator recovery command to clear the durable disable control. Never clear it by direct table mutation.
5. Confirm run creation, one terminal deterministic result, queue/backlog recovery, and normal readiness/metrics.

## Silence and close

Silence only after `recovery_verified`: the cause is repaired, the root gate passes, the audited recovery command succeeds, run creation works, and backlog/alerts remain stable through one bounded observation window. Record owner, evidence, rollback, and follow-up. Recurrence reopens the incident.

## Escalation

Treat tenant exposure, secret/provider egress, misleading result integrity, or destructive state loss as SEV-0 under [[INCIDENT_RESPONSE|Incident Response]]. Treat sustained run unavailability, poison exhaustion, or audit loss as SEV-1. Phase 2 has no formal 24x7 contact tree; staging requires named humans and a tested delivery route.
