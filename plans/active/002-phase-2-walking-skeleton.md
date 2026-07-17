---
title: Phase 2 — Walking Skeleton ExecPlan
status: active
created: 2026-07-17
updated: 2026-07-17
owner: Principal program and engineering lead
classification: PROPOSED
source_of_truth: true
---

# 1. Title and Status

- Plan: Phase 2 — Walking Skeleton
- Owner: Principal program and engineering lead
- Created: 2026-07-17
- Last updated: 2026-07-17
- Status: Active; Phase 1 independent gate passed 0 Critical / 0 High / 0 Medium.

# 2. Purpose and User Outcome

Deliver the thinnest trustworthy end-to-end prototype: a strategist authenticates locally, creates an organization/project/versioned text stimulus, selects the authored non-representative demo audience, submits one asynchronous run, and receives one accessible deterministic result that explicitly estimates nobody. The slice must prove tenant isolation, atomic commands, queue durability, bounded recovery, reproducibility, contracts, observability, and rollback—not market demand or predictive validity.

# 3. Current State

- Phase 0 and Phase 1 are completed: [[../completed/000-phase-0-evidence-and-discovery|Phase 0]] and [[../completed/001-phase-1-product-and-architecture-definition|Phase 1]].
- [[../../brain/00_HOME|Obsidian Brain]] is authoritative for product, method, data, architecture, security, operations, and QA decisions.
- [[../../brain/QA/PHASE_2_BACKLOG|Phase 2 Backlog]] contains seven ordered vertical stories with all Ready fields.
- [[../../brain/Product/ACCEPTANCE_CRITERIA|Acceptance Criteria]] and [[../../brain/QA/TRACEABILITY_MATRIX|Traceability Matrix]] define the required behavior and tests.
- Phase 1 closed with 55/55 governed Markdown YAML, 128/128 links, 68 unique evidence IDs, 21/21 acceptance criteria traced, 7/7 Ready stories, exact dependency resolution, and zero scaffold.
- Repository has no commits; all governance files remain untracked. Preserve user-owned state and do not commit or publish without explicit instruction.

# 4. Scope

## Included

- P2-01: reproducible pnpm/Turbo + uv monorepo, exact runtime/direct pins and locks, minimal web/API/worker/contracts/core packages, local Redis/Supabase configuration, CI skeleton.
- P2-02: ordered Supabase SQL migrations, authored local fixtures, dedicated runtime/definer roles, non-exposed application schemas, RLS, complete atomic command helpers, adversarial role tests.
- P2-03: Supabase Auth session flow, FastAPI JWT/JWKS validation, transaction-local verified claims, organization/project/stimulus vertical, generated contracts, accessible forms and states.
- P2-04: atomic frozen run/outbox, exact canonical ARQ v0.28 JSON transport, service-only dispatch, Postgres-bound worker claims, deterministic no-egress mock, immutable typed result.
- P2-05: accessible result/status/provenance/limitations experience with bounded polling and exhaustive state rendering.
- P2-06: cancel/result CAS, retry/failure classes, leases, duplicate delivery, Redis-loss reconciliation, poison and concurrency races.
- P2-07: full local CI-quality gate, telemetry, security, load/resource, migration/contract drift, E2E, evidence, and independent review.

## Excluded

- Real model/provider calls, real Philippine population claims, official/microdata ingestion, scraping, uploads, calibrated or predictive output.
- Membership management, exports/shares, realtime subscriptions, billing, customer data, hosted analytics.
- Paid resource creation, hosted Supabase/Railway/Vercel mutation, staging/production deployment, or production data without explicit authority. The user authorized and completed only the named Supabase P2-03 schema migration; no seed, fixture, or production data was applied.
- Phase 3 methodology expansion, Phase 4 MVP breadth, and any representativeness/survey-replacement claim.

# 5. Proposed Design

## Repository shape

