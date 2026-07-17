---
title: ADR-0003 Identity Tenancy and RLS
status: accepted
created: 2026-07-17
updated: 2026-07-17
owner: Security and architecture leads
classification: PROPOSED
source_of_truth: true
---

# ADR-0003 — Identity, Tenancy, and RLS

## Context

SIMULA contains confidential stimuli and tenant results. Next.js proxy checks alone are insufficient (E-4001). Supabase schema exposure, grants, and RLS are separate controls (E-4005, E-4006). Service/secret keys bypass RLS and cannot enter browsers.

## Decision

### Identity

- Supabase Auth is the identity authority. Phase 2 enables email/password locally; staging authentication method requires separate configuration review.
- Use asymmetric signing keys. FastAPI validates bearer JWTs against project JWKS and checks signature algorithm allowlist, `kid`, `iss`, `aud=authenticated`, `exp`, `nbf` where present, `sub`, and `role=authenticated`.
- JWKS cache is bounded to ten minutes and refreshed immediately on unknown `kid`; validation fails closed. Incident response can flush cache.
- Browser receives only Supabase URL and publishable key for Supabase Auth. Application schemas are not exposed through the Data API and `anon`/`authenticated` receive no application-schema privileges. Secret/service-role keys, database credentials, provider tokens, and worker credentials are server-only.
- Next.js `proxy.ts` refreshes sessions and performs optimistic navigation only. FastAPI and Postgres authorize every protected operation close to data.
- Authorization never trusts `user_metadata`. Organization role comes from the database.

