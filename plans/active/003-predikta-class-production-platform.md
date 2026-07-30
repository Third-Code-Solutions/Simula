---
title: Predikta-Class Production Platform ExecPlan
status: active
created: 2026-07-29
updated: 2026-07-30
owner: Principal program and engineering lead
classification: PROPOSED
source_of_truth: true
---

# 1. Title and Status

- Plan: Predikta-Class Production Platform
- Status: active
- Current milestone: M2/M3/M4/M5/M6/M7 - domain parity, transport saturation,
  governed behavioral validation/data/retrieval, and release controls. Local
  database/runtime/browser/release-admission proof exists through E-5073 and the current
  whole-repository quality/SCA gate is green; hosted and release gates remain
  open.
- Related gate: [[002-phase-2-walking-skeleton|Phase 2 Walking Skeleton]]

# 2. Purpose and User Outcome

Deliver an independently designed, production-grade behavioral campaign-testing
platform using the MIT-licensed
[`l2dnjsrud/PhantomCrowd`](https://github.com/l2dnjsrud/PhantomCrowd) as the
primary open-source implementation reference and Predikta as a public workflow
and market reference: define a target audience, submit campaign stimuli,
simulate and explain reactions, identify resonance and risk, refine the
creative, and compare a retest.

The requested implementation stack is Turborepo, Next.js/TypeScript,
NestJS/TypeScript, Python/FastAPI workers, Supabase PostgreSQL plus pgvector,
Redis/BullMQ, Supabase Storage with a governed R2 migration seam, Vercel,
Railway, Vitest/Jest/Pytest/Playwright, OpenAPI-generated TypeScript contracts,
Sentry, OpenTelemetry, and GitHub Actions.

SIMULA will not copy private competitor internals or claim population
representation, behavioral accuracy, or predictive validity without independent
evidence.

# 3. Current State

- The repository has a strong tenant-safe Phase 2 walking skeleton:
  Next.js, FastAPI, Supabase/RLS, Redis/ARQ, deterministic experimental output,
  generated contracts, extensive tests, and operational controls.
- The present behavioral result generator is deterministic demonstration logic,
  not a validated audience model.
- Real audience datasets, calibrated psychographic models, real provider
  execution, outcome backtesting, and scientific validation are absent.
- Phase 2 formal exit remains open for human assistive-technology evidence and
  enforceable required-check governance. This plan does not erase those gates.
- The user explicitly selected NestJS and BullMQ.
  [[../../brain/Decisions/ADR-0011-NESTJS-BULLMQ-CONTROL-PLANE|ADR-0011]]
  governs an incremental, rollback-safe migration from the existing
  FastAPI/ARQ public control plane.
- The user explicitly selected PhantomCrowd as the primary whole-product idea
  source. The inspected revision and adaptation boundary are recorded in
  [[../../brain/Research/PHANTOMCROWD_IMPLEMENTATION_REFERENCE|the implementation reference]]
  and
  [[../../brain/Decisions/ADR-0012-PHANTOMCROWD-DERIVED-BEHAVIORAL-ENGINE|ADR-0012]].
- [[../../brain/Decisions/ADR-0013-GOVERNED-PGVECTOR-RETRIEVAL|ADR-0013]]
  governs model admission, immutable vector binding, exact graph retrieval, and
  the inactive-until-proven product boundary.

# 4. Scope

## Included

- NestJS public control plane with strict validation, Supabase JWT verification,
  organization-scoped authorization, RFC 9457 failures, idempotency, quotas,
  correlation IDs, OpenAPI 3.1, and generated TypeScript client.
- BullMQ transport behind a queue port while PostgreSQL remains authoritative
  for runs, attempts, leases, outbox state, results, and audit.
- Private Python/FastAPI AI engine and workers for methodology execution,
  provider orchestration, numerical scoring, embeddings, qualitative
  explanations, and validated result persistence.
- Versioned audience definitions, licensed/consented/public data provenance,
  psychographic traits, behavioral segments, stimuli, campaign tests,
  simulation manifests, results, recommendations, comparisons, and observed
  outcome datasets.
- pgvector retrieval for governed evidence and audience/model artifacts where a
  measured retrieval use case justifies it.
- Private stimulus assets in Supabase Storage. A storage port preserves a later
  Cloudflare R2 migration without changing domain contracts.
- Next.js campaign lab covering audience, stimulus, simulation, results,
  refinement, retest, comparison, provenance, uncertainty, and limitations.
- Sentry plus OpenTelemetry, structured logs, metrics, traces, runbooks, SLOs,
  CI/CD, security gates, accessibility, load tests, and staged rollout.
- Vitest, Jest, Pytest, and Playwright proof at their appropriate boundaries.

## Excluded

- Payment processing.
- Scraped personal profiles or unlicensed consumer data.
- Private Predikta/Netopia source, models, datasets, prompts, APIs, or assets.
- Unattributed copying of PhantomCrowd source or reuse that violates its MIT
  notice requirement.
- Unsupported claims of matching a vendor's private methodology or accuracy.
- Production deployment, paid resources, customer-data import, or destructive
  hosted mutation without explicit authorization.

# 5. Proposed Design

```text
apps/web/                  Next.js campaign lab on Vercel
apps/admin/                Next.js operations/admin surface on Vercel
apps/api/                  NestJS public control plane on Railway
services/ai-engine/        Private Python/FastAPI methodology service
services/worker/           Python execution workers on Railway
packages/contracts/        OpenAPI plus generated TypeScript client
packages/simula-core/      Python methodology and provider contracts
supabase/                  Postgres, Auth, RLS, Storage, pgvector
```

- Browser traffic reaches NestJS only for domain behavior. Supabase browser
  credentials remain Auth-only.
- NestJS validates identity/object authority, calls complete database command
  helpers, and records durable outbox intent before any queue publication.
- BullMQ transports small versioned identifiers only. It does not own business
  state. Queue loss is repaired from PostgreSQL.
- Python workers claim the authoritative run, load a frozen minimized manifest,
  call the private AI engine/provider adapters under budget, and persist a
  schema-validated immutable result plus provider receipts.
- The behavioral engine adapts PhantomCrowd's context graph, tiered LLM/rule
  agents, interaction rounds, bounded memory, crowd pulse, report tools,
  synthetic interview, and A/B/retest concepts. It rejects its process-local
  state, SQLite authority, silent defaults, unseeded randomness, permissive
  auth, unsafe URL fetching, and prompt-derived validation.
- Numerical or calibrated outputs stay separate from model-generated
  explanations. Every output names its evidence level and validation scope.
- A provider registry and methodology registry prevent silent model, prompt,
  method, language, dataset, or fallback changes.

# 6. Milestones

## M0 - Architecture and migration contract

- Approve the execution plan and ADR.
- Update project state, risk register, and Home links.
- Gate: architecture preserves tenant isolation, durable run authority,
  compatibility, feature flags, rollback, and truth-in-claims rules.

## M1 - NestJS and BullMQ control-plane foundation

- Add `apps/api` with strict TypeScript, URI versioning, validation, safe
  liveness/readiness, OpenAPI generation, and Jest tests.
- Add the BullMQ queue port with exact versioned job payload, deterministic job
  identity, bounded retention, no transport retries, and fail-closed readiness.
- Gate: frozen install, focused Jest, typecheck, build, OpenAPI generation and
  drift check. Redis integration proves enqueue/dedupe/readiness before the
  publisher is connected to production outbox dispatch.
- Rollback: leave traffic on FastAPI/ARQ; remove the disabled NestJS service
  without touching durable data.

## M2 - NestJS authenticated domain parity

- Port `/api/v1` domain behavior or introduce compatibility-reviewed `/api/v2`
  behavior for identity, organizations, projects, stimuli, runs, cancellation,
  provenance, and results.
- Reuse the existing least-privilege database roles, RLS, atomic helpers, rate
  semantics, stable failures, and audit rules.
- Gate: FastAPI/NestJS golden-contract parity, JWT/rotation/forgery tests,
  cross-tenant tests, idempotency and concurrency tests, generated client drift,
  and browser flows.
- Rollback: route all traffic back to FastAPI; additive contracts and migrations
  remain readable.

## M3 - BullMQ dispatcher and worker migration

- Connect the PostgreSQL outbox dispatcher to BullMQ.
- Add exact queue binding, duplicate delivery, crash, retry, cancellation,
  poison, stale lease, Redis loss, backpressure, shutdown, and recovery proof.
- Retain ARQ as a disabled rollback path until BullMQ passes the full equivalence
  gate.
- Gate: local Redis integration plus database state-machine tests prove one
  terminal result and no false outbox confirmation.

## M4 - Real behavioral engine

- Add the private Python/FastAPI engine, admitted provider adapters, and
  versioned methodology based on ADR-0012.
- Implement provenance-bearing context graph construction; governed population
  synthesis; tiered LLM/rule agents; bounded interaction rounds; immutable
  action events; run-scoped relationship memory; replayable crowd pulse; typed
  aggregation; report tools; schema-validated narrative synthesis; explicitly
  labelled synthetic-agent interviews; and matched A/B/retest execution.
- Add psychographic feature schemas, scoring/output type separation,
  uncertainty, cost/deadline limits, provider receipts, frozen seeded
  reproducibility, and strict no-default failure handling.
- Replace demonstration hashing only when admitted datasets and human/outcome
  benchmarks justify each output type.
- Gate: provider conformance, prompt-injection, SSRF, schema, cancellation,
  timeout, crash/replay, memory isolation/deletion, cost, privacy, determinism,
  simulation invariants, A/B pairing, and held-out evaluation tests.
- Rollback: provider kill switch stops new real-provider runs; historical
  provenance remains immutable; deterministic demo mode stays visibly separate.

## M5 - Audience, campaign, outcome, vector, and storage model

- Add versioned audience and campaign schemas, provenance, consent/license
  controls, sparse-cell rules, retention/deletion, observed outcomes, model
  evaluations, context graphs, agent manifests, action events, memories,
  report evidence, pgvector indexes, and private asset storage.
- Gate: two clean local resets, pgTAP catalog/RLS tests, cross-tenant storage
  tests, vector recall/query-plan budgets, deletion/tombstone proof, and
  seed-free hosted dry-run.

## M6 - Campaign lab workflow

- Deliver audience builder, stimulus intake, simulation setup, live status,
  context/evidence review, agent-fleet setup, interaction timeline,
  resonance/emotion/cognitive/risk results, segment evidence, report,
  explicitly synthetic agent interviews, recommendations, refinement, retest,
  side-by-side A/B comparison, export, and audit history.
- Gate: complete desktop/mobile Playwright journeys, keyboard and screen-reader
  evidence, Axe, visual/responsive QA, error/empty/loading states, and no
  unsupported claims.

## M7 - Production operations and staged release

- Add Sentry, OpenTelemetry, dashboards, alerts, SLOs, privacy/security review,
  load/cost capacity proof, SBOM/SCA/secrets, signed releases, rollback drills,
  Vercel/Railway/Supabase manifests, and GitHub required checks.
- Gate: staging deployment, exact release identity, readiness, browser/API/data
  proof, alert delivery, restore, worker recovery, and approved go/no-go.
- Production deployment requires separate explicit authorization.

# 7. Risks

- R-032: dual control planes and queue transports can diverge.
- R-033: the required behavioral datasets and independent validation may not
  exist at sufficient quality, rights, timeliness, or intersectional coverage.
- R-034: provider use can expose confidential stimuli, create nondeterminism,
  exceed cost/deadline budgets, or encourage false scientific precision.
- R-035: PhantomCrowd's reported backtest lacks a reproducible inspected dataset
  and cannot be inherited as SIMULA validation.
- R-036: directly copying its SQLite/in-memory/background-task and permissive
  failure/security patterns would break production durability and isolation.
- R-037: synthetic scores, actions, and interviews may be mistaken for observed
  human evidence.
- R-038: normalized evidence, rights, outcome, asset, or benchmark state may
  drift from canonical payloads, stored objects, or deletion state.
- R-040: embedding retrieval may leak tenants, bind stale content, use
  unlicensed/drifted models, lose context, or amplify prompt injection.
- R-023/R-025: existing accessibility and required-check governance remain open.
- R-017/R-019: Redis is transport only; false confirmation or loss must never
  corrupt authoritative state.

# 8. Decisions

- 2026-07-29 - ACCEPTED: build an independent product with publicly comparable
  workflow, not copied private implementation.
- 2026-07-29 - ACCEPTED: NestJS becomes the target public control plane;
  Python/FastAPI becomes the private AI-engine boundary.
- 2026-07-29 - ACCEPTED: BullMQ becomes the target queue transport; PostgreSQL
  remains authoritative and ARQ remains rollback-only until parity proof.
- 2026-07-29 - ACCEPTED: unvalidated behavioral outputs remain experimental.
- 2026-07-29 - ACCEPTED: M1 is risk-first infrastructure. It does not expose a
  run mutation until identity, object authority, durable outbox, and queue
  confirmation are connected and tested together.
- 2026-07-29 - ACCEPTED: PhantomCrowd commit
  `4f197a8df0de5183f2376a210f42aaf948bd9b0a` is the primary MIT-licensed
  implementation reference. ADR-0012 governs independent production hardening,
  attribution, and validation boundaries.

# 9. Progress

- [x] Current repository, public competitor evidence, stack, dirty tree, and
  existing Phase 2 gates audited.
- [x] M0 architecture and migration contract authored.
- [x] PhantomCrowd reference revision, license, architecture, validation limits,
  unsafe patterns, and SIMULA adaptation contract recorded.
- [x] M1 NestJS/BullMQ foundation implemented and verified locally (E-5034).
- [x] Restored the current whole-repository quality and dependency-security
  gate after resolving the generated admin format, PDF generator dependency/
  strict-type, visual-analysis export, and vulnerable Pillow pin findings
  (E-5069).
- [x] Corrected post-upgrade visual provenance so new profiles identify Pillow
  12.3.0 while historical 12.1.0 profiles remain readable; restored the
  visual-profile audit action omitted by the deletion policy rewrite and proved
  the real least-privilege integration again (E-5071).
- [x] Added crash-safe background recovery for abandoned pending organization
  deletions: forced-RLS external-resource ledger, leased worker claims, bounded
  retries, verified S3/BullMQ/Redis cleanup, and guarded finalization (E-5072).
- [x] Added exact-head database readiness, shared fail-closed production
  admission, a zero-overlap standalone dispatcher manifest, and a tag-only
  pinned Sigstore workflow that verifies the exact GitHub workflow identity
  before uploading checksummed release evidence (E-5073).
- [ ] M2 authenticated domain parity.
  - [x] Gated `/api/v2/me` and organization-list read slice with JWT, signed
    cursor, RLS transaction, safe errors, readiness, OpenAPI/client, and unit
    proof (E-5035).
  - [x] Ported the parity-reviewed organization/project/stimulus/run,
    cancellation, result, provenance, demo-audience, and auth-event surface;
    exact Redis rate/idempotency semantics; durable sign-in/denial audit calls;
    strict CORS/body/deadline/trace controls; generated golden contracts; and a
    fail-closed browser v1/v2 rollback flag (E-5036).
  - [x] Ported the Phase 3/4 methodology registry, versioned audience
    definitions, frozen simulation configurations, and synchronous methodology
    preview to `/api/v2`; NestJS retains identity/RLS/idempotency/rate
    orchestration while an authenticated private FastAPI endpoint remains the
    sole numerical/report authority. The generated client and browser rollback
    flag now cover the slice, and expanded v1/v2 golden-contract parity passes
    (E-5047).
  - [x] Ported the durable campaign-optimization loop: variant-group
    create/list, compatible complete-report comparison, succeeded-run
    methodology-report creation/read, and checksum-bound JSON/CSV export
    creation/download. NestJS retains tenant, rate, idempotency, SQL, and safe
    download authority; private Python retains comparison and export-rendering
    authority. Seven additional v1/v2 golden route pairs and generated browser
    types pass locally (E-5048).
  - [x] Executed the complete migration chain on two isolated PostgreSQL 17
    databases. One passed all 244 pgTAP assertions; the other passed the
    4-case least-privilege Nest gateway integration (E-5053, E-5054).
  - [ ] Repeat the same evidence through the exact Supabase container reset,
    linter, and generated database-type path. Docker-backed Supabase is
    unavailable in the current verification session.
  - [x] Proved real cross-tenant NestJS HTTP/RLS behavior and authenticated
    production Next standalone rendering on a disposable SIMULA database.
    A membership-free user receives an empty organization page and generic
    foreign-project 404 with no tenant identifier/name/objective disclosure;
    loading, empty, and denial states pass Axe (E-5065). The browser migration
    flag remains `v1` by default and production enablement remains rejected.
  - [x] Added the owner-only `/api/v2/organizations/{organization_id}/deletion`
    command and generated client. Exact-name confirmation persists a durable
    request/manifest and disables the organization before verified private
    object, BullMQ, Redis, and final database cleanup. A production Next/NestJS/
    PostgreSQL/RLS/Redis/BullMQ browser journey deletes a disposable
    zero-asset/zero-run organization with clean accessibility and visual
    evidence (E-5070).
- [ ] M3 BullMQ dispatcher/worker migration.
  - [x] Added a separate NestJS-built dispatcher entrypoint with an exact
    `simula_worker` database boundary, transactional outbox claims, follow-up
    BullMQ proof before confirmation, durable run-control evaluation, bounded
    polling, safe shutdown, and production rejection.
  - [x] Added strict cross-language v2 binding, an explicit rollback-safe
    Python worker transport flag, pinned BullMQ-Python runtime, worker-only v2
    claim wrapper, bounded active-to-delayed database-authorized deferrals, and
    live Redis redelivery proof (E-5037).
  - [x] Reset/replayed migration `20260729090000` inside the complete clean
    chain; its BullMQ v2 binding pgTAP file passes 4/4 assertions as part of
    E-5053.
  - [x] Proved the real NestJS HTTP write, immediate identifier publish,
    database-authorized pre-confirmation delay, worker-role outbox claim,
    exact retained-job proof/confirmation, Python redelivery, one terminal
    deterministic result, and forced duplicate no-op on a fresh 47-migration
    PostgreSQL/Redis fixture (E-5057).
  - [x] Proved queued HTTP cancellation before dispatch with zero durable
    attempts/results, plus hard Python process loss after claim and
    database-authorized stale-lease recovery into generation 2 with one final
    immutable result (E-5058).
  - [x] Proved real Redis server loss leaves a dispatch claim unconfirmed and
    retryable, then converges after transport recovery to one result. Proved
    expired tenth-claim poison terminalization atomically latches global
    admission and returns authenticated HTTP `503 queue_backpressure`; verified
    operator recovery is audited (E-5059).
  - [x] Proved running HTTP cancellation after worker claim/heartbeat and one
    actual behavioral execution through the private FastAPI engine, canonical
    completion, normalization triggers, and authenticated result read on a
    fresh 48-migration fixture (E-5060).
  - [x] Proved exact behavioral API replay, forced completed-job duplicate
    delivery with no extra durable work, and behavioral hard-process-loss
    recovery into generation 2 with one checksum-valid result (E-5061).
  - [x] Proved the production BullMQ 30-second lock/stalled-scan redelivery
    window after hard process loss; real depth 100/99 and ready-age 61/30
    close/reopen admission; run 20/21 pending quota; and three active
    organization execution slots through the v2 worker boundary (E-5062).
  - [x] Proved local production-shaped load with two separate Node dispatcher
    pools/Redis clients and two synchronized Python worker processes at
    concurrency 4: 30 authenticated cross-organization runs produce exactly
    30 attempts/results with p95 `0.161628s` (E-5063).
  - [x] Added a forced-RLS PostgreSQL transport singleton and serialized
    claim/cutover fence. A clean 51-migration fixture proves drained
    ARQ-to-BullMQ cutover, active-work rejection, one BullMQ result, rollback
    to ARQ, stale BullMQ rejection before mutation, and recutover (E-5064).
  - [x] Executed one authenticated terminal run through the actual ARQ
    dispatcher/consumer after rollback, then proved a retained BullMQ delivery
    remains a durable no-op after recutover with one attempt/result (E-5068).
  - [ ] Repeat M3 through hosted dependencies, autoscaling/failure load, and
    execute the complete staged release-identity, alert, and no-dual-consume
    rollback gate before production cutover.
- [ ] M4 real behavioral engine.
  - [x] Added an independently implemented, strict behavioral core with
    provenance-bound context graphs; governed population sampling; weighted
    psychographic tiered fleets; seeded rounds/actions; bounded run memory;
    replayable crowd pulse; typed heuristic scores; synthetic dispersion;
    evidence-bound qualitative synthesis; synthetic interviews; and frozen
    matched A/B comparison (E-5038).
  - [x] Added a private FastAPI service with exact deterministic-provider
    admission, rotating bearer authority, strict JSON/body/schema boundaries,
    cancellation/deadline/cost propagation, health/readiness, and a pinned
    non-root container. A disabled-by-default worker HTTP adapter rejects
    redirects, proxies, encoded/oversized/malformed responses, unsafe origins,
    and mismatched command results. No default or real-provider fallback exists.
  - [x] Bound the deterministic behavioral command to a compact frozen schema-v2
    manifest, BullMQ worker execution, exact canonical result bytes, provider
    receipts, atomic terminal persistence, and a dedicated experimental
    behavioral-demo admission API. The behavioral artifact migration and its
    original 19 pgTAP assertions passed in the E-5053 clean chain (E-5038).
    E-5060 adds four source/privilege regressions to that file and proves the
    corrected chain by real completion; Docker/pgTAP was unavailable for the
    updated 23-assertion file.
  - [x] Added a prespecified development/holdout evaluation contract with exact
    row enforcement, baseline comparison, deterministic observation checksum,
    constant-score disclosure, and sparse-subgroup suppression. It produces
    benchmark-only evidence and contains no bundled outcome corpus.
  - [x] Added the authenticated tenant-scoped behavioral-result projection with
    a generated Python-authority report schema and semantic action/score/
    evidence checks. Canonical event artifacts remain private.
  - [x] Proved clean behavioral admission, active audience/version binding,
    canonical creation event, actual private-engine execution, atomic result
    persistence/normalization, authenticated result projection, and running
    cancellation on a disposable SIMULA database (E-5060).
  - [x] Proved behavioral duplicate/crash/replay and complete relational
    deletion cascade on a fresh 49-migration disposable database. The proof
    exposed and corrected the non-login result-owner delete ACL while retaining
    runtime-worker denial (E-5061).
  - [ ] Admit any external provider only after minimized-egress conformance,
    structured-output red-team tests, a kill switch, cost reservation, and
    independently governed held-out human/outcome evaluation. Deterministic
    experimental mode remains the only admitted provider.
- [ ] M5 data/vector/storage model.
  - [x] Added additive forced-RLS schemas for normalized context/fleet/action/
    memory/report evidence, versioned evidence rights, aggregate observed
    outcomes, private asset metadata, and prespecified benchmark-only
    protocols/runs/members.
  - [x] Added atomic canonical-payload normalization, rights/expiry guards,
    aggregate sparse-cell protection, server-mediated private bucket
    configuration, cascade/index/grant inventories, and 49 focused pgTAP
    assertions.
  - [x] Added an inactive-by-default pgvector seam with a rights/benchmark-gated
    model registry, immutable tenant/graph/node/content/model/vector binding,
    worker-only idempotent ingestion, member-scoped exact cosine search over at
    most 500 graph nodes, 21 focused pgTAP assertions, exact catalog updates,
    and no seeded model/vector/HTTP product route (E-5046, ADR-0013).
  - [x] Added a disabled-by-default private stimulus-asset pipeline with
    immutable size/hash/media/retention reservation, tenant-scoped object keys,
    exact 16 MiB and five-media envelope, verified upload/download, two-phase
    durable deletion, an S3-compatible Supabase/R2 port, readiness binding,
    five authenticated v2 operations, generated client types, and no browser
    storage credential/policy/path disclosure (E-5050, ADR-0014).
  - [x] Ran two clean PostgreSQL migration chains plus 244 pgTAP assertions.
    Trigger/constraint inventories, governed deletion/retirement, and
    cross-tenant RLS denial pass; local S3-compatible byte upload/download also
    passes through the real adapter (E-5053, E-5054).
  - [x] Proved completed behavioral-run deletion removes the run, attempts,
    events, outbox, canonical result/payload/receipt, context, fleet, actions,
    memories, report evidence, and every public-summary row (E-5061).
  - [x] Added durable organization-deletion requests outside the cascade,
    bounded run/object manifests, immediate authorization freeze, retry-safe
    verified object/queue/cache cleanup, final relational cascade, and a
    minimized completion tombstone. Direct least-privilege PostgreSQL plus live
    Redis/BullMQ proof passes (E-5070).
  - [x] Added worker-owned crash recovery for abandoned pending requests with
    durable resource leases, safe fixed-code retries, duplicate-safe completion,
    and finalization only after every external resource is absent (E-5072).
  - [ ] Repeat against exact Supabase reset/lint, generate database types, prove
    cross-tenant object-storage denial and hosted populated-manifest deletion/
    expiry recovery, prove backup expiry, then run a hosted seed-free dry-run.
  - [ ] Admit an embedding model and activate product retrieval only after a
    rights-cleared corpus, vector generation/backfill, semantic benchmark,
    prompt-injection isolation, exact query-plan/latency budget, retirement
    operation, and HTTP/OpenAPI integration pass.
- [ ] M6 campaign lab workflow.
  - [x] Added generated context/evaluation contracts and an authenticated,
    tenant-scoped behavioral-evidence read route with canonical graph,
    checksum/count/limitation binding and bounded aggregate event references.
    Private agent actions, memories, fleets, and canonical payloads remain
    inaccessible (E-5040).
  - [x] Added the feature-gated Next.js behavioral launch/status/result path,
    strict context evidence, public fleet/round timeline, ten fixed
    synthetic/not-testimony interview replays, recommendations/limitations,
    and frozen matched retest/A/B comparison with validated JSON export. The
    comparison always returns `winner: null` and rejects mismatched designs.
  - [x] Added immutable refinement-and-retest relaunch with retry-stable
    idempotency plus a tenant-scoped, identity/payload-free run state history
    route and user-visible timeline (E-5045).
  - [x] Completed fixture-backed real-browser desktop/mobile rendering,
    keyboard refinement/retest navigation, matched-comparison JSON export,
    injected audit failure/recovery, responsive QA, final console review, and
    Axe automation with zero violations. Corrected definition-list semantics
    and the scrollable timeline focus boundary (E-5045).
  - [x] Added a succeeded-run methodology-report panel, frozen-configuration
    binding, durable report reload, checksum-verified JSON/CSV browser
    downloads, saved variant-group listing, and no-winner report comparison.
    Fixture-backed real-browser desktop/mobile QA exercised both workflows
    through the real Next/Supabase client path with clean final consoles and no
    horizontal overflow (E-5049).
  - [x] Added a fail-closed v2 web stimulus asset workflow with local SHA-256,
    retry-stable reserve/upload commands, lifecycle listing, verified private
    image/sandboxed-PDF preview, verified MP4 download, viewer read-only access,
    and confirmed deletion. Exact public response parsing rejects storage
    coordinates and inconsistent lifecycle data (E-5051).
  - [x] Bound only verified available JPEG/PNG/WebP assets into a deterministic
    technical image-profile methodology. E-5052 records normalized dimensions,
    sampling provenance, and nine bounded pixel-level signals under an explicit
    no-OCR/no-object/no-emotion/no-persuasion/no-behavioral-interpretation
    contract. Semantic and behavioral visual methodology remains open.
  - [x] Executed the E-5052 migration and full repository migration chain from
    zero on isolated PostgreSQL 17; all 13 pgTAP files pass 244 assertions,
    including visual replay/conflict, forced-RLS tenant denial, missing claims,
    retirement cleanup, and audit/receipt discipline. A signed local NestJS
    journey also proves S3-compatible private upload/download, FastAPI/Pillow
    profiling, durable PostgreSQL creation/read, and explicit replay (E-5053).
    A reset-style Nest gateway suite repeats create/replay, tenant concealment,
    audit/receipt uniqueness, pooled-claim cleanup, and retirement erasure on a
    fresh 47-migration database (E-5054).
  - [ ] Complete rights-cleared audience construction; current audience
    authority remains the governed non-representative demo cohort.
  - [x] Connected production Next standalone to a disposable Auth/JWKS,
    NestJS v2, PostgreSQL, Redis, S3-shaped object, and private-engine stack.
    The authenticated browser completed guided creation, v2 dashboard loading,
    verified upload/private preview, bounded technical profiling, deletion,
    and a clean final reload. E-5055 records the two product defects found and
    corrected plus generated-contract and regression evidence.
  - [x] Added real NestJS HTTP/PG/Redis/AWS-adapter adversarial proof for
    cross-tenant read/delete concealment, retention denial before object GET,
    ambiguous deletion preserving `deletion_requested`, and same-key recovery
    to a verified tombstone (E-5056).
  - [x] Proved the organization loading/empty state and generic cross-tenant
    project-denial UX through real Auth cookies, NestJS, RLS, and the production
    Next standalone server; both states pass Axe (E-5065).
  - [x] Completed the remaining locally audited automated workflow
    loading/empty/error-state subset: project-directory failure/empty
    separation, dashboard/methodology retry, explicit methodology prerequisite
    and result empties, and generic foreign dashboard/directory/project denial
    all pass focused tests plus production-browser Axe (E-5066).
  - [x] Completed automated responsive/visual proof for the authenticated
    organization empty state and generic dashboard/directory/project denials
    on desktop Chrome plus a Pixel-class mobile profile. All eight screenshots
    were inspected; both profiles pass title, Axe, and horizontal-overflow
    gates (E-5067).
  - [x] Added owner danger-zone confirmation and pending-deletion recovery UI.
    A production-build desktop browser journey verifies wrong-name rejection,
    actual v2 deletion, redirect, workspace absence, zero Axe violations, no
    unexpected console/page errors, no overflow, and visually inspected
    confirmation/completion screenshots (E-5070).
  - [ ] Complete human screen-reader evidence. Repeat asset controls against
    hosted Supabase Auth/Storage/TLS and repeat deletion with populated object/
    queue manifests before any flag admission.
- [ ] M7 staged production operations.
  - [x] Added disabled-by-default, release-bound Sentry error capture and
    privacy-redacted OpenTelemetry traces across NestJS, Next.js, Python API,
    worker, and AI engine; checked Grafana/Prometheus assets define eight panels,
    six symptom alerts, and linked runbooks (E-5041).
  - [x] Added a fail-closed deterministic engine-envelope rehearsal covering
    repeated demo, 200-agent x 3-round, and maximum 2,000-agent x 5-round cases,
    exact provider-call/cost binding, canonical size, traced allocation, and
    stable replay checksum (E-5042).
  - [x] Added non-root target control-plane/private-engine manifests, public web
    telemetry build inputs, and a deterministic tag-only release workflow with
    exact toolchains, checksums, pinned Sigstore keyless signing, exact
    certificate-identity/issuer verification, and verified-artifact upload
    (E-5043, superseded and hardened by E-5073).
  - [x] Added production runtime admission bound to migration head
    `20260730230000`, rollout UUID, archive digest, Sigstore-bundle digest, and
    exact Actions run; remote Supabase dry-run/lint and complete local release
    gates pass without mutating production (E-5073).
  - [x] Completed the repository technical privacy/security data-flow and threat
    delta with explicit production rejection and named vendor, database,
    provider, accessibility, recovery, and approval blockers (E-5044).
  - [ ] Prove hosted telemetry export/redaction, dashboard import, alert
    delivery/recovery/ownership, concurrent service/database/queue load and real
    provider cost capacity, restore/rollback, an executed signed release,
    deployed staging-manifest behavior, exact release identity, and go/no-go
    approval.

# 10. Validation Evidence

- M0 evidence:
  [[../../brain/Decisions/ADR-0011-NESTJS-BULLMQ-CONTROL-PLANE|ADR-0011]],
  [[../../brain/Decisions/ADR-0012-PHANTOMCROWD-DERIVED-BEHAVIORAL-ENGINE|ADR-0012]],
  [[../../brain/Research/PHANTOMCROWD_IMPLEMENTATION_REFERENCE|PhantomCrowd implementation reference]],
  this plan, [[../../brain/RISK_REGISTER|Risk Register]], and
  [[../../brain/PROJECT_STATE|Project State]].
- M1 evidence will record exact commands, versions, test counts, OpenAPI drift,
  queue integration behavior, and remaining limitations after execution.
- M1 local evidence:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5034]].
  The original generated-admin/PDF root-gate findings were preserved at this
  historical point and are now closed by E-5069 below.