```text
apps/web/                  Next.js App Router UI
services/api/              FastAPI HTTP authority
services/worker/           ARQ dispatcher/worker entry point
packages/contracts/        generated OpenAPI/JSON Schema/TypeScript
packages/simula-core/      shared Python domain/queue contracts
supabase/migrations/       ordered SQL authority
supabase/seed.sql          authored demo/local fixtures
tests/                     cross-service, security, load, E2E
```

## Runtime and contracts

- Exact toolchain/dependencies from [[../../brain/Decisions/ADR-0002-TOOLCHAIN-AND-GENERATED-CONTRACTS|ADR-0002]]; clean locks are evidence, not a reason to float versions.
- Browser uses Supabase Auth only. FastAPI is the public domain API. It validates JWT/JWKS, uses dedicated `simula_api`, installs allowlisted claims transaction-locally, reads under RLS, and writes only through complete helpers.
- Supabase Postgres is authoritative for versions, idempotency, run/outbox/attempt/event/result, and audit. `api`/`private` are absent from browser Data API exposure.
- Railway-compatible private Redis/ARQ is transport only. Implement [[../../brain/Decisions/ADR-0006-QUEUE-AND-RUN-STATE-MACHINE|ADR-0006]] exactly: strict v0.28 envelope codec, target-ZSET confirmation proof, job-context/current-outbox binding, named claim/heartbeat/complete/fail helpers, fixed lock order, three DB attempts, three dispatch generations, and bounded recovery.
- Phase 2 provider is the deterministic, network-denied mock in [[../../brain/Decisions/ADR-0007-PROVIDER-BOUNDARY-AND-MOCK|ADR-0007]]. Output must conform to the frozen result schema and [[../../brain/Methodology/OUTPUT_TYPE_SYSTEM|Output Type System]].
- FastAPI/Pydantic generates OpenAPI/result JSON Schema; TypeScript and database types are generated and checked from clean state.

## Delivery and verification policy

- Implement one story at a time in dependency order. Keep each milestone runnable and rollback-safe.
- Tests land with behavior. No known Critical/High is deferred. Failing security, isolation, migration, contract, or no-egress tests stop the line.
- Use authored fictional fixtures only. Logs, metrics, snapshots, and build artifacts contain no secrets or personal/content payloads.
- No external deployment. Local Docker/Supabase processes and disposable test state are authorized implementation dependencies.

# 6. Milestones

## M0 — P2-01 reproducible foundation

- Create exact manifests/workspaces, minimal health apps, shared config, non-root containers, local Redis 8.2.7, Supabase config, contract-generation path, and CI tasks.
- Gate: clean pnpm/uv resolution and locks; zero peer/ERESOLVE warnings; format/lint/type/unit smoke; exact Python 3.14.6/ARQ/redis-py/Redis startup-enqueue-retry-crash-shutdown proof; no domain table/UI yet.
- Rollback: remove only scaffold/config introduced by this milestone; governance remains intact.

## M1 — P2-02 tenant-safe database and local Auth

- Implement schemas, roles, grants, RLS, atomic organization foundation, authored fixtures, migration reset, and catalog-derived privilege tests.
- Gate: reset twice; pgTAP/SQL tests; Data API denial with anon/authenticated; direct DML denial; helper/claims/pool-reset/cross-tenant/self-membership tests all pass.
- Rollback: local reset/replay; never bypass or disable RLS to make a test pass.

## M2 — P2-03 organization/project/stimulus vertical

- Implement exact FastAPI contracts, auth/session client, generated client/types, idempotent organization/project commands, immutable stimulus versions, accessible web journey.
- Gate: API contract/error/idempotency/version tests plus E2E sign-in→organization→project→stimulus; foreign UUIDs and forged claims fail closed.
- Rollback: disable/hide write UI/routes while preserving compatible readable local state.

## M3 — P2-04 durable asynchronous deterministic run

- Implement frozen manifest, run/outbox schema/helpers, strict queue adapter/codec, dispatcher, worker helpers, deterministic mock, typed result APIs.
- Gate: exact envelope adversarial/liveness tests; target-queue/confirmation/timeout/job-binding/lock-order/capacity/loss tests; zero external network calls; one terminal result under duplicates/crashes.
- Rollback: disable run creation, pause worker/dispatcher, preserve Postgres intent, revert compatible code, replay/reconcile when restored.

