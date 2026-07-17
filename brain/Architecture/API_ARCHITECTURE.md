---
title: SIMULA API Architecture
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-17
owner: API architecture lead
classification: PROPOSED
source_of_truth: true
---

# SIMULA API Architecture

> Phase 1 approved contract design. No endpoint is implemented until Phase 2 begins.

## Contract principles

- OpenAPI is authoritative for HTTP contracts; JSON Schema for shared structured artifacts where appropriate.
- Strict request/response validation and generated strongly typed client.
- Explicit organization context and authorization on every tenant operation.
- Stable structured errors with correlation ID; no sensitive internal details.
- Idempotency keys for run creation and other retryable mutations.
- Pagination, filtering, sorting, and version semantics defined consistently.

## Resource groups

- Session/identity context.
- Organizations, workspaces, memberships, and invitations.
- Projects, stimuli, variants, and audiences.
- Datasets, frames, methods, prompts, and validation disclosures.
- Simulation runs, status, cancellation, results, comparisons, and exports.
- Ground-truth imports and evaluation summaries.
- Administration, health, readiness, usage, and audit events.

## Async run contract

Creation returns stable run ID and accepted state. Status is monotonic except explicitly modeled retry transitions. Duplicate requests with same tenant/idempotency key cannot create duplicate billable execution. Terminal failure exposes safe error class and retryability. Results bind to exact run/version metadata.

## Security

- Browser never receives database, worker, service-role, or provider credentials.
- Authorization enforced server-side even when RLS also applies.
- Export/share operations have explicit scope, expiration, revocation, and audit.
- Size/rate/complexity limits apply before expensive work.
- Exact Phase 2 request, rate, quota, timeout, worker, polling, and backpressure values: [[RESOURCE_LIMITS|Resource and Rate Limits]].
- Uploaded or user-controlled content is data, never trusted instructions.

## Compatibility

[[../Decisions/ADR-0005-API-AND-CONTRACT-COMPATIBILITY|ADR-0005]] defines exact Phase 2 routes, RFC 9457 errors, cursor limits, idempotency, `If-Match`, generated contracts, and additive-v1 policy.

## Phase 2 decisions

- REST plus bounded polling; realtime subscriptions/webhooks deferred.
- Browser Auth roles cannot reach application schemas through the Supabase Data API. FastAPI alone uses a TLS least-privilege Postgres connection, injects only verified JWT claims transaction-locally, reads through RLS, and writes through named atomic commands.
- Export/share absent per [[../Decisions/ADR-0010-EXPORT-SHARE-AND-STORAGE-SEAM|ADR-0010]].
- Organization membership management and broader administration are deferred.
- Exact authorization: [[AUTHORIZATION_MATRIX|Authorization and RLS Matrix]].

## Evidence-backed requirements

- E-4001: every Server Action, Route Handler, and API mutation repeats authorization close to data; middleware/proxy is only an early check.
- E-4005/E-4006/E-4025: Data API exposure, runtime-role privileges, command grants, and RLS are separate layers. Application schemas are not Data API exposed; `simula_api` has no direct mutation grants and retains tenant RLS.
- E-4008: provider output is untrusted input to the application and must pass schema/range/content handling before persistence/render.
- E-4013: OWASP API guidance requires object/function authorization, bounded resource use, SSRF controls, inventory, and safe third-party consumption.