- M2 partial evidence:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5035]].
  The code/unit/contract slice is green, but the real database gate failed
  before mutation because the listening local database is not SIMULA. M2 stays
  open and production enablement fails closed.
- M2 expanded local evidence:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5036]].
  The complete overlapping route surface, Redis/admission/audit code, generated
  golden contract, and disabled browser migration seam are green locally.
  Database/RLS HTTP and authenticated browser evidence remain blocking.
- M2 Phase 3/4 methodology parity evidence:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5047]].
  Strict v2 DTOs, atomic existing SQL helper reuse, private-engine response
  binding, deterministic cross-language preview identity, generated OpenAPI/
  client, web rollback routing, and v1/v2 golden contracts pass local code
  gates. The reset-driven database/RLS and authenticated browser journey remain
  blocked; v1 stays the default and production NestJS admission stays rejected.
- M2 durable optimization-loop evidence:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5048]].
  Seven v2 routes, existing Phase 4 atomic SQL commands, private
  comparison/export computation, bound binary downloads, generated client
  types, and expanded v1/v2 golden contracts pass local unit/static/build
  gates. Database/RLS/replay/expiry/cross-tenant HTTP and authenticated browser
  proof remain blocked; the direct arbitrary report-upload route was
  intentionally not added to the new public control plane.
