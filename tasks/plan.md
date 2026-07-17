# Phase 2 delivery plan

## Objective

Complete the remaining Phase 2 walking-skeleton milestones in dependency order, beginning with the trustworthy P2-05 run/result/provenance experience. Preserve the experimental, non-representative boundary and keep all hosted schema changes forward-only and evidence-backed.

## Milestones

1. Reconcile P2-04 closure in the active ExecPlan and inventory P2-05 requirements against the Obsidian brain and current source.
2. Close the P2-05 provenance/read-contract gap with additive, tenant-safe API/database changes and generated contracts.
3. Implement the P2-05 browser run, status, polling, result, provenance, and limitations journey with closed decoding and accessibility tests.
4. Run the P2-05 local gates; apply the ordered hosted migration only after local proof; record evidence; commit and push the green increment.
5. Implement P2-06 cancellation/retry/reconciliation in a separately verified increment.
6. Implement P2-07 telemetry, security/load/E2E, traceability, evidence, and independent exit review.
7. Audit Phase 2 exit criteria before opening any Phase 3-7 scope.

## Current decision

P2-05 cannot truthfully render AC-RES-002 from the existing result endpoint: it lacks a safe frozen provenance read projection and the stored frozen manifest lacks immutable code-release and limits identifiers. Resolve that contract gap before browser implementation.

## Constraints

- `brain/` is the authoritative Obsidian-readable source of truth.
- One vertical milestone at a time; no real provider, representative, export/share, or production claim.
- Hosted Supabase changes are ordered migrations only, after local reset/lint/pgTAP/contract proof.
- Every successful green build is committed and pushed to `origin/main`.
