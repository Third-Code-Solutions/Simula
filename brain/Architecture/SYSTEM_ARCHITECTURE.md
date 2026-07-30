---
title: SIMULA System Architecture
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-30
owner: Architecture lead
classification: PROPOSED
source_of_truth: true
---

# SIMULA System Architecture

> Phase 1 approved architecture for the experimental Phase 2 slice. No competitor architecture is claimed.

## Baseline context

- Web: Next.js/TypeScript on Vercel.
- API and workers: Python/FastAPI and asynchronous workers on Railway.
- Source of truth, authentication, and private assets: Supabase PostgreSQL/Auth/Storage with RLS.
- Contracts: OpenAPI/JSON Schema and generated clients.
- Model providers: internal provider-neutral interface.

These are `PROPOSED`/mandated SIMULA constraints from the bootstrap brief, not competitive evidence.

## Logical boundaries

- Identity and tenancy.
- Projects/studies and stimuli.
- Audience/data registry.
- Simulation orchestration and queue.
- Provider adapters and model-policy boundary.
- Aggregation/evaluation.
- Reports, exports, and feedback.
- Administration, audit, observability, and feature control.

## Trust boundaries

- Browser to Vercel application.
- Web/server to Supabase and API.
- API to database/storage/queue.
- Worker to data, model providers, and result storage.
- Internal administration to control plane.
- Export/share recipient boundary.

## Core architecture requirements

- Organization-scoped ownership path and authorization at every service boundary.
- RLS as defense in depth, not replacement for API checks.
- Separate least-privilege API/worker database credentials remain server-only; Supabase service-role keys are absent in Phase 2.
- Async jobs idempotent, retryable, cancelable where feasible, and terminally fail-safe.
- Numerical/calibration logic independent from qualitative generation.
- Immutable version references for data, method, prompt, provider/model, stimulus, audience, and run parameters.
- Correlation identifiers across web, API, queue, worker, provider call, and audit event.
- Explicit timeouts, quotas, rate limits, and denial-of-wallet controls.

Approved Phase 2 values and failure behavior: [[RESOURCE_LIMITS|Resource and Rate Limits]].

## Deployment environments

Local, test, preview, staging, and production with separate secrets and data. Environment promotion must not silently change model, prompt, method, or data version.

## Approved request and job flow

1. Next.js refreshes Supabase session and sends the access token to FastAPI.
2. FastAPI validates JWT/JWKS and authorizes the route/object.
3. FastAPI opens an explicit TLS Postgres transaction as least-privilege `simula_api`, installs allowlisted claims from the verified JWT with transaction-local scope, and reads through RLS. Browser `anon`/`authenticated` roles cannot reach any application schema over the Data API.
4. Every write calls a named invoker wrapper/private atomic command helper; `simula_api` has no direct table mutation grant. Run creation persists the frozen run plus transactional outbox. FastAPI may best-effort publish the run-ID-only job to private Railway Redis but cannot confirm dispatch.
5. Private Railway worker/dispatcher uses separate least-privilege `simula_worker`, repairs pending outbox dispatch, alone confirms proven Redis enqueue/deduplication, and consumes strictly decoded ARQ jobs. Before any manifest access it atomically binds ARQ context job ID/payload run/generation to a confirmed current outbox row through the named execution-claim helper; named heartbeat/complete/fail helpers own lease/retry/state transitions, deterministic mock execution, and one immutable result.
6. Web polls the authorized run endpoint with bounded backoff; realtime/subscription is deferred.

## Current target-control-plane overlay

ADR-0011 supersedes the Phase 2 public-runtime composition without weakening
its database authority: Next.js calls authenticated NestJS `/api/v2`; the
Python/FastAPI service is private behavioral computation; BullMQ is the target
identifier-only transport; PostgreSQL remains authoritative and ARQ remains
the rollback path until hosted cutover proof.

Owner-triggered organization deletion is a durable cross-service saga:

1. NestJS validates exact-name confirmation and a canonical idempotent request.
2. PostgreSQL records the pending request plus bounded run/object manifest,
   disables the organization, and freezes membership/role-based commands.