- M2/M6 durable optimization browser evidence:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5049]].
  The real Next client now binds a succeeded run to a frozen configuration,
  creates/reloads its durable report, verifies export headers/length/SHA-256
  before download, lists saved variant groups, and renders compatible modeled
  deltas without a winner or causal-lift claim. Fixture-backed authenticated
  desktop/mobile journeys and full web unit/lint/build gates pass. Real
  NestJS/PostgreSQL/RLS/replay/expiry/cross-tenant proof remains blocking.
- M5 private stimulus-ingestion evidence:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5050]]
  and
  [[../../brain/Decisions/ADR-0014-PRIVATE-STIMULUS-ASSET-PIPELINE|ADR-0014]].
  The database contract, NestJS lifecycle, strict S3 adapter, generated
  OpenAPI/client, unit/regression tests, and fail-closed disabled configuration
  pass local code gates. Docker-backed migration/pgTAP/RLS/type generation and
  live Supabase S3 integrity/deletion/cross-bucket proof remain blocking. No
  visual analysis exists.
- M5/M6 private stimulus browser evidence:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5051]].
  The generated-contract web client and real React panel now cover exact
  reserve/upload/list/download/delete boundaries, client-side SHA-256, safe
  preview, viewer/mutator permissions, retry-stable idempotency, and a
  fail-closed server switch that also requires v2. Full web/API regression,
  optimized builds, contract drift, claims/secrets, and a self-starting
  Chromium fixture with zero Axe violations pass. The browser fixture injects
  an in-memory asset client; real Next authentication, NestJS, PostgreSQL/RLS,
  Supabase S3, retention expiry, and cross-tenant proof remain blocking.
