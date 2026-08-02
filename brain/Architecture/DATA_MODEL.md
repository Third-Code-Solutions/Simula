---
title: SIMULA Conceptual Data Model
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-30
owner: Architecture and data leads
classification: PROPOSED
source_of_truth: true
---

# SIMULA Conceptual Data Model

> Logical Phase 2 model approved by [[../Decisions/ADR-0004-DATA-MODEL-VERSIONING-AND-LIFECYCLE|ADR-0004]]. SQL migrations become implementation authority in Phase 2.

## Tenancy and identity

- User/profile.
- Organization and membership/role.
- Workspace and membership where distinct.
- Invitation.
- Audit event.
- Durable organization-deletion request/tombstone. It is private, survives the
  organization cascade, retains a bounded external-cleanup manifest only while
  pending, and minimizes that manifest on completion.
- Durable organization-deletion resource ledger. It is private, forced-RLS,
  request/organization bound, uniquely identifies cache/run/storage cleanup,
  and retains only bounded lease/retry state until completion purges it.

Every tenant-owned record needs a defensible organization ownership path; derived records cannot become orphaned from tenant authorization.

## Study domain

- Project/study.
- Project context/version.
- Stimulus and immutable stimulus version.
- Variant group.
- Audience definition/version.
- Simulation configuration/version.

## Data and methodology registry

- Dataset and dataset version.
- Source/license/provenance record.
- Population frame/version.
- Variable/codebook/transform record.
- Methodology version.
- Prompt/template version.
- Provider/model configuration version.
- Validation/evaluation status.
- Embedding model/version admission with artifact, rights, benchmark, and
  lifecycle evidence.
- Immutable context-node embedding bound to tenant, graph version, node-content
  checksum, model version, and vector checksum.

## Execution and results

- Simulation run and attempt.
- Job event/progress/error.
- Private transactional outbox plus a singleton queue-transport authority.
  Transport defaults to ARQ; an audited operator-only transition is serialized
  against worker claims and requires disabled admission, no non-terminal runs,
  and no pending/claimed outboxes.
- Sample/cell configuration reference.
- Structured response artifact.
- Aggregate estimate and segment estimate.
- Qualitative rationale and recommendation.
- Uncertainty/stability diagnostic.
- Cost/token/provider-call metadata.

Output classes must be explicit in schema so observed, calibrated, uncalibrated, heuristic, generated, and recommended content cannot be confused.

## Ground truth and evaluation

- Ground-truth source/study.
- Human response or aggregate outcome import.
- Prediction-to-observation linkage.
- Evaluation run, metric, slice, and result.
- Calibration artifact/version.

Ground truth remains separate from simulation results and retains its own consent, rights, and provenance.

## Lifecycle requirements

- Immutable or append-only versions for reproducibility-critical objects.
- Soft lifecycle status does not replace required deletion.
- Retention and deletion propagation across storage, exports, caches, providers, logs, and backups.
- Organization deletion is a saga: persist the request/manifest and disable the
  organization first; absence-verify storage, queue, and cache cleanup; cascade
  the relational graph last. A failed external step leaves a retryable pending
  request rather than a partial database deletion.
- Timestamps and actor/correlation context for material changes.

## Resolved Phase 2 decisions

- Organization is the only tenant boundary; workspace is deferred.
- Typed immutable result JSON plus indexed run summary fields; full metric normalization deferred.
- Versions/results are append-only; correction creates a successor.
- Content deletion retains at most approved non-content tombstone/audit metadata.
- Completed organization tombstones retain request/organization/actor,
  request/idempotency hashes, status, and timestamps; run/object manifests are
  replaced by empty arrays.
- Administration uses owner role, server authorization, explicit atomic commands, grants, and RLS.
- Table/function policy: [[AUTHORIZATION_MATRIX|Authorization and RLS Matrix]].

## Phase 1 RLS invariants

- All tenant tables include a non-null organization ownership path that cannot be reassigned outside authorized workflows.
- Default deny. Browser `anon`/`authenticated` roles have no application-schema grants. `simula_api` SELECT policies test the transaction-local verified subject's organization membership/role; command/worker-owner write policies are reachable only through named complete helpers.
- Command-owner UPDATE policies constrain both existing and resulting row ownership; `simula_api` has no direct mutation grant.
- Internal queue/provider/audit configuration belongs in a non-exposed schema with least-privilege grants.
- Views use invoker semantics or remain inaccessible to browser roles.
- FastAPI uses server-only least-privilege `simula_api`; worker/dispatcher uses separate `simula_worker`; no Supabase service-role key or caller-token Data API domain path exists. Every named command/helper emits the required tenant/run-scoped audit event.
- Cross-tenant adversarial tests cover each table and operation before merge.

Sources: E-4005, E-4006, and E-4025. Exact migration SQL and pgTAP tests are Phase 2 deliverables; ADR-0003/0004 and the authorization matrix are the specification.