## M4 — P2-05 trustworthy result experience

- Implement status/error/empty/loading/result/provenance/limitations views, bounded shared polling, escaped exhaustive output rendering, keyboard and text equivalents.
- Gate: E2E result/error/polling, enum exhaustiveness, XSS, axe, keyboard, responsive and forbidden-claim checks.
- Rollback: hide result route behind a server-owned flag; retain authorized API data.

## M5 — P2-06 cancellation and recovery

- Implement cancellation API/UI, worker checkpoints, safe retry classes/backoff, lease supersession, poison/exhaustion paths, Redis-loss generation reconciliation.
- Gate: cancel-vs-result and poison-vs-cancel dual-winner tests, retry timing/exhaustion, worker crash/ack, stale lease, active-cancel occupancy, and user-facing failure E2E.
- Rollback: disable cancel UI/route, pause consumer, reconcile from authoritative Postgres; never rewrite a terminal result.

## M6 — P2-07 integrated quality gate

- Complete structured telemetry, audit/correlation, security/secret/SCA/container checks, load/backpressure/resource tests, clean migration/contract generation, full E2E and evidence update.
- Gate: every [[../../brain/QA/TRACEABILITY_MATRIX|traceability]] row passes; no Critical/High; current docs/risks/runbooks; clean working-tree generation check; independent review.
- Rollback: telemetry export may be disabled independently; core audit remains; revert only to a schema-compatible artifact.

# 7. Risks

- R-013/R-018: tenant bypass or stale verified claims. Mitigate with non-exposed schemas, least-privilege roles, complete helpers, RLS, catalog diff, and adversarial pool-reuse tests.
- R-017/R-019: Redis loss or false dispatch confirmation. Mitigate with Postgres outbox/state, exact target-queue proof, bounded generations, fixed locks, and failure-injection tests.
- R-020: ARQ is maintenance-only. Contain it behind an adapter, prove the exact runtime now, and preserve the mandatory Phase 5 migration/exit decision.
- Supply-chain/runtime drift: exact pins/locks/actions, clean install, SBOM/audit, and no warning-tolerant resolver gate.
- R-021: Docker Desktop 4.82.0 and Windows hypervisor remediation followed by reboot restored Docker 29.6.1. Retain fail-closed local preflight; do not substitute hosted state; status is Mitigated.
- False precision/representation: deterministic demo only; values estimate nobody; provenance/limitations visible; forbidden-claim tests.
- Scope/time risk: vertical story gates, explicit non-goals, no hosted provisioning, WIP one milestone.

# 8. Decisions