- M5/M6 authenticated full-stack browser evidence:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5055]].
  Production Next standalone now completes guided creation, v2 dashboard
  loading, real S3-adapter upload, browser SHA-256 verification, private
  preview, private-engine technical profiling, and permanent deletion against
  a disposable Auth/JWKS, NestJS, PostgreSQL, Redis, object, and engine stack.
  The journey corrected versioned-dashboard routing and strict empty-command
  validation. Hosted Supabase, cross-tenant browser/HTTP denial, retention,
  deletion-failure recovery, loading/empty states, and human screen-reader
  evidence remain blocking.
- M2/M6 authenticated cross-tenant browser evidence:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5065]].
  A production Next standalone build, Supabase-shaped Auth/JWKS boundary,
  actual NestJS application, least-privilege PostgreSQL/RLS, and Redis prove
  the membership-free organization loading/empty state and generic foreign
  project 404 without tenant identifier/name/objective disclosure. Both states
  pass Axe. Exact hosted Auth/TLS and human screen-reader proof remain open.
- M2/M6 campaign-lab async-state evidence:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5066]].
  Focused component tests cover project loading/failure/empty/retry, dashboard
  generic denial/retry, and methodology load failure, missing prerequisites,
  and empty comparison. The production browser extends generic cross-tenant
  denial and zero-violation Axe proof across dashboard, directory, and project.
  Human assistive-technology and hosted Auth/TLS proof remain open.
