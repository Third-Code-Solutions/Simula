---
title: SIMULA Authorization and RLS Matrix
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-30
owner: Security and database leads
classification: PROPOSED
source_of_truth: true
---

# SIMULA Authorization and RLS Matrix

## Roles

- `anon`: unauthenticated Postgres/API role; no domain access.
- `viewer`: organization member; read admitted tenant objects/results.
- `editor`: viewer plus create projects/stimulus versions/runs and cancel runs.
- `owner`: editor plus organization/membership lifecycle.
- `worker`: server-only privileged identity; queue/attempt/result/state work for explicit run IDs.

Organization role is a database membership row, never browser-supplied metadata. “Self” means JWT `sub = auth.uid()`.

Runtime database roles are separate: browser `anon`/`authenticated` have no application-schema privileges; Railway API uses least-privilege `simula_api`; Railway worker/dispatcher uses least-privilege `simula_worker`. Both runtime roles are `NOINHERIT`, `NOBYPASSRLS`, own no objects, and cannot `SET ROLE`.

## Runtime grant matrix

| Database role | Schema reachability | Direct table privileges | Function privileges |
|---|---|---|---|
| `anon`, `authenticated` | no `api`/`private`; empty/default-deny Data API schema only | none | none |
| `simula_api` | `USAGE api`; exact private helper resolution only | `SELECT` on named `api` read tables/views under RLS; no `INSERT/UPDATE/DELETE/TRUNCATE` | exact `api` user-command wrappers and their private helpers only |
| `simula_worker` | exact `private` helper resolution only | none | outbox/run/attempt/result worker helpers only |
| `simula_command_owner` | private command implementation | minimum DML used by user-command helpers; RLS applies | owns user-command definers; `NOLOGIN` |
| `simula_worker_owner` | private worker implementation | minimum DML used by worker helpers; RLS applies | owns worker definers; `NOLOGIN` |
| migration owner | migration job only | schema/DDL authority | unavailable to runtime services |

All default function/table/schema privileges are revoked before explicit grants. Role and grant inventory is asserted from Postgres catalogs in CI.

## Table matrix

Legend: `R` read, `C` create, `U` update, `D` delete, `—` denied. “Command/helper” means no direct table mutation.

| Object | anon | viewer | editor | owner | worker | Notes |
|---|---|---|---|---|---|---|
| `api.organizations` | — | R active member org | R active | R active | — | C through atomic command; owner-only deletion saga disables first and cascades last |
| `api.organization_memberships` | — | R self only | R self only | R self only | — | No roster; initial owner only inside create command; all user C/U/D revoked |
| `api.projects` | — | R | R | R | — | C/U only through commands; `organization_id` immutable; D deferred |
| `api.stimuli` | — | R | R | R | — | C only through command; content resides in versions; D deferred |
| `api.stimulus_versions` | — | R | R | R | — | Append only through command; no direct C/U/D |
| `api.audiences` | — | R admitted global/demo or tenant | R | R | R via run helper | Phase 2 writes migration-only |
| `api.audience_versions` | — | R admitted | R | R | R via run helper | Append-only; Phase 2 writes migration-only |
| `api.simulation_runs` | — | R | R; create/cancel command | R; create/cancel command | — | No direct user mutation; worker changes only through private helpers |
| `api.simulation_results` | — | R when run visible | R | R | — | Worker creates only through completion helper; immutable/unique run |
| `private.run_attempts` | — | — | — | — | C,U,R via helper | No Data API exposure |
| `private.run_events` | — | — | — | — | C,R via helper | Append-only; safe summary exposed through run response |
| `private.run_outbox` | — | — | — | — | C,U,R via helper | Durable queue-dispatch intent; no raw content |
| `private.idempotency_keys` | — | — | — | — | command helpers only | Request hash private |
| `private.audit_events` | — | — | — | — | command/worker helpers C; operator R | Append-only; no raw content |
| `private.organization_deletion_requests` | — | — | — | command only | — | Durable forced-RLS request/tombstone; no direct runtime table grant; pending manifest minimized on completion |
| `private.context_node_embeddings` | — | — | — | — | C,R via helper | Immutable tenant/graph/model/content-bound vectors; no direct runtime grants |
| `private.embedding_model_versions` | — | — | — | — | R via helper | Migration-admitted rights and benchmark registry |
| Railway Redis/ARQ | — | — | — | — | API enqueue; worker consume | Private-network transport; run-ID-only payload; no browser path |

## Function matrix

