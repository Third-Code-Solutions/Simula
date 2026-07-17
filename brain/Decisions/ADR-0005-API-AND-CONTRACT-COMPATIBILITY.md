---
title: ADR-0005 API and Contract Compatibility
status: accepted
created: 2026-07-17
updated: 2026-07-17
owner: API and frontend leads
classification: PROPOSED
source_of_truth: true
---

# ADR-0005 — API and Contract Compatibility

## Context

The web, API, worker, database, and stored historical results need one contract authority and predictable failure behavior. Phase 2 must not create a BFF contract that diverges from FastAPI.

## Decision

### Authority and protocol

- FastAPI owns public HTTP behavior under `/api/v1` and emits OpenAPI 3.1.
- Pydantic models own request/response/result semantics. JSON Schema and TypeScript types are generated per [[ADR-0002-TOOLCHAIN-AND-GENERATED-CONTRACTS|ADR-0002]].
- JSON uses UTF-8, RFC 3339 UTC timestamps, UUID strings, lowercase snake_case fields, and string enums.
- Unknown request fields are rejected for commands. Read models may add optional fields within v1.
- Web calls FastAPI directly. Next route handlers exist only for Supabase Auth callback/session concerns; they do not duplicate domain endpoints.
- Supabase browser credentials authorize Auth only. Application schemas/functions are not Data API exposed; every domain command passes FastAPI limits/validation and a named complete atomic database helper. `simula_api` has no direct table mutation grant.

### Phase 2 resource surface

| Method/path | Purpose | Idempotency/concurrency |
|---|---|---|
| `GET /health/live` | Process liveness; no dependency details | none |
| `GET /health/ready` | Safe dependency readiness | none |
| `GET /api/v1/me` | Authenticated identity summary | none |
| `POST /api/v1/organizations` | Create organization plus owner membership | required idempotency key |
| `GET /api/v1/organizations` | List caller's organization memberships/roles | cursor |
| `POST /api/v1/organizations/{org_id}/projects` | Create project | required idempotency key |
| `GET /api/v1/organizations/{org_id}/projects` | List projects | cursor |
| `GET/PATCH /api/v1/projects/{project_id}` | Read/update project | PATCH requires `If-Match` |
| `POST /api/v1/projects/{project_id}/stimuli` | Create stimulus plus v1 | required idempotency key |
| `POST /api/v1/stimuli/{stimulus_id}/versions` | Append immutable version | required idempotency key |
| `GET /api/v1/audiences` | List admitted audiences | cursor/filter |
| `POST /api/v1/projects/{project_id}/runs` | Atomically freeze run + persist dispatch intent; best-effort publish after commit | required idempotency key |
| `GET /api/v1/runs/{run_id}` | State/progress/links | ETag |
| `POST /api/v1/runs/{run_id}/cancel` | Request cancellation | idempotent command |
| `GET /api/v1/runs/{run_id}/result` | Typed terminal result | `404` before publication |

No list endpoint is unbounded. Cursor tokens are opaque, signed or integrity-protected, and bind sort/filter scope. Default/max page size is `25/100`.

Exact request size, field, rate, object/run quota, dependency timeout, polling, worker concurrency, and queue-backpressure controls are authoritative in [[../Architecture/RESOURCE_LIMITS|Phase 2 Resource and Rate Limits]]. Stable errors add `request_too_large` and `queue_backpressure`.

### Organization boundary

- `POST /organizations` accepts trimmed `name` of 2–80 Unicode characters plus required idempotency/correlation context.
- Private atomic command helper commits organization, exactly one `owner` membership for the verified JWT subject, idempotency response, and create audit event in one transaction. A partial organization is impossible.
- Concurrent same-key/same-hash requests return the same `201` resource. Same key/different hash is `409 idempotency_key_reused`.
- `GET /organizations` returns only current subject memberships with organization ID/name/status/role; no membership roster.
- Phase 2 exposes no invite, add/remove member, change-role, leave, transfer-owner, organization update, or organization delete endpoint/command. Browser roles have no application-schema grants; `simula_api` has no membership C/U/D grant. Initial owner insertion occurs only inside `private.create_organization_atomic`; membership reads are self-only and cannot return a roster.
- Membership mutation/final-owner concurrency semantics are deferred to Phase 4 and cannot be inferred from Phase 2 tables.

### Cancellation response

- Cancellation performs one database CAS.
- CAS to `cancel_requested`: HTTP `202` with current run representation.
- Already `cancel_requested`: HTTP `202`, same representation.
- `succeeded`, `failed`, or `canceled` won first: HTTP `200`, existing terminal representation.
- Foreign run is non-enumerating `404`; visible but role-forbidden is `403`.

### Idempotency

- Mutating create endpoints require `Idempotency-Key`, 16–128 printable ASCII characters.
- Scope is authenticated subject + organization where present + method + normalized route + key.
- Store canonical request SHA-256, status, resource/response reference, and timestamps.
- Same scope/key/hash returns the original status/body. Same key with different hash returns `409 idempotency_key_reused`.
- Run-creation keys live as long as the run; other keys live at least 24 hours in non-production. Concurrency is serialized by a unique constraint, not an in-memory lock.

### Errors

Errors use `application/problem+json` compatible with RFC 9457:

```json
{
  "type": "https://simula.invalid/problems/validation-error",
  "title": "Request validation failed",
  "status": 422,
  "code": "validation_error",
  "detail": "One or more fields are invalid.",
  "instance": "/api/v1/...",
  "correlation_id": "uuid",
  "errors": [{"field": "name", "code": "too_short"}]
}
```

No stack, SQL, key, provider payload, foreign object existence, or confidential content appears. Stable codes: `unauthenticated`, `forbidden`, `not_found`, `validation_error`, `request_too_large`, `version_conflict`, `idempotency_key_reused`, `unsupported_scope`, `quota_exceeded`, `rate_limited`, `queue_backpressure`, `run_not_cancelable`, `dependency_unavailable`, and `internal_error`. `Retry-After` appears only when retry is safe.

### Compatibility

- Additive optional response fields and new endpoints are allowed in v1.
- Removing/renaming/changing meaning, tightening accepted input incompatibly, or changing enum handling requires v2 or a staged deprecation.
- Every stored result declares `schema_version`; readers support all non-retired versions or return an explicit unsupported-version problem.
- OpenAPI diff blocks accidental breaking changes. Contract examples are executable tests.
- CORS allowlists exact environment origins, methods, and headers; credentials never use wildcard origins.

## Rejected options

- tRPC/server actions as domain authority: couples API to web and excludes worker/external clients.
- Hand-authored OpenAPI separate from code: drift risk.
- HTTP 200 for all failures: destroys cache/monitoring/client semantics.
- Offset pagination: unstable and potentially expensive.

## Consequences

- FastAPI schema design precedes UI consumption.
- Generated-client diffs become reviewed API changes.
- Historical schema readers need explicit support/retirement policy.

## Rollback

Route traffic to the last compatible API release and web client. Additive database changes remain. Never restore an older server that cannot read extant result schema versions.
