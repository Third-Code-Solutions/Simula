---
title: Phase 2 Ordered Implementation Backlog
status: active-remediation
created: 2026-07-17
updated: 2026-07-18
owner: Engineering lead
classification: PROPOSED
source_of_truth: true
---

# Phase 2 Ordered Implementation Backlog

## Definition of Ready

A story is Ready only when user/system outcome, linked `AC-*`/threat/ADR, boundaries, contract/data change, test IDs, dependencies, observability, security/privacy impact, rollback, fixture, and external-state authority are explicit. No unresolved Critical design issue.

## Ordered stories

### P2-01 — Reproducible monorepo foundation — 3 points

- Outcome: engineer installs/runs web, API, worker, contracts, and checks from exact locks.
- Acceptance links: enables all ACs; directly establishes AC-ERR-001 error/correlation base.
- ADRs: ADR-0002, ADR-0008, ADR-0009.
- Threats: T-02 secret boundary, T-10 supply chain, T-11 logging.
- Scope/boundary: root pnpm/Turbo and uv workspaces; minimal health apps; contracts package; Redis/Supabase local config; CI skeleton. No domain UI, migration, hosted resource, or production change.
- Contract/data change: empty OpenAPI/result-schema generation path; `.env.example` only; no persistent domain data.
- Tests: `ENG-PIN-001` runtime/direct-pin resolution, clean pnpm/uv install, format/lint/type/unit smoke, zero peer/ERESOLVE warnings, exact Python 3.14.6/ARQ 0.28/redis-py 5.3.1/Redis 8.2.7 startup-enqueue-retry-crash-shutdown proof, `CONTRACT-GEN-001`, `SEC-SCA-001`, `SEC-SECRET-001` baseline.
- Dependencies: accepted Phase 1 ADR set; host Docker/Node/uv. No external credentials.
- Observability: liveness response, release SHA, service/environment JSON-log fields.
- Security/privacy: non-root images, public/server env split, no user/content data.
- Fixture/external state: none; local Redis exact image only. External provisioning forbidden.
- Rollback: remove scaffold before migrations/state; retain Obsidian evidence.

### P2-02 — Tenant-safe database and local Auth — 5 points

- Outcome: signed-in users have atomic organization ownership and database-enforced tenant isolation.
- Acceptance links: AC-AUTH-001/002, AC-ORG-001/002, AC-TEN-001/002.
- ADRs: ADR-0003, ADR-0004, ADR-0005, ADR-0008.
- Threats: T-01 cross-tenant, T-02 secrets, T-09 audit, T-12 deletion.
- Scope/boundary: Supabase config/migrations/seed; non-Data-API `api`/`private` schemas; `simula_api`/`simula_worker`/NOLOGIN definer roles; organization/membership/project/stimulus/run/result/outbox foundations; RLS, complete atomic command helpers, self-only membership read, local Auth users. Membership mutation remains absent.
- Contract/data change: first SQL migration; command wrappers/private helpers; organization list shape; generated database types; authored seed identities and disposable runtime-role passwords only in local test setup.
- Tests: `DB-MIG-001` reset twice; `DB-ORG-001` atomic/idempotent create plus injected rollback; `SEC-RLS-001` table×operation×role; `SEC-DATA-API-001` valid browser JWT/publishable-key denial; `SEC-ROLE-001` direct DML/helper/worker separation; `SEC-CLAIMS-001` verified-subject/pool-reset; self-only membership/no-roster; `SEC-AUDIT-001`; `PRIV-DEL-001` skeleton.
- Dependencies: P2-01; pinned Supabase CLI and Docker.
- Observability: migration version, auth/RLS denial, organization-create audit/correlation.
- Security/privacy: allowlisted verified JWT claims only; no `user_metadata` authorization; no service-role key; runtime database roles are least privilege and server-only; auth email is personal and never logged.
- Fixture/external state: authored demo/test users and empty orgs only; local Supabase. No hosted resource.
- Rollback: local reset/replay; future environments use forward corrective migration, never disable RLS.

### P2-03 — Organization, project, and immutable stimulus vertical — 5 points

