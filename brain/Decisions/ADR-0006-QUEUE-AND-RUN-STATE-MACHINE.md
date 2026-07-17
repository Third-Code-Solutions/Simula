---
title: ADR-0006 Railway Queue and Run State Machine
status: accepted
created: 2026-07-17
updated: 2026-07-17
owner: Backend and platform leads
classification: PROPOSED
source_of_truth: true
---

# ADR-0006 — Railway Queue and Run State Machine

## Context

The repository contract requires Railway for API, workers, queues, and supporting runtime services. Simulation cannot depend on bounded web/API request lifetime. Queue delivery can repeat after a worker crash or timeout; side effects must be idempotent.

## Decision

Use ARQ `0.28.0` over Redis server `8.2.7` deployed as a private Railway Redis service. Local/CI uses the same exact Redis image. Python client is `redis 5.3.1`, the newest stable 5.x registry release selected because ARQ 0.28 declares `redis[hiredis]>=4.2,<6`. Phase 2 integration tests must prove the complete Python 3.14.6/ARQ 0.28/redis-py 5.3.1 command, retry, crash, and shutdown path against the exact Redis 8.2.7 server image.

ARQ's maintainer declared the project maintenance-only: critical security fixes may continue, but new fixes should not be expected. Phase 2 prototype use is conditional on the exact-runtime proof above and a queue adapter that contains ARQ-specific code. Phase 5 must reassess maintained alternatives and approve a tested migration/exit plan before Phase 6 staging or production.