Sources: [Supabase JWT guidance](https://supabase.com/docs/guides/auth/jwts), [signing keys](https://supabase.com/docs/guides/auth/signing-keys), [Next authentication guidance](https://nextjs.org/docs/app/guides/authentication).

### Tenancy and roles

- Tenant is `organization`. Membership roles are `owner`, `editor`, `viewer`.
- Every tenant-owned row has a non-null `organization_id` and a composite foreign-key ownership path.
- Reads require membership. Writes require owner/editor unless stated. Membership/organization deletion and role changes require owner.
- Object-not-found and object-forbidden responses do not reveal whether a foreign-tenant object exists.
- API receives a user JWT and validates it. FastAPI alone connects over TLS using the Supabase direct connection or Supavisor session mode selected by ADR-0008, with dedicated `simula_api` credentials. `simula_api` is `LOGIN`, `NOINHERIT`, `NOBYPASSRLS`, owns no objects, cannot `SET ROLE`, and has only named view/function privileges.
- Every API database operation runs in one explicit transaction. Before any domain statement, trusted API code sets `request.jwt.claims` transaction-locally from the already verified allowlisted claims (`sub`, fixed `role=authenticated`, `iss`, `aud`, `exp`); rollback/commit clears them before pool return. RLS and private helpers therefore evaluate `auth.uid()` from the verified subject. No request field can choose the subject or database role.

### Schemas and privileged seams

- `api`: application tables, RLS views, and API-command wrappers. It is not in the Supabase Data API exposed-schema list. `anon` and `authenticated` have no `api`/`private` schema or object grants.
- `private`: membership helpers, queue/outbox internals, provider calls, idempotency payload hashes, audit internals, and privileged functions. Not exposed.
- `public`: contains no SIMULA domain object. If Supabase requires a Data API schema, only this empty/default-deny schema is exposed.
- `auth` and `storage`: platform-managed; no application table is placed there.
- Views accessible to authenticated users use `security_invoker=true`; otherwise grants are revoked.
- Security-definer functions exist only in `private`, use `SET search_path=''`, schema-qualify every object, minimize privileges, revoke `PUBLIC`, and grant execute only to the required role. User-path helpers require `session_user='simula_api'` and validate transaction-local `auth.uid()`/membership; worker helpers require `session_user='simula_worker'` plus current typed claim/lease identifiers and hard-code the queue/resource class.

Every user write has a named `api` command wrapper callable only by `simula_api`; `simula_api` has no direct table mutation grant. The wrapper is the conventional stable entry point, is `SECURITY INVOKER`, and delegates to exactly one private fixed-search-path `SECURITY DEFINER` helper. Because `simula_api` must execute that helper, the helper—not wrapper exclusivity—is the complete enforcement boundary: direct helper invocation with valid verified claims is equivalent and allowed; absent, forged, or insufficient claims fail. For multi-row commands, that helper owns the entire atomic graph—not merely associated rows. `private.create_organization_atomic` creates the organization, exactly one self owner membership, idempotency response, and audit. `private.create_simulation_run_atomic` validates same-organization frozen references and quotas, then creates the run, first event, outbox, idempotency response, and audit. Any failure rolls back the whole graph.

User-command definers are owned by dedicated `simula_command_owner`, a `NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS` role with only the named table/sequence operations required by those helpers. It owns no tables or schemas. RLS policies for that role allow only the helper's required rows; the helper still requires `session_user='simula_api'` and rejects missing/mismatched `auth.uid()`, non-`authenticated` claim role, insufficient live membership, invalid parent ownership, stale version, limits, and idempotency-hash mismatch. Helpers generate identifiers server-side, use `SET search_path=''`, schema-qualify every reference, revoke `PUBLIC`, and are executable only by `simula_api`. Direct invocation with absent/forged transaction claims fails.

Membership rows are self-readable only (`user_id = auth.uid()`); no organization roster is exposed in Phase 2. All membership C/U/D grants are revoked. The organization-list command joins only the verified caller's membership rows.

Worker/dispatcher connects with separate `simula_worker` credentials. That role is `LOGIN`, `NOINHERIT`, `NOBYPASSRLS`, owns no objects, and can execute only private fixed-search-path helpers for outbox claim/confirm/fail and run claim/heartbeat/complete/fail. Those definers are owned by separate `simula_worker_owner` (`NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS`) with only their named DML; each requires `session_user='simula_worker'` plus current typed claim/lease context. `simula_worker` cannot call user commands or read arbitrary tenant tables. Neither API nor worker receives a database owner/superuser or Supabase service-role key.

### Policy invariants

- RLS enabled and forced where compatible on every tenant table before any runtime grant.
- Separate policies for `SELECT`, `INSERT`, `UPDATE`, and `DELETE`.
- Revoke schema/table/sequence/function defaults from `PUBLIC`, `anon`, and `authenticated` before granting any runtime role; CI diffs the catalog against [[../Architecture/AUTHORIZATION_MATRIX|the matrix]].
- `UPDATE` has a matching `SELECT` policy plus `USING` and `WITH CHECK`; resulting ownership cannot change.
- `anon` and `authenticated` have no application schema/object privilege; possession of browser Auth credentials cannot reach domain data or commands.
- `simula_api` has read/view and named-command execute privileges only; no direct table mutation.
- `simula_worker` has named worker-helper execute privileges only; each mutation includes run/lease context and emits an audit event.
- API database context is always `SET LOCAL` inside a transaction; pool checkout begins clean, and commit, rollback, exception, cancellation, and connection reuse tests prove no prior subject survives.
- Cross-tenant tests cover every table × operation × role; a new table without a matrix row fails CI.

Sources: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Data API security](https://supabase.com/docs/guides/api/securing-your-api), [Postgres connections](https://supabase.com/docs/guides/database/connecting-to-postgres), and [Postgres roles](https://supabase.com/docs/guides/database/postgres/roles).

Evidence ledger: E-4021, E-4022, E-4025, E-4026.

## Rejected options

- Next proxy as authorization: bypassable and far from data.
- RLS only: API functions, queue, storage, and server credentials still need object/function checks.
- Service key for all API CRUD: discards user-scoped RLS defense in depth.
- Roles in mutable user metadata: user controlled/stale.
- Browser queue access: unnecessary cost and replay surface.

## Consequences

- FastAPI is the only public domain API. Its least-privilege Postgres role, transaction-local verified claims, RLS, and private command helpers form separate authorization layers.
- Multi-row operations require carefully reviewed complete atomic command helpers.
- API/worker database passwords become server secrets requiring rotation, pool reset tests, TLS, and leak scanning.
- Worker is a high-trust boundary with narrower code and secret scanning.

## Rollback

Disable affected endpoint/feature flag; revoke function/table grants; restore prior policies through a forward migration. Rotate leaked keys. Do not roll back by disabling RLS.
