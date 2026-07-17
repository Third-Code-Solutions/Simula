---
title: Phase 1 — Product and Architecture Definition ExecPlan
status: completed
created: 2026-07-17
updated: 2026-07-17
owner: Principal program and engineering lead
classification: PROPOSED
source_of_truth: true
---

# 1. Title and Status

- Plan: Phase 1 — Product and Architecture Definition
- Owner: Principal program and engineering lead
- Created: 2026-07-17
- Last updated: 2026-07-17
- Status: Completed; independent Phase 1 gate passed with 0 Critical / 0 High / 0 Medium.

# 2. Purpose and User Outcome

Turn Phase 0 evidence into a review-ready product/method/data/security design and implementation backlog. Outcome: a new engineer can implement the Phase 2 walking skeleton without guessing product scope, data ownership, authorization, job semantics, output types, contracts, tests, or rollback.

# 3. Current State

- Phase 0 canonical evidence and discovery artifacts exist in [[../../brain/00_HOME|Obsidian Brain]].
- No application source, manifests, tests, migrations, CI, or infrastructure scaffold exists.
- Architecture remains documentation-only. ADR-0002 through ADR-0010 now decide the Phase 2 queue, tenancy/RLS, contracts, provider boundary, environments, retention, and resource thresholds; implementation evidence remains pending.
- Competitor efficacy and coverage claims remain external REPORTED evidence, not SIMULA validation.
- Existing accepted boundary: [[../../brain/Decisions/ADR-0001-PHASE-0-ARCHITECTURE-BOUNDARY|ADR-0001]].

# 4. Scope

## In scope

- Validate first user/job; approve MVP and non-goals.
- Complete testable PRD and journey acceptance criteria.
- Approve methodology v0, output type system, uncertainty, evaluation ladder, and threshold policy.
- Approve demo-data policy, provenance registry, lifecycle, and privacy/legal gates.
- Approve system/data/API/job/provider/deployment/observability architecture through ADRs.
- Define threat-to-control-to-test and requirement-to-acceptance-to-test traceability.
- Define OpenAPI/JSON Schema and database/RLS specifications sufficient for Phase 2.
- Research and pin current stable tool/runtime/dependency versions.
- Produce ordered vertical backlog, Definition of Ready, rollback, and Phase 2 gate.

## Out of scope

- Full interface or Phase 2 walking-skeleton implementation.
- External provisioning, paid-vendor acceptance, production data, or production deployment.
- Predictive-validity, representativeness, or legal-compliance claims.
- Billing/payment.

## Assumptions

- Phase 2 uses authored non-representative demo data and deterministic mock provider.
- Vercel, Railway, and Supabase remain mandated unless an ADR documents a superior compatible choice.
- Real providers and external data stay disabled until separate gates pass.

# 5. Proposed Design

## Product

Select the highest-evidence user/JTBD hypothesis for an experimental prototype without claiming demand. Prespecify structured interviews/task tests as a staging gate. Approved smallest vertical slice: sign-in → organization → project → text stimulus → demo audience → async mock run → typed result/provenance.

## Architecture

- apps/web: Next.js on Vercel; UI, session refresh, synchronous BFF concerns.
- services/api: FastAPI on Railway; contracts, object authorization, job creation/status/results.
- services/worker: private Railway service; queue consumer and provider/model execution.
- Supabase: Auth, Postgres, RLS, Storage, migrations, and transactional queue outbox.
- Railway: API, worker/dispatcher, and private Redis/ARQ queue transport.
- Postgres: durable job/idempotency/version/audit source of truth.

## Required ADRs

1. Toolchain, runtimes, package managers, dependency pinning, generated-code policy.
2. Identity, membership, authorization, write ownership, exposed schemas, RLS.
3. Data model, immutable versions, audit, ground-truth separation, retention/deletion.
4. API/OpenAPI/JSON Schema authority, errors, pagination, idempotency, compatibility.
5. Queue/state machine, visibility lease, retry/backoff, cancellation, terminal failure, duplicate prevention.
6. Provider abstraction, structured output, minimization, timeout/retry, fallback prohibition, cost, mock.
7. Environments, networking, secrets, migrations, preview data, promotion, rollback.
8. Correlation, audit events, metrics, SLO inputs, alert ownership, sensitive logging.
9. Export/share authorization and artifact storage, or explicit Phase 2 deferral seam.

## Security and privacy

Default-deny tenancy. Server authorization plus RLS/GRANT defense in depth. No browser service credentials. PIA/legal gates for personal data/providers. Model content and output remain untrusted data. Each threat maps to prevention, detection, response, and tests.

## Compatibility and rollback

Use additive contracts/migration specifications for the walking skeleton. Every ADR records rejected options and rollback. With no external state, Phase 1 rollback is document/contract revision.

# 6. Milestones

## M0 — Product evidence and acceptance

