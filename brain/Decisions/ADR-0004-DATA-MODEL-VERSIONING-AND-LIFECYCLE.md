---
title: ADR-0004 Data Model Versioning and Lifecycle
status: accepted
created: 2026-07-17
updated: 2026-07-17
owner: Data and architecture leads
classification: PROPOSED
source_of_truth: true
---

# ADR-0004 — Data Model, Versioning, and Lifecycle

## Context

Runs must be reproducible while user content remains deletable. Predictions must not be overwritten by later ground truth. Tenant ownership must remain mechanically testable.

## Decision

### Phase 2 entities

| Schema | Entity | Mutability and key invariant |
|---|---|---|
| `api` | `organizations` | Mutable name/status; immutable ID |
| `api` | `organization_memberships` | Unique `(organization_id,user_id)`; role changes audited |
| `api` | `projects` | Mutable metadata with optimistic `version`; tenant path immutable |
| `api` | `stimuli` | Logical container; tenant path immutable |
| `api` | `stimulus_versions` | Append-only content/hash/version; unique `(stimulus_id,version)` |
| `api` | `audiences` | Logical container; Phase 2 global demo record is read-only |
| `api` | `audience_versions` | Append-only manifest/checksum; type `authored_demo` in Phase 2 |
| `api` | `simulation_runs` | Frozen manifest and state; one idempotency identity |
| `api` | `simulation_results` | Immutable terminal artifact; unique `run_id` |
| `private` | `run_attempts` | Append-oriented attempt/lease/error/cost history |
| `private` | `run_events` | Append-only state transition history |
| `private` | `run_outbox` | Durable Railway-queue dispatch intent, claim, retry, confirmation, and error |
| `private` | `idempotency_keys` | Unique scope/key plus request hash and response reference |
| `private` | `audit_events` | Append-only actor/action/object/correlation metadata; no raw content |

Phase 3+ reserved entities: dataset/frame/method/prompt/provider/config versions and evaluation registry. Phase 4+ reserved entities: ground-truth datasets, feedback, report artifacts, exports/share grants. Reservations are contract seams, not Phase 2 tables unless needed by a migration.

### Ownership and references

- Tenant tables carry `organization_id` even when derivable. Composite foreign keys include it, preventing cross-tenant parent references.
- IDs are UUIDs generated server-side. Human-facing slugs are not authorization keys.
- All timestamps are timezone-aware UTC. Create/update actor and correlation context are recorded where material.
- A run references exact stimulus and audience versions and stores a canonical frozen manifest with SHA-256 hash, schema version, method/mock provider/config/code release, seed, and disclosure version.
- Database constraints enforce enum/state/range/uniqueness basics; Pydantic/JSON Schema enforce the full artifact contract.

### Immutability and corrections

- Version rows and results are never updated in place. Corrections create a new version/run and optionally mark a predecessor as superseded.
- Terminal run state and result are immutable except an audited lifecycle status such as deleted/retired.
- Ground truth, when admitted, is separately owned/versioned and linked to a run only through evaluation records. It never mutates historical output.
- Audit and run-event writers are restricted; application users receive no update/delete grants.

### Lifecycle

- Phase 2 environment/retention rules are authoritative in [[../Data/DEMO_DATA_POLICY|Demo Data and Admission Policy]].
- Deletion removes content and derived artifacts. Minimal non-content tombstone/audit metadata may remain under an approved purpose.
- A deleted run may retain hashes/version identifiers but not stimulus, response, or qualitative content.
- Queue/archive, storage, caches, provider copies, logs, exports, and backups are part of deletion verification.
- Production retention and legal holds are unresolved and block production deployment.

## Rejected options

- One mutable JSON document per project: weak constraints, lineage, and RLS paths.
- Fully normalized result metrics in Phase 2: premature; typed immutable artifact plus indexed summary fields is sufficient.
- Preserve all content forever for reproducibility: conflicts with deletion/minimization.
- Store ground truth inside result: contaminates prediction history.

## Consequences

- Some ownership fields are redundant by design and must be constraint-maintained.
- Deletion can reduce exact rerun capability; tombstones state that limitation.
- Result schema evolution needs readers for supported historical versions.

## Rollback

Before production data, reset local/preview databases and replay migrations. After persistent environments exist, use additive/forward corrective migrations; restore only under the approved backup runbook and reapply deletion tombstones.