- 2026-07-17 — ACCEPTED: Phase 1 final independent review passed 0 Critical / 0 High / 0 Medium; Phase 2 may start.
- 2026-07-17 — ACCEPTED: execute P2-01 through P2-07 in order; each gate must pass before dependent scope.
- 2026-07-17 — ACCEPTED: local/disposable services only; no hosted resource or production mutation is authorized.
- 2026-07-18 — OBSERVED: MCP-authorized access as `kurtgav` confirmed active project `ywiwmczccktwzqyhzhiz` (Simula), bootstrapped the four runtime/owner roles, and applied all three checked-in P2-03 migrations seed-free. Remote history was reconciled to the checked-in versions and reports 9 `api` plus 5 `private` empty RLS tables (E-5011). The unlinked CLI must compare history and inspect a dry-run before future migrations.
- 2026-07-17 — ACCEPTED: strict Phase 1 ADRs and resource/control matrices are implementation specifications, not suggestions.
- 2026-07-17 — ACCEPTED: R-020 does not block the local prototype but blocks Phase 6 until the Phase 5 queue exit-plan gate passes.
- 2026-07-17 — ACCEPTED: M0 uses Vite 8 native TS-path resolution instead of the redundant deprecated plugin and overrides Next's vulnerable PostCSS transitive to accepted 8.5.19; clean build/test/audit proves compatibility.
- 2026-07-17 — OBSERVED: R-021 initially prevented Docker runtime evidence on this host. Enabling OS/firmware virtualization or using another authorized host required user authority; this historical record was superseded by the 2026-07-18 repair.
- 2026-07-17 — ACCEPTED: M0 integration tests are intrinsically bounded to fixed loopback Redis DB 15 and dedicated test-owned queue/job/state keys; production Redis configuration cannot redirect them and cleanup never flushes a database. FastAPI exposes only the two declared health routes at runtime.
- 2026-07-17 — ACCEPTED: pnpm 11 policy is asserted from `pnpm-workspace.yaml`; Moderate advisories block; readiness returns 503 for missing/unsafe environment-specific metadata; CI starts, probes, resets, and always removes only its disposable local Supabase stack without printing local credentials.
- 2026-07-17 — ACCEPTED: `pnpm verify:m0-runtime` is the single local M0 runtime command. It sanitizes routing, accepts only a validated local socket/pipe Docker context, refuses linked/occupied/pre-existing/cross-clone-concurrent state before mutation, uses per-run owned namespaces, suppresses both Supabase output streams, contains command trees, uses direct loopback health, and attempts exact cleanup after failure, timeout, or catchable interruption; SIGTERM cleanup is a POSIX guarantee (E-4030–E-4033).
- 2026-07-17 — OBSERVED: user host remediation restored Docker 29.6.1; the exact M0 gate now passes. Canonical Compose validation requires loopback-only Redis publication on a non-internal local DNS bridge. R-021 is Mitigated and P2-02 is unlocked (E-5008).
- 2026-07-17 — ACCEPTED: M1 / P2-02 passes its exact local gate. The first migration owns all application DDL; `roles.sql` is the privileged local/CI global bootstrap; runtime passwords remain injected and absent from source; browser roles cannot reach application schemas; complete organization writes remain helper-only (E-5009).
- 2026-07-18 — OBSERVED: P2-03/M2 passes its final local and independent-review gate (E-5010). Two clean resets, lint, 32 pgTAP, 26 API tests, five integrations, generated type/contract checks, full repository quality/SCA, immutable-version browser proof, review-remediated Redis/auth/audit/media/CORS controls, and two final clean independent reviews are complete. M3/P2-04 is unlocked; its first strict ARQ codec slice is committed after a green repository gate.

# 9. Progress

- [x] Phase 1 gate passed and completed plan recorded.
- [x] Phase 2 backlog Ready check passed 7/7.
- [x] Phase 2 ExecPlan activated before scaffold.
- [x] M0 / P2-01 reproducible foundation.
  - [x] Exact Node/pnpm/Python/uv bootstrap, manifests, pnpm/uv locks, and frozen resolution.
  - [x] Minimal web/API/worker/contracts/core source, health/correlation tests, generated contracts, local configs, pinned CI/actions/images, non-root Dockerfiles, JSON-only ARQ probes.
  - [x] Format, lint, strict type, unit, build, contract-drift, secret, Compose, manifest, SCA, and static reviewer-correction gates pass.
  - [x] Independent M0 static confirmation passes 0 Critical / 0 High / 0 Medium.
  - [x] Fail-closed local M0 runtime harness has 30 applicable Windows passes and 2 expected POSIX-only skips across its 32-test suite, including canonical loopback/private-DNS Compose enforcement.
  - [x] Exact Redis/ARQ crash-retry-shutdown, Supabase Auth/reset, three container builds, non-root runtime, API/worker probes, and exact cleanup pass (E-5008).
- [x] M1 / P2-02 tenant-safe database and local Auth.
  - [x] First ordered migration, authored Auth fixtures, exact runtime/owner roles, non-exposed schemas, 14 constrained tables, forced RLS, 16 policies, composite tenant FKs, and complete idempotent organization helper.
  - [x] Two consecutive resets, database lint, 32/32 pgTAP catalog assertions, Data API denial, real-role claims/pool-reset/direct-DML/cross-tenant/idempotency/late-failure/deletion-skeleton tests, and generated database-type drift pass (E-5009).
  - [x] Full repository quality, 5/5 combined integration, 157-file secret baseline, and Moderate-blocking npm/Python SCA pass.
