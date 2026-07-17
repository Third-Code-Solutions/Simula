---
title: SIMULA Feature Catalog
status: active
created: 2026-07-17
updated: 2026-07-17
owner: Product lead
classification: PROPOSED
source_of_truth: true
---

# SIMULA Feature Catalog

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
