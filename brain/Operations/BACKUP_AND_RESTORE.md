---
title: SIMULA Backup and Restore
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-18
owner: Data and SRE leads
classification: PROPOSED
source_of_truth: true
---

# SIMULA Backup and Restore

## Scope

PostgreSQL data, storage objects, configuration/version registries, evaluation artifacts, infrastructure/configuration definitions, audit records, and essential documentation. Provider-managed data and exports need explicit coverage decisions.

## Requirements

- Git-tracked code/migrations/fixtures: RPO one accepted commit; RTO 30 minutes from a clean clone.
- Local/CI databases: disposable; rebuild from migrations/seeds within 15 minutes; no backup dependency.
- Preview: disposable synthetic data; rebuild target 30 minutes; no user-content recovery promise.
- Staging once provisioned: target RPO 24 hours and RTO 4 hours until measured/provider capability is verified.
- Production RPO/RTO is `UNKNOWN` and blocks production authorization.
- Backups encrypted, access-controlled, monitored, version-compatible, and separated from normal operator credentials where feasible.
- Restore procedure covers database, storage, version references, auth dependencies, queue state, and application compatibility.
- Restore tests use isolated environments and synthetic or appropriately protected data.
- Evidence records backup version, checksum where applicable, start/end, errors, operator/service, restore test, and deletion expiry.
- Retention reconciles recovery, contract, privacy, deletion, and legal-hold needs.

## Phase 2 evidence

`OPS-RESTORE-001` creates a checksumed full PostgreSQL dump, restores it into a separate isolated database, verifies application row counts and migration head `20260719040000`, and removes the temporary database/artifact. It runs inside root `pnpm verify` and CI. This proves synthetic Phase 2 database recoverability only; runtime-role ACL/Auth/API/worker compatibility and provider-managed services remain staging drill requirements.

## Failure cases

Regional/service outage, accidental deletion, corrupt migration, compromised credentials, malicious deletion, inconsistent database/storage state, lost queue state, and invalid model/data configuration.

## Remaining production decisions

Provider-native point-in-time recovery, storage versioning, cross-region need, independent audit retention, key recovery, contractual retention, legal hold, and verified deletion propagation must be decided and drilled in Phase 5–7. Restore tests reapply deletion tombstones before reopening traffic.