| Function | Caller | Preconditions | Atomic effects |
|---|---|---|---|
| `api.create_organization` → `private.create_organization_atomic` | `simula_api` for authenticated subject | verified transaction-local subject/role; name 2–80; limit; idempotency | organization + exactly one self owner membership + idempotency response + audit |
| `api.create_project` → `private.create_project_atomic` | `simula_api` for editor/owner | live membership; organization quota; validated body; idempotency | project + idempotency response + audit |
| `api.update_project` → `private.update_project_atomic` | `simula_api` for editor/owner | same org; exact `If-Match` version; validated body | compare-and-set project update + audit |
| `api.create_stimulus` → `private.create_stimulus_atomic` | `simula_api` for editor/owner | same-org project; project quota; validated body; idempotency | stimulus + immutable version 1 + idempotency response + audit |
| `api.append_stimulus_version` → `private.append_stimulus_version_atomic` | `simula_api` for editor/owner | same-org stimulus; version quota; validated text; idempotency | next immutable version/hash + idempotency response + audit |
| `api.create_simulation_run` → `private.create_simulation_run_atomic` | `simula_api` for editor/owner | same-org project/stimulus/audience; admitted frozen versions; quotas/backpressure; idempotency | frozen run + event + outbox + idempotency response + audit |
| `api.request_run_cancellation` → `private.request_run_cancellation_atomic` | `simula_api` for editor/owner | same-org visible run; cancelable state | compare-and-set state + event + audit |
| `api.request_organization_deletion` → `private.request_organization_deletion_atomic` | `simula_api` for owner | verified subject/session; exact organization name; no nonterminal run; canonical request/idempotency hashes | durable pending request + bounded run/object manifest + organization disable + audit; same request replays |
| `api.confirm_organization_deletion` → `private.confirm_organization_deletion_atomic` | `simula_api` orchestration only | exact pending request/organization; external object, queue, and cache absence already verified by the control plane | cascade organization graph + complete/minimize surviving tombstone |
| `private.claim_organization_deletion_resources` | `simula_worker` only | due pending resource; disabled organization; no active lease; attempt below ten; batch at most 50 | skip-locked 15-minute current-token lease |
| `private.complete_organization_deletion_resource` | `simula_worker` only | exact resource/current unexpired claim token | marks one cleanup resource complete; duplicate/stale token is a no-op |
| `private.release_organization_deletion_resource` | `simula_worker` only | exact resource/current token; fixed storage/queue/cache failure code | clears lease and schedules bounded 5–300 second retry |
| `private.finalize_ready_organization_deletions` | `simula_worker` only | disabled organization; pending request; non-empty ledger; every row complete | cascade graph + purge ledger + complete/minimize tombstone |
| `private.is_org_member` | RLS only | self and org | boolean; security definer/private/fixed search path |
| `private.has_org_role` | RLS only | self/org/allowed roles | boolean; security definer/private/fixed search path |
| `private.claim_run_outbox` | `simula_worker` only | due pending row; typed run/generation; claim lease | compare-and-set dispatch claim |
| `private.confirm_run_dispatch` | `simula_worker` only | owns current claim; dispatcher has unambiguous new create or atomic identical-target-queued proof: exact key/function/one arg/empty kwargs/schema/job binding plus non-null exact `simula:runs:v1` score; in-progress-only is insufficient | marks outbox dispatched |
| `private.fail_run_dispatch` | `simula_worker` only | resolve typed run; lock run→outbox; recheck current claim; active-lease/progress/DB-attempt/generation checks | retry schedule; exhausted eligible queued/stale processing→failed; inactive cancel_requested→canceled; active processing/terminal→outbox reconciliation |
| `private.reconcile_run_dispatch` | `simula_worker` only | unresolved typed run/outbox; lock run→outbox; no unexpired lease; `(age≥120s OR declared Redis loss)`; lock state/attempt/generation before branch | below-cap queued→new generation; below-cap stale running→retrying + new generation; below-cap retrying→new generation; inactive cancel_requested→canceled; attempt/generation caps exhausted→failed/canceled; terminal→reconcile |
| `private.claim_run_execution` | `simula_worker` only | typed run/generation/full ARQ job ID; fixed lock order org→run→outbox; prospective org active occupancy≤3 (`running` + active-lease `cancel_requested`); job-ID run equals payload; stored job/generation current; eligible state; no active foreign lease; DB attempts<3 | unconfirmed→`awaiting_confirmation`; org full→`organization_capacity`; both zero attempt/domain read; other rejection→safe audit/no read; confirmed eligible claim→attempt + count + 30s lease + state/event/audit + frozen manifest |
| `private.heartbeat_run_execution` | `simula_worker` only | exact current run/attempt/lease token; state `running`; not canceled/terminal/superseded | bounded lease extension or stop/no-work; no authority resurrection |
| `private.complete_run_execution` | `simula_worker` only | exact current run/attempt/lease; state `running`; validated bounded result; no existing result | unique immutable result + `succeeded` + close attempt/lease + event/audit atomically |
| `private.fail_run_execution` | `simula_worker` only | exact current run/attempt/lease; allowlisted safe failure; locks state/attempt caps | retryable below-cap→`retrying`; permanent/exhausted→`failed`; cancel-requested→`canceled`; superseded/terminal→no-op; close attempt + event/audit atomically |
| `private.upsert_context_node_embedding` | `simula_worker` only | admitted model/version; exact dimensions/normalization; existing immutable graph node/content checksum | one immutable vector binding or byte-identical idempotent replay; conflicting retry fails |
| `api.search_context_nodes` → `private.search_context_nodes` | `simula_api` for organization member | verified subject/session; visible immutable graph; admitted exact model/version; bounded vector, distance, and result count | exact cosine-ranked node metadata; no direct vector/table exposure |

