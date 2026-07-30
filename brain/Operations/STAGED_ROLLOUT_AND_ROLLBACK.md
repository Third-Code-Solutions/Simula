---
title: SIMULA Staged Rollout and Rollback
status: approved-for-staging
created: 2026-07-29
updated: 2026-07-30
owner: Release lead
classification: PROPOSED
source_of_truth: true
---

# SIMULA Staged Rollout and Rollback

## Non-negotiable rules

- One public control plane and one queue consumer transport are active at a
  time. Never dual-write or dual-consume.
- PostgreSQL run/outbox/attempt/result state is authority. Redis is transport.
- Production migration rollback uses an application rollback plus a reviewed
  forward corrective migration. Do not run an unreviewed down migration.
- Behavioral output remains disabled until the database, provider, browser,
  accessibility, telemetry, recovery, and approval gates pass.
- Record exact image/artifact digests and `SIMULA_RELEASE_SHA` at every step.

## Before rollout

1. Verify the signed archive, Sigstore bundle, checksums, workflow identity,
   exact commit, SBOM/SCA/secret gates, and source-map/redaction review.
   Generate one rollout UUID and bind every server runtime to the same
   `SIMULA_RELEASE_SHA`, `SIMULA_RELEASE_BUNDLE_SHA256`,
   `SIMULA_RELEASE_SIGSTORE_BUNDLE_SHA256`,
   `SIMULA_RELEASE_PROVENANCE_URL`, and
   `SIMULA_PRODUCTION_ROLLOUT_ID`. Set
   `SIMULA_PRODUCTION_ADMISSION_ENABLED=true` only after verification.
2. Capture a checksumed database backup and prove a restore at the exact
   repository migration head.
3. Confirm run creation is enabled, queue age is below 60 seconds, no stuck
   lease exists, and current API/worker readiness is green.
4. Set and verify rollback defaults:
   `NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION=v1`,
   `SIMULA_NEST_DOMAIN_ENABLED=false`,
    `SIMULA_WORKER_QUEUE_TRANSPORT=arq`,
    `SIMULA_BEHAVIORAL_ENGINE_TRANSPORT=disabled`,
    `SIMULA_ASSET_STORAGE_ENABLED=false`,
    `SIMULA_BEHAVIORAL_DEMO_ENABLED=false`, and
   `SIMULA_TELEMETRY_ENABLED=false`.

## Staging sequence

1. Apply additive migrations through the attested head; set
   `SIMULA_DATABASE_MIGRATION_HEAD` to that exact compiled head; run pgTAP, generated
   database types, trigger/backfill, RLS, storage, deletion, and cross-tenant
   HTTP proofs.
2. Deploy the private AI engine with deterministic provider admission only.
   Keep `SIMULA_BEHAVIORAL_ENGINE_TRANSPORT=disabled`.
3. Deploy the BullMQ-capable worker while ARQ remains active, but do not start
   the BullMQ consumer.
4. Disable admission, drain ARQ, and prove no active lease or unresolved
   outbox:

   ```text
   pnpm operator:run-control -- disable --correlation-id <uuid>
   pnpm operator:queue-transport -- status
   ```

   Then switch durable ownership:

   ```text
   pnpm operator:queue-transport -- set-bullmq --correlation-id <uuid>
   ```

   The database rejects the switch unless admission is disabled and durable
   work is drained. Stop the ARQ worker/dispatcher, set
   `SIMULA_WORKER_QUEUE_TRANSPORT=bullmq`, start exactly one NestJS dispatcher
   and one BullMQ consumer, and run duplicate/crash/cancel/Redis-loss recovery
   canaries. Keep Railway dispatcher deployment overlap at zero.
5. Deploy the NestJS control plane with `SIMULA_NEST_DOMAIN_ENABLED=true` while
    the web remains on `NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION=v1`. Prove
    authenticated parity directly.
6. Provision server-only Supabase S3 keys, enable
   `SIMULA_ASSET_STORAGE_ENABLED=true`, and prove private JPEG/PNG/PDF/WebP/MP4
   reserve/upload/download/delete, retention expiry, hash mismatch,
   cross-tenant denial, and readiness canaries. Confirm no browser Storage
   policy or credential exists.
7. Enable `SIMULA_TELEMETRY_ENABLED=true`; inspect one induced scrubbed error,
    one API-to-worker trace, dashboard data, alert firing, acknowledgement, and
    recovery.
8. Switch a bounded web canary to
    `NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION=v2`. Prove desktop/mobile,
    keyboard/screen-reader/Axe, API/data, export, and audit journeys.
9. Enable private deterministic behavioral transport, then the behavioral UI,
    for an approved internal cohort only. No external provider is admitted.

## Automatic rollback triggers

- Any cross-tenant success, forced-RLS failure, secret/content telemetry event,
  duplicate terminal result, unbound provider receipt, or mismatched release
  identity.
- API readiness failure for five minutes, queue oldest age above five minutes,
  a stuck lease beyond two visibility windows, or terminal failure rate above
  ten percent for ten minutes.
- Contract/client drift, browser regression, unsupported claim, or inability to
  verify the release signature, certificate identity, or transparency proof.

## Rollback sequence

1. Disable `SIMULA_BEHAVIORAL_DEMO_ENABLED` and new-run admission. Preserve
   durable state.
2. Return web traffic to `NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION=v1`.
3. Disable `SIMULA_NEST_DOMAIN_ENABLED`; route to the attested FastAPI rollback
   API.
4. Stop the NestJS dispatcher and BullMQ consumer. Reconcile
   confirmed/outstanding outbox state and wait for active leases to close or
   expire. Verify admission remains disabled, then execute:

   ```text
   pnpm operator:queue-transport -- status
   pnpm operator:queue-transport -- set-arq --correlation-id <uuid>
   ```

   Set `SIMULA_WORKER_QUEUE_TRANSPORT=arq`, start one ARQ consumer, and prove one
   terminal result. Never run both consumers.
5. Set `SIMULA_BEHAVIORAL_ENGINE_TRANSPORT=disabled`.
6. Set `SIMULA_ASSET_STORAGE_ENABLED=false`. Preserve database lifecycle state
   and private objects for reconciliation; do not expose the bucket directly.
7. If vendor export caused the incident, set
    `SIMULA_TELEMETRY_ENABLED=false`; retain local logs, metrics, audit, and
    readiness.
8. Roll back application artifacts by verified digest. Use a reviewed forward
    database correction only when the additive schema itself is defective.
9. Run readiness, authenticated canary, queue recovery, one terminal result,
   browser, data, and alert-clear proof before reopening admission.

## Drill evidence

Record owner, environment, start/end, exact source and rollback digests,
migration head, pre/post queue/outbox/lease state, trigger, commands/actions,
readiness, browser/API/data results, alert delivery/clear timestamps, restore
artifact checksum, data loss/duplicate/cost assessment, and follow-up. A
documented sequence without a staging execution is not a completed drill.

E-5064 proves the database fence and a disposable local
ARQ-to-BullMQ-to-ARQ cutover subset. It does not complete this drill because it
does not use hosted dependencies and does not produce a terminal result through
an ARQ consumer after rollback.