- [x] M2 / P2-03 organization/project/stimulus vertical.
  - [x] API/database/web implementation: authenticated organization/project/stimulus-version commands, generated contracts, immutable hashes, API RFC 9457/idempotency/version behavior, and accessible Auth-only web forms/lists/detail states.
  - [x] Static implementation checks: API unit 26/26; web unit 5/5; strict Python and web TypeScript/lint/format; Next production build.
  - [x] Reset-driven local API/database integration and generated database-type drift under exact Node 24.18.0/pnpm 11.13.1.
  - [x] Sign-in-to-stimulus Playwright E2E, including a second immutable version with a distinct checksum.
  - [x] Independent M2 review: remediation loop and two final reviewers reported no actionable findings.
- [ ] M3 / P2-04 durable deterministic run.
- [ ] M4 / P2-05 trustworthy result experience.
- [ ] M5 / P2-06 cancellation and recovery.
- [ ] M6 / P2-07 integrated quality gate.
- [ ] Independent Phase 2 review passes and state transitions to Phase 3.

## Phase 2 exit criteria

- [ ] End-to-end local strategist journey works against generated contracts.
- [ ] All 21 Phase 2 acceptance criteria and traceability tests pass.
- [ ] Tenant isolation, Data API denial, claims cleanup, helper atomicity, queue forgery/loss/race, no-egress, accessibility, resource, and recovery gates pass.
- [ ] Clean exact installs/locks, migration reset, generated artifact drift, lint/type/test/build/security checks pass.
- [ ] Result says authored demo/non-representative/estimates nobody and exposes frozen provenance/limits.
- [ ] Obsidian state/changelog/risks/evidence/runbooks reflect implemented truth.
- [ ] Independent review reports no unresolved Critical or High finding.
- [ ] No production deployment or unauthorized external resource/data mutation occurred.

# 10. Validation Evidence

Entry evidence as of 2026-07-17:

- Independent Phase 1 reviewer: PASS, 0 Critical / 0 High / 0 Medium.
- Phase 1 integrity: 55/55 YAML, 128/128 vault links, 54/54 Home links, 68 unique evidence IDs, 21/21 acceptance criteria traced, 7/7 Ready stories, zero scaffold.
- Dependency feasibility: 31 exact npm pins resolve with zero peer/ERESOLVE warnings; 21 direct Python pins resolve together for CPython 3.14/Linux; Redis 8.2.7 image manifest resolves.
- [[../../brain/Decisions/ADR-0002-TOOLCHAIN-AND-GENERATED-CONTRACTS|ADR-0002]] through [[../../brain/Decisions/ADR-0010-EXPORT-SHARE-AND-STORAGE-SEAM|ADR-0010]] are accepted implementation inputs.
- No application manifest, source, migration, CI, infrastructure, hosted resource, or production change existed at entry.

Milestone commands, test reports, generated hashes, migration evidence, screenshots, and independent findings will be appended as work lands. Claims remain `PROPOSED` until demonstrated and recorded.

M0 evidence on 2026-07-17:

- Exact check passed: Node 24.18.0, pnpm 11.13.1, Python 3.14.6, uv 0.11.19, Supabase CLI 2.109.1.
- Frozen locks passed: pnpm 596-package graph; uv 74-package resolution/73-package environment; ARQ 0.28.0, redis-py 5.3.1, and hiredis 3.4.0 import on Python 3.14.6.
- Static/host gates passed: Prettier/Ruff format, ESLint/Ruff lint, TypeScript/mypy strict type check over 30 Python source files, 4 web/contract tests, 61 Python unit tests plus 2 expected POSIX-only skips, Next 16.2.10 production build, byte-comparison contract drift, 148-file secret baseline, canonical Compose validation, and zero known Moderate-or-higher npm or known Python dependency vulnerabilities.
- Initial independent M0 static audit found one High and one Medium; both were corrected. Re-audit found 0 Critical / 0 High / 4 Medium; effective pnpm policy/lock state, Moderate SCA blocking, fail-closed readiness, and fail-clean Supabase CI lifecycle were corrected. Final static confirmation passed 0 Critical / 0 High / 0 Medium and rechecked 31/31 Python unit tests.
- Generated outputs: health-only OpenAPI/TypeScript, documented readiness 503, plus fail-closed pre-P2-04 result schema (`not: {}`). Vite 8 native path resolution replaced redundant/deprecated `vite-tsconfig-paths`; Next's vulnerable PostCSS transitive is constrained to accepted PostCSS 8.5.19 and audit is clean.
- Registry manifests match committed indexes: Redis `sha256:223b183c...75fd`, Node `sha256:6f7b03f7...452d`, Python `sha256:86f975ac...1a30`, uv `sha256:b46b03dd...36f6`. GitHub actions use immutable commits.
- Config validation: pinned Supabase CLI parsed `config.toml` without deprecation/config error when pointed at a deliberately refused Docker socket; no hosted project was linked or mutated.
- Runtime harness evidence (E-5006/E-5007): the initial 26-test platform-aware suite proved routing sanitization, local-context enforcement/re-injection, linked/nonlocal/port/namespace/cross-clone-concurrency refusal, exact ownership, credential suppression, process-tree containment, direct health, cleanup, and primary-error preservation. Initial and follow-up reviews exposed routing, ownership, termination, health, process-tree, abrupt-owner, nonzero-leader, and lock-safety gaps; all were corrected. Final independent safety review passed 0 Critical / 0 High / 0 Medium.
- Runtime acceptance (E-5008): after host remediation, the extended 32-test suite has 30 applicable Windows passes and 2 expected POSIX-only skips. Exact `pnpm verify:m0-runtime` passes Redis/ARQ, Supabase Auth/reset, pinned builds, runtime-user checks, API/worker probes, and exact cleanup. Canonical Compose rejects public/internal/extra-port/extra-network drift. Zero run-owned residues or hosted link markers remain.
- Obsidian integrity: 56/56 governed Markdown files contain required frontmatter; 145/145 wikilinks resolve; 81 evidence IDs have zero undefined or duplicate IDs; sections 1–11 remain present.

M1 evidence on 2026-07-17:

- Exact `pnpm verify:m1-database` passes two clean resets, Supabase lint, 32/32 pgTAP assertions, 2/2 Auth/Data API/runtime boundary tests, and pinned database-type drift.
- Three authored local users sign in. Anonymous and all three valid authenticated sessions receive default-schema table denial and explicit `api` profile/RPC denial; `api` and `private` remain absent from PostgREST exposure.
- Real `simula_api` session tests pass strict claims, expiration, malformed/extra claims, transaction cleanup, direct DML denial, owner-role denial, self-only membership, two-tenant isolation, wrapper/direct-helper equivalence, replay/conflict, sole-owner/audit/idempotency completeness, injected late-failure rollback, and the privileged local organization deletion-graph skeleton.
- Full `pnpm check` passes format/lint/strict types over 32 Python source files, 4 JS/TS tests, 61 Python tests with 2 expected Windows skips and 5 integrations deselected, production build, generated HTTP contract drift, and 157-file secret scan. Combined local integration passes 5/5; npm/Python SCA reports no known vulnerabilities outside intentionally skipped editable workspace distributions.
- No hosted link, external resource, production data, deployment, runtime credential, Git commit, or push was created. Linux CI and independent M1 review remain unexecuted.
- Post-M1 Obsidian integrity: 56/56 governed Markdown frontmatter, 145/145 wikilinks, 55 Home links, 82 evidence IDs with zero duplicates/undefined references, and all sections 1–11 pass.

# 11. Final Outcome

In progress. M0 and M1 are complete; M2 is active. Phase 2 completes only when M2–M6 and the independent exit review pass. Phase 3 remains blocked. Production deployment remains unauthorized.