- Outcome: authorized strategist signs in, creates/lists organization, creates project, and appends text stimulus versions.
- Acceptance links: AC-AUTH-001/002, AC-ORG-001/002, AC-TEN-001/002, AC-PROJ-001/002, AC-ERR-001.
- ADRs: ADR-0003, ADR-0004, ADR-0005, ADR-0009.
- Threats: T-01, T-02, T-09, T-11.
- Scope/boundary: FastAPI JWT validation; bounded Psycopg async pool as `simula_api`; transaction-local verified claims; RLS reads; org/project/stimulus atomic commands/endpoints; generated client; accessible sign-in/forms/list/detail. Application schemas remain absent from browser Data API. No membership management, run, upload, or export.
- Contract/data change: exact ADR-0005 org/project/stimulus routes, RFC 9457 problems, idempotency, `If-Match`, immutable stimulus version/hash.
- Tests: `API-AUTH-001`, `API-ORG-001` including concurrent same/different hash, `API-PROJ-001`, `DB-VERSION-001`, `SEC-API-001` foreign UUIDs/direct-Data-API bypass, `SEC-CLAIMS-001` commit/rollback/pool reuse, `CONTRACT-PROBLEM-001`, `E2E-ORG-001`, `E2E-PROJ-001`.
- Dependencies: P2-02; generated OpenAPI/client.
- Observability: route/status/duration, auth denial, idempotency replay/conflict, correlation through web/API/audit.
- Security/privacy: limits from RESOURCE_LIMITS; confidential-content warning; no raw text in logs.
- Fixture/external state: local Auth users and neutral fictional seed text. External state none.
- Rollback: disable write routes/UI; retain readable/deletable rows and compatible contracts.

### P2-04 — Outbox, Railway-compatible queue, worker, deterministic result — 8 points

- Outcome: authorized strategist submits one frozen demo run and receives one typed deterministic result asynchronously.
- Acceptance links: AC-AUD-001, AC-RUN-001–003, AC-RES-001/002, AC-ERR-001.
- ADRs: ADR-0004, ADR-0005, ADR-0006, ADR-0007, ADR-0008, ADR-0009.
- Threats: T-03, T-05, T-06, T-07, T-09, T-13.
- Scope/boundary: demo fixture/manifest; atomic run+outbox command; local/Railway Redis ARQ; API best-effort publisher that never confirms; `simula_worker` repair dispatcher alone claims/enqueues/confirms; state/lease/attempt/event; deterministic mock; result schema/endpoints. No real provider/network egress.
- Contract/data change: `run_outbox`/attempt/event/result tables; shared strict deferred `process_run_v1`/`RunJobV1` publisher contract; exact ARQ v0.28 job/result envelope schemas and canonical stdlib-JSON codec wired identically into every producer/inspector/worker with no pickle fallback; job-context/run/generation/current-confirmed-outbox execution binding; named claim/heartbeat/complete/fail helpers; frozen manifest; output JSON Schema; run/result APIs.
- Tests: `DB-FIXTURE-001`, `API-IDEM-001` with 20 replays, `UNIT-STATE-001`, `SEC-QUEUE-CODEC-001` canonical round-trip plus malformed UTF-8/JSON, duplicate keys, noncanonical bytes, depth/size limits, every missing/extra/wrong-type/range ARQ v0.28 envelope field, raw pickle gadget canary, exact ARQ `f=''` deserialization-failure→double serializer rejection→`result_data=None`, worker-stays-alive/no-DB-side-effect/no-fallback proof; `INT-OUTBOX-001` shared publisher/decoded equality/lost/duplicate/ambiguous/mismatch/poison/forged-confirm, deterministic consumer-before-confirm and confirm-before-consumer interleavings, execution-claim versus dispatch-fail/reconcile lock interleavings with no deadlock/partial commit and stale-token retry, exact-current-unconfirmed transport retry with zero DB attempt, separate connect-refusal/connect-stall/in-flight-command/post-send-response timeout injection with no hidden retry or false confirmation, matching key absent from/wrong target ZSET and wrong-queue-plus-in-progress state must not confirm, exact target-queue proof, Redis loss before claim, after running claim, during retry, 120s/incident recovery, active-lease exclusion, and attempt/generation exhaustion; `INT-QUEUE-001` strict payload plus missing/malformed/cross-run job ID, guessed run, wrong/stale/future generation, stored-job mismatch, bounded unconfirmed/capacity handshakes, crash/redelivery, zero attempt/result/provider work on rejection; `INT-WORKER-LIMIT-001` includes 4+ simultaneous same-org claims across replicas, max 3 active slots, capacity loser zero attempt/manifest, three active leases changed to cancel-requested still block until close/expiry, and different-org noninterference; `INT-WORKER-001`, `SCHEMA-RESULT-001`, `INT-PROV-001`, `SEC-EGRESS-001`, `INT-BACKPRESSURE-001`.
- Dependencies: P2-03; Redis exact image; separate local `simula_worker` credential.
- Observability: outbox pending/age/attempt, ARQ queued/active/retry, run transitions/duration, lease, external-provider-call count zero.
- Security/privacy: run-ID-only queue payload; no service-role key; worker DB role/helper grants cannot execute user commands or arbitrary reads; output treated as untrusted data; exact rate/resource limits.
- Fixture/external state: authored non-representative audience + deterministic expected result. Local Redis/Supabase only.
- Rollback: disable run creation, pause workers/dispatcher, preserve outbox, revert compatible code, replay due outbox.

### P2-05 — Trustworthy accessible result experience — 5 points

