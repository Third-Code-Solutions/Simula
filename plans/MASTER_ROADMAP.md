---
title: SIMULA Master Roadmap
status: active
created: 2026-07-17
updated: 2026-07-17
owner: Principal program and engineering lead
classification: PROPOSED
source_of_truth: true
---

# SIMULA Master Roadmap

## Delivery policy

- Complete phases in order. Each phase needs a reviewed ExecPlan and recorded validation evidence.
- Keep application work out of Phase 0.
- Keep production deployment and external production changes behind explicit authorization.
- Treat demo and unvalidated simulation output as experimental.
- Preserve evidence provenance, tenant isolation, reproducibility, and uncertainty disclosure throughout.

## Phase gates

### Phase 0 — Evidence and Discovery

**Outcome:** Cited public evidence, explicit unknowns, independent opportunity framing, and defensible Phase 1 inputs.

**Gate:** Five research streams complete; evidence matrix and ledgers audited; users, jobs, workflows, output patterns, differentiation, data/methodology needs, legal/ethical boundaries, risks, and Phase 1 entry criteria documented. No application code.

### Phase 1 — Product and Architecture Definition

**Outcome:** Review-ready PRD, methodology v0, data strategy, architecture, threat model, test/evaluation strategy, MVP scope, and implementation backlog.

**Gate:** Acceptance criteria are testable; architectural choices have ADRs; data and validation claims have provenance; security and privacy controls map to threats; MVP can be implemented without unresolved critical design decisions.

### Phase 2 — Walking Skeleton

**Outcome:** Thin end-to-end path from authentication through one asynchronous, explicitly experimental simulation result.

**Gate:** Critical path works locally and in compatible preview environments; tenant isolation, contracts, retry behavior, observability, and end-to-end test pass.

### Phase 3 — Methodology Prototype

**Outcome:** Versioned synthetic population, sampling, structured response, aggregation, uncertainty, reproducibility, evaluation harness, provider adapters, and cost controls.

**Gate:** Deterministic fixtures and repeated-run tests pass; numerical, heuristic, and qualitative outputs remain visibly separated; limitations are disclosed.

### Phase 4 — MVP Product

**Outcome:** Audience builder, variants, reports, comparison, exports, audit events, transparency, administration essentials, and feedback capture.

**Gate:** MVP journeys meet acceptance, accessibility, security, evaluation, and failure-state criteria.

### Phase 5 — Production Hardening

**Outcome:** Security, reliability, observability, performance, accessibility, recovery, dependency, and secret controls hardened.

**Gate:** Tenant-isolation and RLS review pass; load/security/failure tests meet targets; rollback, backup, restore, and incident procedures are verified; maintenance-only ARQ is reassessed and a tested queue-library migration/exit plan is approved before Phase 6.

### Phase 6 — Staging Release

**Outcome:** Staging deployment with seeded demo, end-to-end verification, load and failure testing, UAT, disclosures, and known-limitations report.

**Gate:** Staging release checklist accepted; no unresolved critical defect; operational owners and rollback path confirmed.

### Phase 7 — Production Readiness

**Outcome:** Evidence-backed production readiness package.

**Gate:** Final security and QA reviews pass; retention/deletion, monitoring, alerting, support, incidents, rollback, and release notes are approved. Actual production deployment still requires explicit authorization.

## Current phase

- Completed: [[completed/000-phase-0-evidence-and-discovery|Phase 0 — Evidence and Discovery]]
- Completed: [[completed/001-phase-1-product-and-architecture-definition|Phase 1 — Product and Architecture Definition]]
- Active: [[active/002-phase-2-walking-skeleton|Phase 2 — Walking Skeleton]]
- Next: Phase 3 — Methodology Prototype
