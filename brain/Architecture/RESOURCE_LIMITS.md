---
title: SIMULA Phase 2 Resource and Rate Limits
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-17
owner: API and SRE leads
classification: PROPOSED
source_of_truth: true
---

# SIMULA Phase 2 Resource and Rate Limits

## Ownership

Server configuration owns limits; browser input cannot raise them. Application schemas are absent from the browser Data API, so these controls cannot be bypassed with the Auth publishable key/JWT. Startup validates named environment variables against these allowed values. Durable object/run quotas are checked inside complete atomic Postgres command helpers. Request-rate counters and queue signals use private Railway Redis. Local/CI uses the same defaults.

## Input and collection limits

| Resource | Phase 2 limit | Failure |
|---|---:|---|
| HTTP JSON body | 64 KiB by declared and actual bytes | `413 request_too_large` |
| Request headers | 16 KiB total; idempotency key 16–128 printable ASCII | proxy/API reject |
| Organization/project name | 2–80 Unicode characters after trim | `422 validation_error` |
| Objective/context | 1–1,000 characters | `422` |
| Text stimulus | 1–5,000 characters and at most 16 KiB UTF-8 | `422` |
| Category/market/language enum | allowlist; English only for Phase 2 processing | `422` or `422 unsupported_scope` |
| List page | default 25, maximum 100 | clamp/reject invalid cursor |
| File/multipart/upload | no route; content type rejected | `404`/`415` |
| Serialized ARQ job/result envelope | 16 KiB; exact typed/ranged ARQ v0.28 job/result schema; strict canonical JSON only | safe deserialization/transport failure; worker remains live; never pickle fallback |

Unknown command fields are rejected. Normalization never changes stored text silently; trim applies only to bounded labels.

## Authenticated rate limits

Redis token buckets use subject plus route class; organization limits add organization ID. Successful and failed attempts consume tokens where abuse-relevant.

| Class | Limit | Burst | Failure |
|---|---:|---:|---|
| General authenticated API | 120/min/user | 30 | `429 rate_limited`, `Retry-After` |
| Unauthenticated non-health API | 30/min/IP hash | 10 | `429` |
| Organization create | 3/hour/user | 1 | `429` |
| Project/stimulus mutation | 30/hour/user/org | 5 | `429` |
| Run create | 10/hour/user and 50/day/org | 2 | `429 quota_exceeded` |
| Run cancel | 30/hour/user/org | 5 | `429` |
| One run status/result | 60/min/user/run | 10 | `429` |

Health endpoints are separately infrastructure-limited and disclose no tenant/dependency detail.

## Durable quotas

- Maximum 25 active projects per organization.
- Maximum 5 logical stimuli per project and 20 immutable versions per stimulus.
- Maximum 3 active execution slots per organization. `running` and `cancel_requested` with an unexpired worker lease each consume a slot; cancellation frees it only on worker close or lease expiry.
- Maximum 20 organization runs across `queued`, `retrying`, `cancel_requested`, or undispatched outbox.
- Maximum 100 retained runs per organization in non-production; oldest synthetic run must be deleted before another is accepted.
- Exactly one terminal result per run; maximum result JSON 128 KiB.

Limits are not pricing entitlements. Phase 5 may revise them using measured evidence through an ADR.

## API and dependency budgets

- Non-streaming API handler deadline: 10 seconds; run creation target/deadline: 1/5 seconds.
- Postgres pool acquisition/connect timeout: 2 seconds; SQL `statement_timeout=8s`, `lock_timeout=2s`, `idle_in_transaction_session_timeout=10s`. API async pool maximum 10 connections; worker/dispatcher maximum 4. At most one new-transaction retry for a proven idempotent read after a pre-statement connection failure; no hidden command retry.
- Redis socket-connect timeout: 1 second. Redis in-flight command timeout: 1 second via a custom binary ConnectionPool/ArqRedis client plus an outer 1-second `asyncio.timeout` around publisher/inspection operations; implicit timeout retry is disabled. Connect refusal, connect stall, and post-send/response command stall are classified separately; every ambiguous enqueue/inspection timeout leaves the accepted outbox pending.
- ARQ mock job timeout 30 seconds, transport max 16 tries: at most three one-second pre-confirmation deferrals, then bounded five-second organization-capacity deferrals through try 13, preserving tries 14–16 for up to three database execution attempts. Worker concurrency is 4 per replica, Phase 2 maximum two replicas. Database execution attempts remain capped at three globally across generations.
- Outbox dispatcher interval 1 second, batch 20, claim lease 15 seconds, maximum 10 attempts per generation. Unresolved-run reconciliation interval 30 seconds; require no unexpired lease and either 120 seconds without progress or declared Redis loss; recover queued/stale-running/retrying, finalize inactive cancellation, maximum three database attempts and three dispatch generations. Incident flag cannot bypass caps.

## Backpressure

- Organization pending limit 20: reject run create with `429 quota_exceeded`.
- Global pending outbox or ARQ queued jobs ≥100, oldest undispatched outbox >60 seconds, or Redis memory ≥80%: reject new runs with `503 queue_backpressure`, `Retry-After: 30`.
- Redis memory ≥90%, oldest undispatched >5 minutes, or poison outbox: disable run creation flag and alert owner.
- Existing outbox/runs continue recovery; reads/cancel remain available.
- No live-job eviction. Redis configured `maxmemory-policy noeviction`; failed writes trigger outbox/backpressure, not silent loss.

## Client polling

Run status polling delays: 1s, 1.5s, 2.25s, 3.5s, 5s, then 10s maximum with ±20% jitter. Stop on terminal state or authorization failure. After five minutes show “taking longer” and poll every 30s; after 30 minutes stop automatic polling and offer manual refresh. One browser tab shares a poller per run.

## Verification

- `SEC-LIMIT-001`: every input/rate/quota boundary at limit−1, limit, limit+1; Unicode byte/character cases; missing/forged content length; valid browser JWT/publishable key still has no application Data API bypass.
- `LOAD-RATE-001`: token-bucket concurrency and `Retry-After` behavior; no cross-user/org counter collision.
- `INT-BACKPRESSURE-001`: Redis unavailable/full, outbox ≥100, org pending 20, oldest thresholds, recovery replay.
- `INT-WORKER-LIMIT-001`: concurrency never exceeds 4/replica; 4+ simultaneous same-org claims across replicas produce at most 3 active slots with no attempt/manifest read for capacity losers; three active leases moved to `cancel_requested` still occupy all slots until close/expiry; different-org claim is not blocked; transport/job timeout/retry budgets hold; no duplicate result.
- `E2E-POLL-001`: backoff, terminal stop, slow state, one-poller behavior.