- Outcome: strategist understands state, demo output, provenance, and limits without mistaking it for human evidence.
- Acceptance links: AC-RES-001–003, AC-ERR-001, AC-A11Y-001/002.
- ADRs: ADR-0005, ADR-0007, ADR-0009, ADR-0010.
- Threats: T-03 output handling, T-08 export absence, T-11 logging, T-13 tampering.
- Scope/boundary: bounded polling; all state/error/empty/loading views; typed distribution/table; synthetic rationale; limitations/provenance view; responsive keyboard-first UI. No export/share/chart without text equivalent.
- Contract/data change: generated exhaustive result/state renderer; no database schema unless safe read projection is required.
- Tests: result component enum exhaustiveness, `E2E-RESULT-001`, `E2E-ERROR-001`, `E2E-POLL-001`, `A11Y-AXE-001`, `SEC-XSS-001`, forbidden-claim scan, manual keyboard/copy review.
- Dependencies: P2-04 terminal result API.
- Observability: polling count/terminal stop, UI error/correlation, provenance-view event without content.
- Security/privacy: escaped generated text; no raw content analytics; WCAG state/status semantics.
- Fixture/external state: deterministic result fixtures only; no hosted analytics.
- Rollback: hide result route behind server flag while retaining API/readable data.

### P2-06 — Cancellation, retry, and race recovery — 5 points

- Outcome: user/operator gets bounded recovery or safe terminal outcome without duplicate result/cost.
- Acceptance links: AC-RUN-004–006, AC-ERR-001.
- ADRs: ADR-0005, ADR-0006, ADR-0007, ADR-0009.
- Threats: T-06 replay/race, T-07 exhaustion, T-09 audit, T-13 result integrity.
- Scope/boundary: cancel command/UI; failure injection; ARQ defer/retry; lease supersession; cancel-vs-result CAS; outbox poison path. No real-provider cancellation.
- Contract/data change: exact `202 cancel_requested`/`200 terminal` responses; safe error/retry fields; attempt/event records.
- Tests: `API-CANCEL-001`, `INT-CANCEL-RACE-001` result/cancel and poison/cancel winners, `INT-RETRY-001` 5s/30s/exhaustion classes, lease supersession, worker crash/ack, `E2E-CANCEL-001`, `E2E-FAIL-001`.
- Dependencies: P2-04 processing, P2-05 state UI.
- Observability: cancel latency/race outcome, retry/defer, superseded worker, terminal error, poison outbox alerts.
- Security/privacy: same-org editor/owner only; error payload/log redaction; no fallback or partial result.
- Fixture/external state: explicit safe failure fixtures; local services only.
- Rollback: disable cancel UI/route, pause consumer, reconcile authoritative DB state; never rewrite terminal result.

### P2-07 — Integrated quality, telemetry, and security gate — 5 points

- Status: reopened after independent exit-review failure; remediation active (E-5023–E-5029).
- Outcome: release owner can prove walking skeleton contracts, isolation, accessibility, resource, and operational budgets.
- Acceptance links: every AC-AUTH/ORG/TEN/PROJ/AUD/RUN/RES/ERR/A11Y criterion.
- ADRs: ADR-0002 through ADR-0010.
- Threats: T-01 through T-13.
- Scope/boundary: correlation/log/metrics/audit; full CI; security/dependency/secret/container checks; local load/idempotency/backpressure; documentation/evidence. No hosted application or production deploy.
- Contract/data change: normalized generated artifacts and verification reports only; no new product scope.
- Tests: full TRACEABILITY_MATRIX, `SEC-LOG-001`, `SEC-SECRET-001`, `SEC-BUNDLE-001`, `SEC-LIMIT-001`, `LOAD-RATE-001`, `INT-WORKER-LIMIT-001`, `SEC-ROUTE-001/002`, clean migration/contract drift, E2E.
- Dependencies: P2-01–P2-06 complete; all failures resolved.
- Observability: ADR-0009 signals/objectives measured; alert/runbook links validated locally.
- Security/privacy: independent RLS/threat/copy review; deletion test; zero Critical/High unresolved.
- Fixture/external state: synthetic fixtures only; artifacts contain no secrets/personal data. External deployment still unauthorized.
- Rollback: telemetry exporter can be disabled independently; core audit remains; revert last compatible artifacts/migrations through documented path.

## Slicing rule

Each story may use multiple small PRs, ideally below roughly 400 meaningful lines. A PR leaves main releasable, preserves contracts, and carries tests. No horizontal “all backend first” branch.

## Definition of Done

- Linked acceptance criteria pass with evidence.
- Code reviewed; exact locks; generated artifacts clean; migrations reset from zero.
- Format/lint/type/unit/integration/contract/RLS/E2E/security checks applicable to the slice pass.
- Accessibility, privacy, security, failure, observability, docs, and rollback updated.
- No disabled/ignored flaky test or unexplained warning.
- Obsidian state/changelog/risk/plan updated.
- Deployable artifact exists; external deployment occurs only with authority.
