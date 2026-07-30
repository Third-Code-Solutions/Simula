---
title: ADR-0011 NestJS and BullMQ Control Plane
status: accepted
created: 2026-07-29
updated: 2026-07-30
owner: Architecture platform and backend leads
classification: PROPOSED
source_of_truth: true
---

# ADR-0011 - NestJS and BullMQ Control Plane

## Context

The user selected NestJS for the backend control plane and BullMQ for background
transport. The current implementation uses FastAPI as the public domain API and
ARQ as the Redis transport. Replacing either in place would risk contract drift,
tenant bypass, queue loss, and an unrecoverable release.

ARQ is also tracked as maintenance-only under R-020. Python remains required for
the behavioral and AI execution stack.

## Decision

### Service ownership

- `apps/api` is the target public HTTP control plane on Railway.
- NestJS owns public request validation, Supabase JWT verification,
  organization/object authorization, idempotency, rate/quota admission,
  correlation, RFC 9457 failures, OpenAPI, and calls to named atomic database
  helpers.
- Python/FastAPI moves to a private AI-engine boundary. It owns methodology and
  provider execution contracts, not browser identity or public domain mutation.
- Python workers execute frozen run manifests and persist results only through
  least-privilege worker functions.

### Durable run authority

- Supabase PostgreSQL remains authoritative for runs, attempts, leases, events,
  outbox rows, idempotency, audit, results, and provider receipts.
- Redis and BullMQ are transport only. A missing job is recoverable from the
  outbox. A queue job never proves a run succeeded.
- A NestJS request cannot enqueue before its database transaction commits.
- Only the dispatcher may publish an outbox row. Publication confirmation
  requires exact job ID, queue, job name, schema version, run ID, and dispatch
  generation binding.
- BullMQ jobs contain identifiers and dispatch metadata only. They contain no
  stimulus, audience profile, tenant identifier, provider secret, or result.

### Queue contract

Initial job contract:

```json
{
  "schema_version": 2,
  "run_id": "uuid",
  "dispatch_generation": 1
}
```

- Queue name: `simula-behavioral-runs-v2`.
- Job name: `execute-behavioral-run-v2`.
- Job ID: `run-<uuid>-generation-<integer>`.
- BullMQ failure attempts: one. A pinned Python consumer may move an active job
  directly to delayed only for the existing database-authorized
  pre-confirmation, organization-capacity, or provider-retry disposition.
  These bounded deferrals do not increment `attemptsMade`; the database still
  owns execution-attempt and dispatch-generation caps.
- Completion/failure retention is bounded. Payload size and unknown fields fail
  closed before publication.
- Redis TLS, authentication, no-eviction, timeouts, concurrency, and graceful
  shutdown are environment-owned and tested before staging.

### Compatibility and migration

- ADR-0005 remains authoritative for the existing `/api/v1` surface until
  NestJS golden-contract parity passes.
- NestJS may expose only unversioned health endpoints during the foundation
  slice. New domain behavior uses compatibility-reviewed `/api/v2`.
- NestJS OpenAPI is generated separately during migration. It does not silently
  overwrite the current FastAPI contract.
- ADR-0006 remains authoritative for the durable PostgreSQL state machine,
  leases, retries, cancellation, recovery, and outbox semantics.
- This ADR supersedes ADR-0006 only for the target Redis client/queue transport.
- Traffic and queue publication move behind independent feature flags. Dual
  execution is prohibited; comparison uses shadow reads or fixture replays.
- PostgreSQL owns a forced-RLS singleton active-transport record. Worker claim
  boundaries take a shared transaction advisory lock and reject inactive
  transport; the audited operator switch takes the exclusive form of the same
  lock and rejects unless admission is disabled and durable work is drained.
  Environment flags select process startup but cannot override this database
  authority.
- ARQ remains a disabled rollback option until BullMQ passes the complete
  database/Redis crash-and-recovery equivalence gate.
- Python BullMQ `2.14.0` is a temporary exact compatibility pin because it is
  the newest inspected release compatible with the Redis 5 client required by
  the ARQ rollback path. Its active-to-delayed adapter uses pinned package
  internals and must retain live conformance proof. A later package/Redis
  upgrade or Node-consumer/private-Python-engine design requires a new ADR
  amendment; no silent dependency upgrade is allowed.

### Security and claims

- Supabase browser credentials remain Auth-only. Application schemas are not
  browser Data API surfaces.
- `simula_api` keeps no direct table mutation grants. Complete commands remain
  named database functions under forced RLS and verified transaction claims.
- Public health failures disclose no Redis address, credentials, topology, or
  raw error.
- Real-provider admission still requires ADR-0007 controls and independent
  validation. A stack migration does not make behavioral output valid.

## Rejected options

- Big-bang replacement: no safe contract, state, or queue rollback.
- NestJS and FastAPI both mutating the same run: duplicate work and ambiguous
  authority.
- BullMQ as the source of truth: Redis loss would lose durable business intent.
- Publishing full stimuli/audiences in jobs: confidentiality and payload drift.
- Automatic BullMQ retries: conflicts with database-owned attempts and budgets.

## Consequences

- The migration has temporary code and operational cost.
- The official Python client remains pre-stable and materially raises
  compatibility risk. Exact pins, strict wrappers, live Redis proof, and
  production rejection remain mandatory until full equivalence passes.
- Golden-contract, queue-equivalence, and dual-read evidence are mandatory.
- Python remains first-class but narrows to the workload where it is strongest.
- Production traffic stays on the existing path until the new path passes its
  milestone gates.

## Rollback

Disable NestJS traffic and BullMQ publication, keep the durable outbox pending,
route public traffic to the last compatible FastAPI release, and resume the
schema-compatible ARQ dispatcher only after exact queue ownership is verified.
Never execute both consumers against the same dispatch generation.
