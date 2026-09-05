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


## Production release verified - 5 September 2026, 11:30 UTC

This section supersedes earlier application-release-pending statements while preserving their historical evidence. All seven application components now run source eb0ea931a180f1912f690be5648a6fb4a6557ab0: web, admin, API, control plane, dispatcher, worker and private engine. Required CI33961708123 and signed release33961707670 passed. Three release migrations are applied through20260905104327; V4 readiness remains available for rollback compatibility. Both canonical Vercel domains were promoted after protected-candidate checks.

The production smoke receipt passes52 assertions: exact public service SHA/health and frontend security headers; fresh synthetic owner/editor/viewer/nonmember sessions; application invitation acceptance; editor/viewer reads; viewer mutation, editor owner-only action, nonmember and platform-admin denials; signed-out API/browser boundaries; actual browser campaign submission, worker success, exact run restoration and visible Synthetic-only limits. A separate real behavioral run completed in about5 seconds with same-command durable ID replay, saved experimental deterministic result and artifact checksum. Six protected-candidate desktop/mobile checks and production result1440/390 checks had zero Axe violations, document overflow and page errors.

This is bounded production verification, not every route/role or scientific validity. Report/calibration/backtest complex lifecycle evidence remains local synthetic engineering proof; registry approval remains a separate administrator process. Hosted superadmin pagination beyond100, production recovery/load/retention and approved legal/privacy/terms text remain unverified or unresolved. Direct private SSH health checks were blocked by unavailable authorized keys; startup/config/image identities and an actual behavioral job provide fallback evidence, not direct private-endpoint coverage. Immediate publication means that job alone does not attribute dispatch to the dispatcher.

Evidence: production-smoke-verification.json, production-backend-promotion.json and production-frontend-promotion.json in docs/audit/2026-09-05, plus the release result and protected-candidate receipt. Promotion receipts retain the initial frontend failure and subsequent recovery; they are not a claim of an uninterrupted first attempt. Synthetic fixture records are retained by UUID, not existing-user replacements.

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