`api` command wrappers are not Data API exposed and are executable only by `simula_api`; that role has no direct mutation grants. Each conventional wrapper delegates to one private security-definer helper that owns the complete atomic write graph. Because `simula_api` has exact EXECUTE on that helper, direct invocation with valid verified claims is equivalent and allowed; wrapper exclusivity is not a security boundary. Private helpers themselves revoke `PUBLIC`, schema-qualify objects, set empty search path, validate all authorization/idempotency/limit invariants, and expose the narrowest operation. Absent/forged claims fail. Worker helpers are executable only by `simula_worker`, require current dispatch/attempt/lease context and typed IDs, and hard-code resource classes. No Phase 2 membership-mutation helper exists.

Postgres cannot independently attest a Redis side effect. Dispatch confirmation therefore trusts only the private dispatcher service identity after its unambiguous Redis response; browser/user/API roles cannot execute claim/confirm/fail. Ambiguous responses remain pending and are retried.

## RLS predicates

- Tenant read through `simula_api`: `private.is_org_member(organization_id, auth.uid())`; disabled organizations fail membership and role predicates.
- Membership-table read: `user_id = auth.uid()` only; same-organization membership does not expose another user.
- User-command helper checks: `private.has_org_role(organization_id, auth.uid(), ARRAY['owner','editor'])`; owner-only commands use `ARRAY['owner']`.
- `simula_command_owner` write policies plus helper checks validate the authenticated subject and parent organization; composite foreign keys independently prevent cross-tenant references.
- Command-owner `UPDATE USING` validates current ownership and `WITH CHECK` validates resulting ownership/immutable organization ID. `simula_api` itself has no UPDATE grant.
- Result read additionally requires its run to be visible and not deleted.
- Global demo audience has explicit `is_public_demo=true`, `admission_status='approved_demo'`; no generic public-row predicate.

## Storage

Private object access is server-mediated and bound to organization-owned asset
metadata plus current membership; path prefix alone is never authorization.
Organization deletion captures only private nondeleted object names in its
durable manifest, deletes through the storage port, requires `stat` absence,
and refuses the final relational cascade if any object remains.

## Required adversarial tests

For every application table/function and runtime role:

1. anon denied;
2. non-member denied for known foreign UUID;
3. viewer cannot write;
4. editor cannot owner-only mutate;
5. owner cannot move a row to another org; every direct membership C/U/D attempt is denied;
6. update requires select and blocks changed ownership via `WITH CHECK`;
7. `anon`/`authenticated` cannot discover or call application tables/functions through Data API, including with valid JWT/publishable key;
8. `simula_api` direct INSERT/UPDATE/DELETE on every domain table fails; wrapper and direct-helper invocation with the same valid claims have equivalent complete atomic effects, while absent/forged/insufficient claims fail and injected failure rolls back the whole graph;
9. same-org user cannot select another membership row; self-only organization listing passes;
10. user/API role cannot claim or confirm outbox; forged confirmation leaves the row pending;
11. transaction-local claim context is absent after commit/rollback/pool reuse and a forged request subject cannot replace the verified JWT subject;
12. invoker view preserves RLS;
13. worker/browser/API secret boundaries pass bundle/log scans;
14. API returns non-enumerating `404/403` policy consistently.
15. worker execution claim rejects missing/malformed job ID, job-ID/payload run mismatch, wrong/stale/future generation, and stored-job mismatch; exact current unconfirmed intent returns only bounded transport retry; every case leaves attempts/results/provider-call count unchanged and records only a safe audit/metric;
16. each worker heartbeat/complete/fail helper rejects stale attempt or lease tokens, and only one concurrent completion/failure branch wins.
17. at least four simultaneous same-organization claims across worker replicas serialize to at most three `running`; capacity losers create no attempt/read and defer, while a different organization's claim proceeds independently.
18. execution claim racing dispatch fail/reconcile follows org→run→outbox versus run→outbox without deadlock; stale claim-token losers retry/no-op and no partial state commits.
19. canceling three actively leased runs does not free organization execution slots; a fourth claim defers until a cancellation checkpoint closes one lease or it expires.

CI derives the expected table list from database metadata. Any exposed table not named here fails the matrix audit.
