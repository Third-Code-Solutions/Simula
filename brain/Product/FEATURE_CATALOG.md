---
title: SIMULA Feature Catalog
status: active
created: 2026-07-17
updated: 2026-09-05
owner: Product lead
classification: PROPOSED
source_of_truth: true
---

# SIMULA Feature Catalog

## Implementation checkpoint - 5 September 2026

The original scope table below is historical planning, not a deployment inventory. See [current project state](../PROJECT_STATE.md) and [finding tracker](../../docs/audit/2026-09-05/REMEDIATION_TRACKER.md).

| Capability | Current evidence | Remaining boundary |
| --- | --- | --- |
| Public/auth/workspace UX | Local redesigned routes and real owner navigation | Full role matrix and new production smoke pending |
| Campaign simulation/history | Real local API/worker success and refresh restoration | Synthetic-only; no population prediction |
| Survey/calibration bindings | Saved immutable source/payload/run bindings used by real local report flow | Rights and independent research validity remain separate |
| Bound reports | Local independent approval/export/revocation and self-review denial verified | Migration/application not live; engineering fixtures only |
| Held-out backtests | Real local preregistration, later independent source, custodian upload, bound result/refresh; revoked-source bound and legacy reads denied422 | Registry approval separate; synthetic scoped comparison, no scientific accuracy or deployment claim |
| Admin inventory | Real local Auth/API/admin pagination beyond100, filter/reload and mobile checks pass | Hosted large-directory pagination remains unverified |
| Runtime recovery | Local process deadlines/capacity and queue crash drills | Hosted load/recovery and shutdown attribution pending |

## Original planned scope

| Module | Capability | Phase | Status | Gate |
|---|---|---:|---|---|
| Identity | Auth, organization, owner/editor/viewer roles | 2 | Approved scope | Server authorization + RLS tenant tests |
| Projects | Name, objective, market, language, category | 2 | Approved scope | Tenant isolation + optimistic version |
| Stimuli | One text stimulus and immutable versions | 2 | Approved scope | Confidential by default, validation |
| Demo audience | One authored, non-representative fixture | 2 | Approved scope | Prominent experimental label |
| Simulation | Async idempotent deterministic mock path | 2 | Approved scope | Retry/failure/provenance/E2E |
| Basic report | Typed structured result and limitations | 2 | Approved scope | No false precision or participant fiction |
| Population registry | Dataset/frame/version/provenance | 3 | Candidate | Rights and validation gates |
| Method engine | Sampling, aggregation, uncertainty | 3 | Candidate | Deterministic/property/evaluation tests |
| Provider adapters | Mock plus approved real providers | 3 | Candidate | Schema, timeout, quota, data handling |
| Audience builder | Provenance-aware cohort definition | 4 | Candidate | No invented joint distributions |
| Variants/comparison | Comparable runs and differences | 4 | Candidate | Configuration compatibility |
| Full report | Segments, disagreement, uncertainty | 4 | Candidate | Construct and accessibility review |
| Export/share | Authorized reports and artifacts | 4 | Candidate | Scope, expiry, revocation, audit |
| Feedback | Human/outcome ingestion | 4 | Candidate | Separate store and leakage control |
| Admin | Versions, failures, audit, flags, usage/cost | 4 | Candidate | Least privilege |
| Media stimulus | Image/multimedia | Later | Deferred | Upload/model/privacy safety review |
| Billing/payment | Gateway/subscriptions | None | Excluded | Repository non-goal |

## Release rule

Phase number is a hypothesis until its ExecPlan is approved. A feature moves to complete only with acceptance tests, security review, documentation, observability, rollback, and Obsidian evidence.