- M2/M6 automated responsive/visual evidence:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5067]].
  The same authenticated production stack passes desktop Chrome and
  Pixel-class mobile for organization empty plus three generic denial states,
  with non-empty titles, no horizontal overflow, zero Axe violations, and
  eight manually inspected full-page artifacts. Human screen-reader and hosted
  service evidence remain open.
- M3 partial local evidence:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5037]].
  The separate dispatcher, exact v2 worker binding, controlled delay adapter,
  rollback flag, and live Redis handoff pass locally. The new worker-only SQL
  wrapper and pgTAP ACL test are authored but not reset-tested; full
  database/Redis equivalence and production admission remain open.
- M3 durable cross-language subset:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5057]].
  A fresh database now proves pre-confirmation delay, exact Node dispatcher
  confirmation, pinned Python terminal completion, and forced duplicate
  no-op with one durable attempt/result.
- M3 cancellation/crash-recovery subset:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5058]].
  A fresh database now also proves queued cancellation with zero durable work
  and hard-process-loss recovery through a superseded first attempt and
  generation-2 success with one result.
- M3 Redis-loss/poison subset:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5059]].
  A real isolated Redis outage leaves an outbox claim unconfirmed/retryable and
  later converges to one result; expired tenth-claim poison fails with zero
  execution work, latches global admission, and returns HTTP 503 until an
  audited verified recovery. At E-5059, exact stall timing, running
  cancellation, saturation thresholds, behavioral execution, and production
  admission remained open; E-5060 below closes the two execution subsets.