Sources: [Railway Redis](https://docs.railway.com/databases/redis), [Railway private networking](https://docs.railway.com/private-networking), [ARQ 0.28](https://arq-docs.helpmanual.io/), [ARQ custom serializers](https://arq-docs.helpmanual.io/#custom-job-serializers), and [ARQ maintenance-only notice](https://github.com/python-arq/arq/issues/510). Evidence: E-4023, E-4024, E-4028.

Redis is transport, scheduling, deduplication, and short-lived job metadata only. Supabase Postgres remains authoritative for run, outbox, attempt, event, result, idempotency, and audit state.

### Transactional outbox

1. FastAPI's `simula_api` command transaction atomically inserts frozen `simulation_run`, `run_event`, `run_outbox`, idempotency response, and audit event under the verified user subject.
2. FastAPI best-effort calls the shared publisher exactly as `enqueue_job('process_run_v1', {'schema_version': 1, 'run_id': '<uuid>'}, _job_id='run:{run_id}:dispatch:{generation}', _queue_name='simula:runs:v1', _defer_by=1, _expires=3600)`. The one-second defer gives the dispatcher confirmation transaction a head start but is never treated as an authorization control.
3. FastAPI never confirms or changes the outbox after that commit. The row remains pending even when the latency-optimization enqueue succeeds; user/browser/API identities cannot claim or confirm dispatch.
4. A worker-side dispatcher using `simula_worker` polls and compare-and-set claims due rows, then calls the same shared publisher with the same function name, one payload object, and deterministic job ID.
5. A non-null `enqueue_job` response proves an atomic new key plus insertion into `simula:runs:v1`. If enqueue returns duplicate/None, matching bytes alone are insufficient because ARQ job keys are global across queue sorted sets. The dispatcher uses one atomic Redis script/snapshot to require the exact job key, exact canonical function/one positional argument/empty kwargs/schema/job-ID binding, and a non-null score in exactly `simula:runs:v1`. ARQ v0.28 retains that sorted-set member while the job is in progress and removes it only on finish; its separate in-progress key is still insufficient because it does not attest the source queue. Missing/wrong-queue membership, result-key-only/in-progress-only state, payload mismatch, timeout, connection loss, or any other ambiguous response remains pending/poison and never confirms. Only an unambiguous new or identical-target-queued proof permits service-only `private.confirm_run_dispatch` with the current claim token.
6. Crash after enqueue/before confirmation is safe: the next dispatcher attempt observes the identical Redis job ID, then confirms. If the earlier job already completed and its Redis key expired, re-enqueue is a terminal database no-op.
7. Outbox rows use claim-token/expiry compare-and-set, attempt count, `next_attempt_at`, and terminal dispatch error. Pending work never exists only in Redis.

Confirmation proves only that Redis accepted or already held the exact job—not that a worker will finish it. Every 30 seconds the dispatcher reconciles unresolved runs/outboxes in one transaction. Any helper touching both follows run → outbox lock order; no helper holds an outbox lock while waiting for its run. Execution claim adds organization first for the capacity check; attempt/result locks follow run. Outbox claim/confirm may lock only outbox and must recheck claim tokens. Eligibility for a new generation is: state `queued`, `running`, or `retrying`; database attempt count below 3; no unexpired lease; latest dispatch generation below 3; and `(no progress for at least 120 seconds OR an operator-declared Redis-loss incident)`. The incident flag bypasses only the age wait—never state, active-lease, attempt, or generation caps.

- Eligible `queued` stays queued; eligible stale `running` transitions to `retrying` and clears the expired lease; eligible `retrying` stays retrying. Each appends a recovery event and atomically creates pending `dispatch_generation + 1` with a new deterministic job ID.
- `cancel_requested` with no unexpired lease becomes `canceled` and closes unresolved outbox rows without enqueue; an active worker owns the normal cancellation checkpoint.
- If database attempt count or dispatch generation is exhausted, eligible `queued`, stale `running`, or stale `retrying` becomes terminal `failed`; `cancel_requested` becomes `canceled`.
- Active processing with a valid lease/recent progress is never failed or regenerated. Existing terminal state only reconciles the outbox.

Database attempt count is authoritative across ARQ retries and replacement generations; ARQ `_job_try` never grants another attempt after the database cap. Duplicate generations remain safe through atomic claim/lease and terminal-result uniqueness.

The sole ARQ positional argument is strict `RunJobV1 = {"schema_version":1,"run_id":"uuid"}` with unknown fields rejected and canonical serialization shared by API/dispatcher/worker. No organization/user name, stimulus, audience, prompt, result, or credential enters Redis.

Queue syntax is not execution authority. `process_run_v1` first reads ARQ `ctx['job_id']`, requires the full canonical form `run:{run_id}:dispatch:{generation}` with generation 1–3, and requires its run UUID to equal the strict payload UUID. Before loading any manifest or calling the mock/provider path, it passes the typed run ID, parsed generation, and complete job ID to `private.claim_run_execution`. That helper follows the organization→run→exact-current-outbox lock order and requires the prospective organization running count, stored job ID/generation, current generation, confirmed dispatch, eligible state, lease, and database-attempt checks. Missing, malformed, cross-run, stale, future, canceled, or terminal bindings cannot create an attempt or read a manifest: syntax failures emit a restricted security log/metric, while database binding failures append a safe worker audit event and return no-work. The exact-current unconfirmed response is `awaiting_confirmation` with zero attempt/domain read and transport-only `Retry(defer=1)` on tries 1–3; confirmed capacity-full response is `organization_capacity` with zero attempt/domain read and bounded five-second transport defer. Both handshakes are correctness-safe regardless of publisher timing; confirmed Postgres intent and serialized database limits remain authoritative.

### Non-executable ARQ serialization

ARQ 0.28 defaults to `pickle.dumps`/`pickle.loads`; that default is prohibited because deserialization occurs before `RunJobV1` validation. One shared stdlib-only codec module is imported by API publisher, dispatcher/inspector, and worker:

- `arq_json_dumps(dict) -> bytes`: accept only one exact ARQ v0.28 envelope schema, normalize only ARQ's argument tuple to a JSON array, reject every other non-JSON or wrong-typed value, then encode UTF-8 with `sort_keys=True`, separators `(',', ':')`, `ensure_ascii=True`, and `allow_nan=False`.
- Job envelope keys are exactly `{'t','f','a','k','et'}`—all required, no extras. `f` is exactly string `process_run_v1`; `a` is an array of length one containing the exact two-key `RunJobV1`; `k` is an empty object with string keys; `t` is JSON null or a non-boolean integer 1–16; `et` is a non-boolean integer Unix-millisecond value from 0 through `4102444800000` (2100-01-01 UTC). `schema_version` is integer 1, and `run_id` is a canonical lowercase hyphenated UUID string.
- Result envelope keys are exactly `{'t','f','a','k','et','s','r','st','ft','q','id'}`—all required, no extras—even though `keep_result=0`. For valid-job results, `t` is a non-boolean integer 1–16, `f='process_run_v1'`, `a` contains the strict one-item payload, `k={}`, `et` is bounded as above, `s` is boolean, and `r` is only null or exact string `unable to serialize result`; the handler itself always returns `None`. `st`/`ft` are bounded non-boolean Unix-millisecond integers with `ft>=st`; `q` is exactly `simula:runs:v1`; and `id` is a canonical job ID whose run/generation matches `a[0]`.
- `arq_json_loads(bytes) -> dict`: reject over 16 KiB before decode; strict UTF-8; reject duplicate keys and `NaN`/infinity; require a dictionary; enforce the exact job or result schema above before returning; maximum depth 8, 64 entries per container, and 4 KiB per string; re-encode with `arq_json_dumps` and require byte equality so noncanonical encodings fail. The decoder never returns a merely “JSON-shaped” envelope to ARQ.
- SIMULA does not use ARQ `create_pool()` for runtime transport because v0.28 maps `RedisSettings.conn_timeout` only to redis-py `socket_connect_timeout` and exposes no command `socket_timeout`. One shared queue-pool factory creates a binary `redis.asyncio.ConnectionPool` with `socket_connect_timeout=1`, `socket_timeout=1`, bounded connections, and no implicit timeout retry, then constructs `ArqRedis(pool_or_conn=..., job_serializer=arq_json_dumps, job_deserializer=arq_json_loads, default_queue_name='simula:runs:v1')`. API and dispatcher use this client; the explicit worker entry point constructs `Worker(redis_pool=client, job_serializer=arq_json_dumps, job_deserializer=arq_json_loads, ...)` instead of relying on CLI auto-pool creation. Publisher and atomic inspection operations also run inside application `asyncio.timeout(1)` scopes. Connect timeout and in-flight command timeout are distinct tests; every ambiguous timeout leaves Postgres outbox pending. There is no pickle, YAML, dynamic-object hook, or fallback decoder anywhere in SIMULA queue code.
- `process_run_v1` accepts exactly one JSON-safe `RunJobV1`, validates the ARQ context job-ID/run/generation binding, and atomically claims confirmed current Postgres intent before manifest access. It returns only `None`; durable status/result content stays in Postgres.
- Malformed, missing/extra-key, wrong-type/range, duplicate-key, noncanonical, oversize, pickle, unknown-function, or payload/context-mismatch envelopes never reach manifest/provider/side-effect work. On ARQ v0.28 deserialization failure, its internal failure-result input has `f=''`, empty args, and `et=0`; the strict serializer deliberately rejects both the exception form and ARQ's string-fallback form, so ARQ receives `result_data=None`, removes the bad transport entry, and retains no result under `keep_result=0`. No normalization or invented `<unknown>` envelope exists. Tests prove this exact path alerts while the worker poll loop remains alive and no code retries with pickle.

Serializer changes require a new queue name/version and an empty/drained old queue; backward-compatible pickle decoding is forbidden.

### State machine

| Current | Allowed next | Trigger |
|---|---|---|
| none | `queued` | atomic authorized run + outbox creation |
| `queued` | `running`, `cancel_requested`, `failed` | worker claim, user cancel, permanent preflight failure |
| `running` | `succeeded`, `retrying`, `cancel_requested`, `failed` | atomic publish, transient failure, user cancel, permanent/exhausted failure |
| `retrying` | `running`, `cancel_requested`, `failed` | deferred ARQ retry, user cancel, exhausted/permanent failure |
| `cancel_requested` | `canceled` | worker observes the prior successful cancel CAS and commits cancellation |
| `canceled` | none | terminal |
| `succeeded` | none | terminal |
| `failed` | none | terminal |

Every transition is a database compare-and-set and appends `run_event` with prior/new state, attempt, safe reason, actor, timestamp, and correlation ID. Invalid transitions fail and emit a metric.

### Claim and execution lease

- ARQ uses pessimistic execution, `job_timeout=30s`, transport `max_tries=16`, `keep_result=0`, queue `simula:runs:v1`, and one-hour job expiry. Tries 1–3 may be confirmation-handshake deferrals. Confirmed jobs blocked by organization capacity defer five seconds only while `job_try<=13`, preserving tries 14–16 for at most three database execution attempts; if still full at try 14, the handler alerts/completes no-work for bounded reconciliation. Neither transport-only path creates a database attempt. Redis never retains ARQ success/failure results; durable safe outcome/history lives in Postgres.
- `private.claim_run_execution(run_id, generation, job_id)` is the first database call. It resolves the immutable organization ID, then follows the shared lock order organization row → run → current outbox → attempt/result. Under the organization lock it rechecks ownership and prospective active-execution occupancy: every `running` run plus every `cancel_requested` run with an unexpired worker lease consumes one slot; the same already-running lease replacement is not double-counted. Post-claim occupancy must remain at most 3. Cancellation frees a slot only when the worker closes it or its lease expires. This serializes same-organization claims across replicas without blocking another organization.
- After the capacity check, the helper enforces the confirmed exact binding defined above and only then compare-and-set claims an eligible run with a server-generated attempt ID/random lease token and `lease_expires_at=now()+30s`. It atomically increments the database-global attempt count, appends event/audit, and returns the frozen manifest projection. Capacity-full returns `organization_capacity` with zero attempt/manifest read; other rejected bindings also never return domain data.
- Terminal/canceled/stale-generation run returns audited no-work; exact current but unconfirmed intent returns bounded `awaiting_confirmation`; confirmed intent at the same-organization running cap returns bounded `organization_capacity`. Worker creates no attempt or manifest read in either transport-only case. Active unexpired lease returns busy/retry. An expired lease may be superseded only while attempts remain.
- `private.heartbeat_run_execution(run_id, attempt_id, lease_token)` extends only the matching current `running` lease; cancellation/terminal/superseded attempts return stop/no-work and never regain authority.
- `private.complete_run_execution(run_id, attempt_id, lease_token, validated_result)` locks and rechecks current lease/state/result uniqueness before atomically inserting the immutable result, transitioning `running→succeeded`, closing the attempt/lease, and appending event/audit. A superseded worker discards output. ARQ acknowledges only after this commit.
- `private.fail_run_execution(run_id, attempt_id, lease_token, safe_failure)` locks and rechecks current authority, then atomically closes the attempt and chooses exactly one legal branch: retryable/below-cap `running→retrying`; permanent/exhausted `running|retrying→failed`; `cancel_requested→canceled`; superseded/terminal→no-op. It appends event/audit in every winning state branch.
- Worker crash/cancel leaves the job available for pessimistic re-execution. Database lease/result uniqueness makes redelivery safe.

### Retry and failure

- Maximum three total attempts. Defers before attempts 2 and 3: `5s`, then `30s`; tests use deterministic jitter `0`, hosted use bounded ±20% jitter.
- Retry only timeout, rate limit with safe retry, transient network, Redis/Supabase dependency unavailable, or worker interruption.
- Never retry validation, authorization, unsupported scope, invalid contract, canceled request, budget exceeded, or provider-policy failure.
- No provider/model/method/data fallback. Retry uses the same frozen manifest.
- Exhaustion transitions to `failed` with safe code/correlation ID. Restricted telemetry may retain an allowlisted diagnostic class, never raw content.

### Cancellation race

- Cancel command is idempotent.
- If cancel CAS wins before terminal result commit, state becomes `cancel_requested`; worker stops at a checkpoint and commits `canceled`. Unpublished output is discarded.
- If result commit wins first, state remains `succeeded`; cancel returns the existing terminal state and does not delete/relabel the result.
- Queued/retrying canceled jobs may still be delivered by Redis; worker observes state and exits without provider work.

### Duplicate and cost controls

- HTTP idempotency prevents duplicate run creation.
- Transactional outbox prevents lost dispatch; deterministic ARQ job ID suppresses duplicate live dispatch.
- Lease token and unique terminal result prevent duplicate publication.
- Attempt/provider-call IDs prevent duplicate billing records.
- Phase 2 mock cost is zero; Phase 3 reserves quota before any billable call.

### Retention and recovery

- Pending/deferred Redis job keys expire within one hour and are recoverable from outbox; ARQ result retention is disabled (`keep_result=0`); durable history lives in Postgres.
- Queue memory uses an explicit max-memory alert and no silent eviction policy for live jobs.
- On Redis loss, recreate service/group configuration, replay pending/due outbox rows, and recover unresolved queued plus expired/no-lease stale `running`/`retrying` intents through the bounded dispatch-generation reconciler. Active valid leases remain untouched.
- Outbox poison dispatch stops after 10 attempts and pages/tickets per severity. `private.fail_run_dispatch` resolves the typed run ID, locks run then current outbox, rechecks the dispatcher claim token, and applies one CAS: eligible `queued` or stale expired/no-lease `running`/`retrying` at attempt/generation exhaustion → `failed` with safe `dispatch_exhausted`; `cancel_requested` without an active lease → `canceled`; active/recent `running`/`retrying` → outbox reconciliation with no run mutation; existing terminal → outbox close with no run mutation. `private.reconcile_run_dispatch` uses the same run→outbox order. The outbox is terminalized in every winning branch, and invalid/stale claims are no-op/retry—not invented transitions.

## Rejected options

- Supabase Queues/pgmq: violates the repository's Railway queue mandate.
- Vercel background work: not a durable queue/worker system.
- Redis as authoritative run/result store: weak lifecycle, tenant, audit, and recovery boundary.
- “Exactly once” assumption: crashes and acknowledgments still duplicate execution.
- Publish partial result: ambiguous terminal semantics.

## Consequences

- Redis and Postgres form an intentionally reconciled outbox pattern; no distributed transaction is claimed.
- API needs private Railway Redis plus the least-privilege `simula_api` Postgres connection; it has no worker, database-owner, or Supabase service-role credential and cannot confirm dispatch.
- Worker/dispatcher needs Redis plus separate least-privilege `simula_worker` Postgres access; only this identity can claim/confirm/fail outbox dispatch.
- Hosted Redis is unmanaged by Railway; backup, persistence, memory, and upgrades require Phase 5 evidence.
- ARQ is maintenance-only. Its adapter, exact-runtime tests, and Phase 5 migration/exit decision are release controls, not optional debt.

## Rollback

Disable new runs, pause workers/dispatcher, preserve outbox, deploy the last compatible API/worker, recreate Redis if needed, then replay due outbox and run bounded reconciliation for unresolved queued plus expired/no-lease stale processing. Queue-contract changes use a new ARQ queue name and dispatch generation.
