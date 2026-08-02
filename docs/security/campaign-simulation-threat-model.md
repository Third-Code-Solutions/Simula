---
title: Campaign Simulation Lab threat model
status: active
updated: 2026-08-01
classification: OBSERVED
---

# Scope

This model covers campaign research, population-weighted synthetic simulation,
survey calibration, and blind historical backtesting. SIMULA does not create
individual voter dossiers, infer political affiliation, rank individual
persuadability, or autonomously publish political content.

## Assets and trust boundaries

- Tenant campaign configuration, aggregate cohorts, variants, model metadata,
  reports, and immutable audit events.
- Consented aggregate survey observations and approved source provenance.
- Held-out historical outcomes. These are stored in a worker-only secret row
  while a blind backtest is evaluated and are deleted on completion, failure,
  cancellation, or retention expiry.
- API users and organization roles are untrusted at the tenant boundary.
- The API, worker, queue, model provider, Supabase schemas, and browser are
  separate trust boundaries.

## Threats and controls

| Threat | Control | Residual risk |
| --- | --- | --- |
| Cross-tenant or cross-project evidence access | Verified identity, organization RBAC, forced RLS, composite foreign keys, project-scope trigger | Requires live tenant-isolation tests and provider review |
| Outcome leakage into a prediction | Separate public request and worker-only secret payload; blind prediction contract; outcome-free API result | A compromised worker or database owner remains high impact |
| Identity or political targeting data import | Aggregate survey contract; adapter rejects identity and political fields; raw import is worker-only and deleted after terminal processing | Source-side misclassification still requires human rights review |
| Duplicate or replayed jobs | Idempotency receipt, database leases, retry bounds, CAS completion, event log | Operational replay needs live failure-injection coverage |
| False viral score | No `viral_score` field; deterministic population weighting, repetitions, calibration, and scoped backtest metrics | Synthetic evidence remains experimental without real admitted data |
| Sensitive data retained too long | Worker-only secret deletion and terminal artifact retention cleanup | Default 90-day policy must be monitored in production |
| Provider or model outage | Provider-neutral gateway, bounded timeouts, retry/dead-letter state, safe errors | External provider availability and cost remain operational risks |

## Required operational checks

Before production validity claims, run tenant-isolation, cancellation, retry,
retention, backup/restore, dependency-outage, and browser authorization checks.
Review logs for payload leakage and verify that metrics are labeled synthetic,
survey-calibrated, or historically backtested rather than presented as election
predictions.