- M3/M4 running-cancel and behavioral-execution subset:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5060]].
  A fresh 48-migration fixture proves running cancellation with no result and
  one real NestJS/BullMQ/Python/private-FastAPI deterministic behavioral
  completion with active audience v2, canonical normalization, one receipt,
  checksum-valid artifact, and authenticated result read. At E-5060, behavioral
  duplicate/crash/replay and deletion cascade remained open; E-5061 below
  closes those local subsets.
- M3/M4/M5 behavioral durability and deletion subset:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5061]].
  A fresh 49-migration fixture proves original-snapshot API replay, forced
  completed-job duplicate no-op, hard-process-loss recovery into generation 2
  with one checksum-valid result, and zero remaining canonical or normalized
  rows after completed-run deletion.
- M3 stall-timing and saturation subset:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5062]].
  A fresh 50-migration fixture proves the production BullMQ hard-crash
  redelivery window, real queue depth/ready-age admission thresholds, pending
  run ceiling, and three active organization leases.
- M3 two-replica load subset:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5063]].
  Two separate dispatchers and two four-concurrency Python worker processes
  complete 30 authenticated cross-organization jobs once, with 30 durable
  attempts/results and p95 `0.161628s`. Hosted dependencies,
  autoscaling/failure load, staged rollback, external-provider admission,
  rights-cleared validation, and production admission remain open. E-5070
  below closes the local user-facing deletion implementation subset.