3. PostgreSQL seeds a durable cache/run/storage cleanup ledger. NestJS may
   process it immediately; the private dispatcher leases and resumes any due
   rows abandoned by the request path.
4. Each worker pass verifies private-object absence, removes every BullMQ
   generation for a run, or deletes only exact organization-bound Redis keys.
   Completion requires the current unexpired lease; failure records a fixed safe
   code and bounded retry time.
5. Only after every cleanup row is complete may either the request path or the
   worker finalizer cascade the organization graph, purge the resource ledger,
   and minimize the surviving tombstone.
6. Any external failure leaves the durable request pending; it never reports
   completed or deletes relational authority early.

Architecture decisions:

- [[../Decisions/ADR-0002-TOOLCHAIN-AND-GENERATED-CONTRACTS|ADR-0002 — Toolchain]]
- [[../Decisions/ADR-0003-IDENTITY-TENANCY-AND-RLS|ADR-0003 — Identity and RLS]]
- [[../Decisions/ADR-0004-DATA-MODEL-VERSIONING-AND-LIFECYCLE|ADR-0004 — Data lifecycle]]
- [[../Decisions/ADR-0005-API-AND-CONTRACT-COMPATIBILITY|ADR-0005 — API contracts]]
- [[../Decisions/ADR-0006-QUEUE-AND-RUN-STATE-MACHINE|ADR-0006 — Queue/state]]
- [[../Decisions/ADR-0007-PROVIDER-BOUNDARY-AND-MOCK|ADR-0007 — Provider boundary]]
- [[../Decisions/ADR-0008-ENVIRONMENTS-DEPLOYMENT-AND-MIGRATIONS|ADR-0008 — Deployment]]
- [[../Decisions/ADR-0009-OBSERVABILITY-AUDIT-AND-SERVICE-OBJECTIVES|ADR-0009 — Observability]]
- [[../Decisions/ADR-0010-EXPORT-SHARE-AND-STORAGE-SEAM|ADR-0010 — Export deferral]]
- [[../Decisions/ADR-0013-GOVERNED-PGVECTOR-RETRIEVAL|ADR-0013 — Governed pgvector retrieval]]
- [[../Decisions/ADR-0014-PRIVATE-STIMULUS-ASSET-PIPELINE|ADR-0014 - Private stimulus assets]]
- [[../Decisions/ADR-0015-ASSET-BOUND-TECHNICAL-IMAGE-PROFILE|ADR-0015 - Technical image profile]]

## Public technology constraints and sources

- E-4001: Next.js guidance requires secure authorization near protected data; proxy checks alone are insufficient.
- E-4002: Vercel Functions are bounded request compute, not durable simulation workers.
- E-4003/E-4004: Railway supports independently deployed API/worker services and runtime private networking.
- E-4005/E-4006: Supabase schema privileges and Data API exposure govern reachability; SIMULA leaves application schemas unexposed and still applies RLS to the server role.
- E-4025: Supabase supports dedicated Postgres roles and persistent-backend direct/session-pooler connections; runtime credentials must be least privilege and TLS-protected.
- E-4023/E-4024: Railway can host private Redis; ARQ provides deferred retry/pessimistic execution, while SIMULA still requires transactional outbox and idempotent consumers.
- E-4008/E-4009: OWASP and NIST require separate prompt-injection, output, agency, disclosure, resource, supply-chain, lifecycle, and evaluation controls.

## Phase 2 implementation boundary

- Next.js on Vercel owns browser experience and session refresh, not domain authority.
- FastAPI on Railway owns stable domain contracts, rate/resource enforcement, verified-claim injection, and server authorization; its database role has no direct mutation grant.
- Separate private Railway worker/dispatcher consumes ARQ jobs from private Railway Redis.
- Supabase owns Auth, Postgres, RLS, migrations, and later private Storage. Railway Redis/ARQ owns queue transport.
- Postgres is authoritative for run state, idempotency, versions, result, and audit.
- Phase 2 mock has no external model/data egress.
- Export/share, uploads, realtime progress, real provider, official/microdata audiences, evaluation, and production are deferred.