- Work: select the bounded prototype user/JTBD, preserve demand as unknown, prespecify validation; approve MVP, non-goals, journey/states, accessibility/trust acceptance.
- Files: brain/Product/*, brain/QA/TEST_STRATEGY.md, research note.
- Acceptance: public evidence supports the problem shape; demand remains explicitly unknown; first job is approved for prototype learning; behavior has Given/When/Then criteria and a prespecified human-evidence gate.
- Tests: requirement/acceptance/test traceability; forbidden-claim review.
- Verification: link/frontmatter checks and independent product review.
- Recovery: retain hypothesis status and narrow scope; do not invent demand.

## M1 — Methodology, evaluation, data, privacy

- Work: approve specifications, output taxonomy, demo frame, provenance, evaluation, admission gates.
- Files: brain/Methodology/*, brain/Data/*, brain/Security/PRIVACY_MODEL.md, ADRs.
- Acceptance: no unresolved Critical construct, data-rights, benchmark, or disclosure decision for Phase 2.
- Tests: method examples, deterministic fixture spec, provenance completeness, privacy/threat review.
- Verification: independent methodology/data review and traceability matrix.
- Recovery: keep outputs experimental; remove unsupported metric/slice.

## M2 — Architecture, contracts, tenancy

- Work: approve ADRs; define data model, contracts, state machine, RLS matrix, topology, observability.
- Files: brain/Architecture/*, brain/Operations/*, brain/Decisions/*, approved specifications.
- Acceptance: one owner/contract per transition; denial/retry/timeout/rollback behavior specified.
- Tests: schema/OpenAPI lint plan, transition tests, RLS adversarial matrix, threat review.
- Verification: architecture/security review and current official docs/version check.
- Recovery: supersede ADR; remove unapproved artifact before Phase 2.

## M3 — Quality system and backlog

- Work: choose lint/type/test/contract/migration/security tooling and CI gates; split Phase 2 vertically.
- Files: brain/QA/*, implementation backlog, Ready/Done definitions.
- Acceptance: every criterion/threat maps to test and owner; stories are small, ordered, estimable.
- Tests: traceability validator and command/tool dry-run.
- Verification: QA and delivery review.
- Recovery: block Phase 2 until missing test/owner/dependency resolves.

## M4 — Final Phase 1 review

- Work: independent contradiction, security, methodology, feasibility, and gate audit.
- Files: state, changelog, risks, plan, resolved notes.
- Acceptance: no unresolved Critical or High finding; all exit criteria evidenced.
- Tests: documentation/link/YAML/contract/spec and no-premature-code audit.
- Verification: exact commands/results in Section 10.
- Recovery: keep Phase 1 active and Phase 2 blocked.

# 7. Risks

- User/JTBD remains unvalidated. Mitigation: interviews/design-partner evidence; narrow scope.
- Architecture overfits future phases. Mitigation: Phase 2 vertical slice and explicit deferrals.
- Auth/RLS hides tenant paths. Mitigation: ownership graph, policy matrix, independent review.
- Method lacks defensible thresholds. Mitigation: experimental labels; omit unsupported metric.
- Living platform APIs change. Mitigation: official changelog/docs and exact pins at decision time.
- Planning becomes prose. Mitigation: contract examples, state tables, traceability, command dry-runs.

# 8. Decisions

- 2026-07-17 — PROPOSED: draft during Phase 0 closure for self-contained Phase 1 entry.
- 2026-07-17 — PROPOSED: prohibit Phase 2 scaffold until this plan’s exit gate passes.
- 2026-07-17 — SUPERSEDED: Supabase Queues was a candidate pending ADR review; governing-contract audit rejected it.
- 2026-07-17 — ACCEPTED: choose brand/agency strategist pre-research wording pressure test as the prototype hypothesis; no demand claim. Human discovery is required before staging acceptance.
- 2026-07-17 — ACCEPTED: authored non-personal demo fixture, deterministic no-egress mock, explicit demo output kind, and no predictive threshold/kind in Phase 2.
- 2026-07-17 — ACCEPTED: ADR-0002 through ADR-0010 decide toolchain, contracts, auth/RLS, data lifecycle, queue/state, provider, deployment, observability, and export deferral.
- 2026-07-17 — SUPERSEDED AFTER REVIEW: Supabase Queues/pgmq conflicted with AGENT.md's Railway queue mandate.
- 2026-07-17 — ACCEPTED: private Railway Redis + ARQ transport, Supabase transactional outbox/Postgres-authoritative state, deterministic job IDs, and idempotent lease-token consumers.
- 2026-07-17 — SUPERSEDED AFTER REVIEW: caller-token Data API domain access and user/API dispatch confirmation were not enforceable browser boundaries.
- 2026-07-17 — ACCEPTED: application schemas are not Data API exposed; separate least-privilege `simula_api`/`simula_worker` Postgres roles, transaction-local verified claims, RLS reads, complete private atomic command helpers, self-only membership reads, and service-only outbox confirmation.
- 2026-07-17 — CORRECTED BY RESOLVER: ARQ 0.28 requires redis-py `<6`; select redis-py 5.3.1 with exact Redis server 8.2.7 integration proof required in Phase 2.
- 2026-07-17 — CORRECTED BY PEER AUDIT: openapi-typescript 7.13.0 requires TypeScript 5.x; select TypeScript 5.9.3 and the complete 31-pin npm baseline.
- 2026-07-17 — CORRECTED BY SECURITY AUDIT: ARQ's default pickle codec is prohibited; use one bounded canonical stdlib-JSON codec on every queue producer/inspector/worker, no fallback, and versioned queues.
- 2026-07-17 — CORRECTED BY PEER REPLAY: config-next's plugins do not support ESLint 10; select ESLint 9.39.5. All 31 exact npm pins now dry-resolve with zero peer/ERESOLVE warnings.
- 2026-07-17 — CONDITIONAL PROTOTYPE ACCEPTANCE: ARQ 0.28 is maintenance-only. Phase 2 must prove the exact Python/ARQ/Redis stack; Phase 5 must approve a tested queue-library exit plan before staging.

# 9. Progress

- [x] Draft Phase 1 plan from Phase 0 evidence.
- [x] Activate after Phase 0 completion.
- [x] M0 product evidence and acceptance.
- [x] M1 methodology/data/privacy.
- [x] M2 architecture/contracts/tenancy.
- [x] M3 quality system/backlog.
- [x] M4 final review — all dependency, authorization, dispatch, serialization, durability, timeout, queue-binding, concurrency, and cancellation findings corrected; final independent review passed 0 Critical / 0 High / 0 Medium.

## Phase 1 exit criteria

- [x] User/job, MVP, non-goals, success measures, and Given/When/Then acceptance approved for experimental prototype; demand remains UNKNOWN.
- [x] Methodology, output types, uncertainty, evaluation, scope, and fail-closed threshold policy approved.
- [x] Demo-data/provenance/privacy/legal/provider gates approved; unresolved production facts explicitly block later gates.
- [x] Required ADRs accepted; no known unresolved Critical architecture/security decision.
- [x] Data model, contracts, job state, auth/RLS, errors, retries, observability, rollback implementation-ready.
- [x] Threats and requirements map to tests/owners.
- [x] Ordered Phase 2 backlog was rewritten with every Definition-of-Ready field; independent readiness recheck passed 7/7.
- [x] Independent review has no unresolved Critical, High, or Medium finding.
- [x] Obsidian state, changelog, risks, decisions, and validation evidence current before final review.

# 10. Validation Evidence

Evidence as of 2026-07-17:

- Fetched and scanned `https://supabase.com/changelog.md`; reviewed TypeScript/Node deprecations, Data API exposure change, and pgmq upgrade hazard.
- Official sources confirmed Node `24.18.0` LTS, Python `3.14.6`, and Next.js 16.2. npm/PyPI registry queries captured exact direct pins and declared runtime compatibility.
- Pinned Supabase CLI `2.109.1`; dry-ran help for database, migration, and type-generation surfaces without provisioning resources.
- ADR-0002 through ADR-0010 accepted. Product acceptance, output contract, demo-data policy, authorization matrix, security control/test matrix, traceability, and Phase 2 vertical backlog are linked from the vault Home.
- Current correction audit: `55/55` Markdown files have required YAML; `128/128` Obsidian wikilinks and `54/54` Home links resolve; `68` evidence IDs are defined with no undefined or duplicate ID.
- `git status --short` still shows only untracked documentation/governance files. No app source, manifest, migration, CI, infrastructure, or external resource was created before this gate.
- Initial independent Phase 1 audit: `0 Critical / 6 High`. Corrections: Railway Redis/ARQ queue + Supabase outbox; valid `@axe-core/playwright` pin; exact org/membership deferral contract; cancel CAS outcomes; per-story DoR fields; exact resource/rate/backpressure limits.
- Post-redesign resolver evidence: all `31/31` exact npm pins dry-resolve together with zero peer/ERESOLVE warnings after correcting TypeScript to 5.9.3 and ESLint to 9.39.5; all `21/21` direct Python pins resolve together under `uv` for CPython 3.14/x86_64 Linux after correcting redis-py to 5.3.1; `redis:8.2.7-alpine` manifest resolves. E-4024–E-4028 record ARQ/redis/maintenance/serialization, Supabase connection/role, Psycopg, and npm peer evidence.

# 11. Final Outcome

Completed. Independent Phase 1 review passed with 0 Critical / 0 High / 0 Medium. Integrity at the gate: 55/55 governed Markdown YAML, 128/128 vault links, 54/54 Home links, 68 unique evidence IDs, 21/21 acceptance criteria traced, 7/7 Ready stories, 31 npm and 21 Python pins resolving, and zero application scaffold. Phase 2 may begin under its reviewed scope; R-020 remains a monitored prototype risk and mandatory Phase 5 exit-plan gate.