- M3 durable transport-fence/cutover subset:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5064]].
  A clean 51-migration fixture proves database-authoritative transport
  ownership, drained cutover, active-work rejection, one BullMQ terminal
  result, rollback, stale-consumer rejection before mutation, and recutover.
  E-5068 below closes the missing local ARQ-terminal subset; hosted execution
  remains mandatory for the complete staged drill.
- M3 post-rollback ARQ terminal subset:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5068]].
  The authenticated NestJS command, real ARQ dispatcher, and production ARQ
  worker composition produce one terminal result after rollback. Recutover
  then consumes the retained BullMQ delivery without an additional durable
  attempt/result. Hosted release identity, alerting, autoscaling/failure load,
  and rollback execution remain open.
- Cross-cutting repository quality evidence:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5069]].
  The final lockfile passes the canonical root check plus separate npm/Python
  SCA after upgrading Pillow to 12.3.0. The 15-page guide also passes structural
  and all-page visual QA. Exact Supabase-container, hosted, human-accessibility,
  provider/data, validation, release-governance, and deployment gates remain
  open.
- M5/M6 visual-provenance correction:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5071]].
  New technical profiles now truthfully bind Pillow 12.3.0 while historical
  12.1.0 rows remain readable. The visual-profile audit action omitted by the
  deletion policy rewrite is restored and guarded. Complete migration replay,
  real least-privilege gateway integration, generated contracts, and the root
  quality gate pass; Docker pgTAP/type generation and hosted migration remain
  open.
- M4 partial local evidence:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5038]].
  The pure engine, authenticated private HTTP boundary, compact BullMQ worker
  binding, exact result receipt, durable SQL command design, and experimental
  admission API pass local code/contract tests. The migration parses
  statically but cannot be reset-tested while the disposable SIMULA database is
  unavailable. Rights-cleared datasets, held-out evaluation, external-provider
  admission, database crash/deletion proof, and deployment remain blocking.
- M5 partial local evidence:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5039]].
  The additive schemas, normalization trigger, rights/outcome/asset/benchmark
  controls, exact catalog updates, and 49 focused pgTAP assertions are authored
  and statically parsed.
- M5/M7 retrieval-seam evidence:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5046]]
  and
  [[../../brain/Decisions/ADR-0013-GOVERNED-PGVECTOR-RETRIEVAL|ADR-0013]].
  The private model/vector schema, ingestion/search authority, 21 focused
  assertions, exact catalog inventories, and restore-head contract are
  authored. No database reset, pgTAP execution, vector benchmark, model
  admission, query plan, generated database type refresh, HTTP product route,
  or hosted dry-run has run.
- M6 partial local evidence:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5040]]
  and
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5045]],
  plus
  [[../../brain/QA/M6_BROWSER_FIXTURE_QA_2026-07-29|M6 browser fixture QA]].
  The generated context/evaluation schemas, safe evidence-review API,
  immutable refinement/retest coordinator, and sanitized run audit timeline
  pass unit, contract, TypeScript workspace, and Python regression gates.
  Fixture-backed desktop/mobile browser, keyboard, export, injected failure/
  recovery, responsive, console, and Axe checks also pass after two
  accessibility fixes. The M5/M6 database schema now applies locally and
  E-5061 proves behavioral relational deletion. Database-backed cross-tenant
  HTTP/browser proof, loading/empty states, and local user-facing deletion
  orchestration are now recorded through E-5065–E-5070. Rights-cleared audience
  construction, hosted populated-manifest deletion, and human screen-reader
  evidence remain open.
- M2/M5/M6 durable organization-deletion evidence:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5070]].
  Exact-name owner confirmation persists and freezes a durable manifest before
  NestJS absence-verifies private-object, BullMQ, and Redis cleanup, then
  confirms the PostgreSQL cascade. Direct least-privilege database proof, live
  Redis/BullMQ integration, generated contracts, full repository checks, and a
  production-build browser journey pass. Exact Supabase reset/type generation,
  hosted populated object/job deletion, backup expiry, and staging/production
  proof remain open.
- M2/M3/M5/M6 crash-safe deletion recovery evidence:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5072]].
  Durable resource leases, bounded retries, guarded finalization, PostgreSQL
  partial-failure recovery, live Redis/BullMQ cleanup, and exact catalog
  inventories pass locally. Exact Supabase pgTAP/type generation, killed-
  process restart, populated live-S3 recovery, hosted execution, and backup
  expiry remain open.
- M7 production-admission and signed-release preflight evidence:
  [[../../brain/EVIDENCE_LEDGER#Phase 2 local implementation evidence|E-5073]].
  Exact-head readiness, shared runtime admission, singleton dispatcher health,
  pinned Sigstore identity verification, exact-toolchain checks, SCA,
  observability, capacity, browser fixture, and linked Supabase dry-run/lint
  pass. Commit/push/tag authorization, public Rekor disclosure, hosted pgTAP,
  signed artifact execution, restore, deployment, and staged cutover remain
  open.

# 11. Final Outcome

OPEN. Architecture is approved. Implementation must not be described as
Predikta-equivalent, scientifically validated, or production-ready until every
milestone gate has objective evidence and the remaining Phase 2 release gates
are closed.
