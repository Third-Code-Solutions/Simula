# Full Repository Audit

Status: COMPLETE — LOCAL REMEDIATION VERIFIED; PRODUCTION RELEASE WITHHELD
Audit target: `origin/main` at `46b051ff6ecd2fce6e48a58f18c444f005a993a4`
Started: 2026-08-24 (Asia/Singapore)

## Final outcome

All five required principal agents completed with `SUCCESS / PASS`; no agent is
failed or blocked. The repaired working tree passed the full local quality,
security, database, integration, contract, build, and browser matrix recorded in
`TEST_AND_VERIFICATION_EVIDENCE.md`. Production was not mutated because the
separate hosted release-admission contract remains unsatisfied: the audited work
is not one clean immutable release identity, required hosted origin variables
are absent, new migrations are not deployed, and hosted security/recovery
governance still has open gates. This is a successful fail-closed release
decision, not an agent failure.

## Scope and evidence policy

This audit covers every tracked first-party file plus explicitly inventoried
untracked material. Generated artifacts, dependency directories, caches, build
outputs, and binary reference assets are inventoried but may be excluded from
line-by-line review with a recorded reason. Findings are VERIFIED, PARTIALLY
VERIFIED, INFERRED, BLOCKED, or NOT TESTED. No green, deployment, or
production-readiness claim is made without an executed check.

## Architecture summary

SIMULA is a Turborepo with Next.js web/admin applications, a NestJS public
control plane, FastAPI/Python private and legacy services, Python workers,
PostgreSQL/Supabase durable authority, Redis with BullMQ/ARQ transport seams,
generated OpenAPI/contracts, and Vercel/Railway deployment manifests. The active
production plan is fail-closed: experimental deterministic behavior is the only
admitted methodology; hosted release gates remain open.

## Findings

### AUD-001 — High — Arbitrary client-authored reports can be persisted with false validation/provenance

- Status: VERIFIED
- Area: Authorization, scientific claims, data integrity
- Affected files: `services/api/src/simula_api/phase34_routes.py`,
  `services/api/src/simula_api/phase34_models.py`,
  `services/api/src/simula_api/reporting.py`,
  `supabase/migrations/20260720100002_phase4_mvp_product.sql`
- Evidence: POST `/api/v1/runs/{run_id}/reports` accepts a client-provided
  `CompleteReport` and passes it to a database helper. The only function
  definition authorizes any organization member, checks a succeeded run plus
  shallow artifact shape/run identity, and accepts client-selected
  `experimental|benchmarked|calibrated` labels. Later migrations do not replace
  this function. Two independent agents reproduced the static trace on exact
  head `46b051f`.
- Reproduction procedure: inspect the route at lines 973–1002 and helper at
  lines 1410–1512; search later migrations for a replacement; observe the absent
  generic-route regression test.
- Expected behavior: report artifacts are server-generated from immutable
  run/result/configuration evidence; only owner/editor roles can persist them;
  validation labels cannot be asserted by clients.
- Actual behavior: a viewer/member can submit a structurally valid but
  fabricated artifact and validation/provenance label.
- Root cause: legacy v1 convenience route treats a presentation document as
  trusted command input, and its SQL helper validates membership rather than
  mutation role plus immutable evidence bindings.
- Impact: false scientific artifacts, provenance spoofing, and broken role
  boundaries.
- Proposed remediation: remove or disable arbitrary upload; server-generate and
  bind reports to immutable run/result/configuration; add a forward SQL
  migration enforcing owner/editor authority and strong identity/hash
  invariants; add viewer-denial and forgery tests.
- Dependencies: generated contracts and v1 compatibility review.
- Verification method: red-capable API/database tests for viewer denial, forged
  label/hash/identity rejection, valid owner/editor server-generated report,
  replay/conflict, and cross-tenant denial.
- Assigned agent: Agent 3 after orchestrator approval
- Fix status: COMPLETE LOCALLY / FAIL-CLOSED — unsafe persistence is retired;
  immutable server-side report generation remains deliberately unavailable
- Commit/change reference: —
- Deployment status: NOT DEPLOYED

### AUD-002 — High — Local audit target was 47 commits behind canonical origin

- Status: VERIFIED / REMEDIATED LOCALLY
- Area: Repository state and release provenance
- Affected files: working tree as a whole
- Evidence: before audit, local `main` was `204f8f8`;
  `git rev-list --left-right --count HEAD...origin/main` returned `0 47`, with
  511 changed files and no untracked-path collisions.
- Reproduction procedure: compare recorded pre-audit head to `origin/main`.
- Expected behavior: audit and release evidence target current canonical main.
- Actual behavior: the initial worktree omitted the production control plane and
  subsequent release work.
- Root cause: stale local branch.
- Impact: any audit, fix, or deployment from the stale head would be incomplete
  and invalid.
- Proposed remediation: fast-forward only after collision checks.
- Dependencies: none.
- Verification method: `git rev-parse HEAD` equals `origin/main`; untracked
  files remain present.
- Assigned agent: Orchestrator
- Fix status: COMPLETE — fast-forwarded to `46b051f`
- Commit/change reference: upstream fast-forward only
- Deployment status: NOT APPLICABLE

### AUD-003 — Medium — Default shell selects unsupported Node and uv versions

- Status: VERIFIED / LOCALLY WORKED AROUND
- Area: Developer tooling and reproducibility
- Affected files: `.node-version`, `.nvmrc`, `pyproject.toml`,
  `scripts/check_toolchain.py`
- Evidence: default PATH returned Node `24.16.0` and uv `0.12.0`; the current
  working tree requires Node `24.18.1`, Python `3.14.7`, and uv `0.11.19`. Exact
  pinned Node, Python, and uv binaries exist under the Codex toolchain
  directory.
- Reproduction procedure: run `node --version`, `uv --version`, then
  `pnpm toolchain:check` from the unmodified shell.
- Expected behavior: documented verification commands select exact pinned tools.
- Actual behavior: a default shell fails or mutates the wrong dependency graph
  before the gate.
- Root cause: PATH precedence does not include the repository-provisioned
  toolchains.
- Impact: false red gates and non-reproducible local installs.
- Proposed remediation: run all audit commands with an explicit pinned PATH and
  `UV_PYTHON`; retain the concurrent bootstrap/documentation correction already
  present in the working tree.
- Dependencies: none.
- Verification method: exact version check followed by frozen install and root
  gate.
- Assigned agent: Orchestrator / Agent 5
- Fix status: COMPLETE LOCALLY — exact toolchain check passed
- Commit/change reference: —
- Deployment status: NOT APPLICABLE

### AUD-004 — High — Approved survey-source identities do not bind the uploaded payload

- Status: VERIFIED
- Area: Evidence governance, scientific integrity
- Affected files: `services/api/src/simula_api/campaign_lab_routes.py`,
  `packages/simula-core/src/simula_core/survey_imports.py`
- Evidence: the route fetches the admitted source version but calls its metadata
  guard without requiring a checksum. The import request has no immutable source
  checksum field, and the worker computes a fresh checksum over caller-supplied
  bytes. Later calibration accepts the import without rechecking the registry
  checksum. Allowed-use admission uses substring matching.
- Reproduction procedure: submit a different CSV/JSON body under a valid
  approved source ID/version; observe that the server validates the identity
  metadata, not equality with the registry digest.
- Expected behavior: the exact raw payload, or an explicitly admitted derived
  artifact plus transform manifest, matches the approved immutable digest and
  allowed use is a scoped enum.
- Actual behavior: arbitrary payloads can borrow an approved source identity and
  be laundered into calibration evidence.
- Root cause: evidence identity and payload digest are checked in separate
  layers without a required equality invariant.
- Impact: unapproved data can support apparently governed calibration/report
  claims.
- Proposed remediation: require exact digest equality and exact allowed-use
  semantics, then persist the raw/source/output digests and transform version as
  one immutable evidence edge.
- Verification method: adversarial wrong-payload/same-source, negative-prose
  allowed-use, correct digest, and replay tests.
- Assigned agent: Agent 3
- Fix status: COMPLETE LOCALLY / FAIL-CLOSED — exact digest equality and
  scoped-use checks are enforced; canonical raw-payload ingestion remains
  unavailable rather than accepting unbound evidence
- Deployment status: NOT DEPLOYED

### AUD-005 — High — Compliance approval and report evidence can be self-asserted or mixed across runs

- Status: VERIFIED
- Area: Authorization, governance, scientific claims
- Affected files: `services/api/src/simula_api/campaign_lab_routes.py`,
  `services/worker/src/simula_worker/campaign_lab.py`,
  `packages/simula-core/src/simula_core/campaign_lab.py`, Campaign Lab web
  workspace
- Evidence: an editor supplies a free-form reviewer name; a successful substring
  scan can emit `approved_experimental` without a distinct authenticated
  approval action. Report assembly verifies selected evidence only by
  campaign/type/status, not immutable source-run/request/result/variant hashes.
- Expected behavior: automated checks end in `needs_human_review`; an
  independently authorized actor approves an exact immutable artifact; every
  report edge binds to the selected simulation run.
- Actual behavior: an editor can self-approve and attach the campaign's best
  unrelated evidence to another run.
- Root cause: presentation fields are treated as authority, while the evidence
  graph lacks immutable foreign-key/hash edges.
- Impact: evidence laundering and false human-review claims.
- Proposed remediation: separate automated scanning from authenticated approval,
  prevent self-approval, persist actor/hash/reason/time, and reject cross-run
  evidence.
- Verification method: self-approval denial, role/actor/audit tests, and
  same-campaign/different-run adversarial report tests.
- Assigned agent: Orchestrator / subsequent implementation slice
- Fix status: COMPLETE LOCALLY / FAIL-CLOSED — automated checks cannot
  self-assert human approval and cross-run report attachment is unavailable
  until immutable bindings exist
- Deployment status: NOT DEPLOYED

### AUD-006 — High — Optional survey nonresponse drops respondents and biases aggregates

- Status: VERIFIED
- Area: Core domain logic, statistical correctness
- Affected files: `packages/simula-core/src/simula_core/survey_imports.py`,
  `services/worker/src/simula_worker/campaign_lab.py`, native survey form path
- Evidence: a form may make `share_intent` optional, but the worker configures
  that field for every response. Missing values raise during probability
  parsing, so rows are classified malformed; mixed batches discard those
  respondents from every aggregate. Share intent is divided by total group
  weight instead of answered weight.
- Expected behavior: optional nonresponse preserves the row and other metrics;
  share intent uses an answered-only denominator and remains absent when no one
  answered.
- Actual behavior: all-omitted runs fail and partial nonresponse biases all
  metrics.
- Root cause: optional field presence and required row parsing were conflated,
  with one shared denominator.
- Impact: durable survey/calibration outputs can be wrong without an explicit
  error.
- Proposed remediation: separate optional parsing and answered-weight
  accounting; add equal/unequal/partial/all-omitted regressions.
- Verification method: focused core and worker tests.
- Assigned agent: Agent 3
- Fix status: COMPLETE LOCALLY — optional rows are preserved and answered-only
  denominators have focused core and worker regressions
- Deployment status: NOT DEPLOYED

### AUD-007 — High — Global 64 KiB JSON limits contradict admitted evidence contracts

- Status: VERIFIED
- Area: API contracts, reliability
- Affected files: `services/api/src/simula_api/app.py`,
  `apps/api/src/application.ts`, Campaign Lab/Evidence Lab DTOs, database
  admission functions, and web clients
- Evidence: both public API implementations cap command JSON at 64 KiB, while
  research documents admit 4 MiB, the v2 database boundary admits 4 MiB, and v2
  calibration admits up to 10,000 observations. Web clients send these bodies
  inline.
- Expected behavior: every body accepted by the documented DTO/domain/database
  contract reaches its controller safely under a bounded route-specific or
  streaming upload policy.
- Actual behavior: valid requests can receive 413 before controller validation.
- Root cause: one global defensive cap was not reconciled with newer
  bulk-evidence contracts.
- Impact: production Campaign Lab and Evidence Lab workflows fail at realistic
  input sizes.
- Proposed remediation: introduce route-specific bounded uploads or staged
  object storage and retain strict small-command caps elsewhere.
- Verification method: boundary tests below/at/above each supported size in both
  API implementations.
- Assigned agent: subsequent implementation slice
- Fix status: COMPLETE LOCALLY — bulk routes admit up to 6 MiB and database
  functions allow 8 MiB of bounded JSONB headroom; boundary tests pass
- Deployment status: NOT DEPLOYED

### AUD-008 — High — Campaign Lab CPU work can expire leases and duplicate claims

- Status: VERIFIED
- Area: Worker reliability, concurrency
- Affected files: `services/worker/src/simula_worker/campaign_lab.py`,
  `services/worker/src/simula_worker/campaign_evidence.py`,
  `supabase/migrations/20260802060315_campaign_simulation_lab.sql`,
  `supabase/migrations/20260801121240_campaign_lab_evidence_jobs.sql`
- Evidence: one loop claims five rows with five-minute leases, processes them
  serially, and calls synchronous CPU evaluation on the asyncio event loop. The
  lease extends only on explicit progress updates; no heartbeat runs during
  evaluation.
- Expected behavior: CPU work is offloaded, concurrency is bounded, and a
  cancellable heartbeat prevents a live claim from expiring.
- Actual behavior: the event loop can stall and later claims can expire before
  or during processing, allowing duplicate work.
- Root cause: batch-claim semantics were combined with serial event-loop
  execution and progress-only lease renewal.
- Impact: duplicated runs, conflicting writes, delayed cancellation, and stalled
  worker health.
- Proposed remediation: claim one or process bounded concurrent tasks, offload
  CPU evaluation, and heartbeat the active lease until completion/cancellation.
- Verification method: deterministic slow-evaluator tests proving event-loop
  liveness, heartbeat, cancellation, and no expired queued claims.
- Assigned agent: Agent 3
- Fix status: COMPLETE LOCALLY — both worker paths offload CPU work, maintain
  lease heartbeats, and drain cancellation safely; deterministic
  liveness/cancellation regressions pass
- Deployment status: NOT DEPLOYED

### AUD-009 — High — Green CI/release omits production-critical components and gates

- Status: VERIFIED
- Area: CI/CD, release assurance
- Affected files: root scripts, `.github/workflows/ci.yml`,
  `.github/workflows/release.yml`, deployable manifests
- Evidence: exact-head CI and Sigstore release are green, but root verification
  omits NestJS database integration and authenticated browser journeys;
  container gates omit the NestJS control plane/dispatcher, AI engine, and
  admin; the release workflow omits root verification, pgTAP/database reset,
  authenticated E2E, and full image scans. Coverage thresholds are configured
  but not executed. `main` is unprotected.
- Expected behavior: required checks exercise every deployable, integration
  seam, migration, authenticated critical path, coverage policy, and image
  before release.
- Actual behavior: a green workflow does not prove the shipped topology.
- Impact: broken components and incompatible schema can be promoted with green
  status.
- Proposed remediation: expand root/workflow gates and enforce branch protection
  after commands are reliable.
- Verification method: workflow dry run plus successful exact-revision CI with
  all deployables and integration/E2E jobs present.
- Assigned agent: Orchestrator / Agent 5
- Fix status: COMPLETE LOCALLY / HOSTED EXECUTION PENDING — all five production
  images and critical control-plane, integration, browser, identity, SBOM, and
  scanning gates are defined; exact hosted workflow execution and branch
  governance remain release-admission items
- Deployment status: NOT DEPLOYED

### AUD-010 — High — Hosted database and deployed services do not share one release identity

- Status: VERIFIED
- Area: Production operations, rollback safety
- Affected systems: Supabase, Vercel, Railway
- Evidence: linked Supabase is healthy on PostgreSQL 17.6 with the previously
  remote-only `20260815100000` migration. That exact migration has now been
  recovered into the working tree, but a new unreleased forward migration is
  under review. Production web is ready on a dirty revision eight commits ahead
  of audited head. Backend services report signed release labels but run a
  different source commit, and rollout IDs are split across
  API/control-plane/dispatcher/worker/engine.
- Expected behavior: source, image digest, release label, rollout ID, database
  migration head, and rollback target form one compatible manifest.
- Actual behavior: production is a mixed, unreproducible state; the repository
  cannot safely recreate or roll back the hosted database head.
- Impact: deployment and rollback can introduce schema/runtime incompatibility
  and misleading version telemetry.
- Proposed remediation: recover and review the remote-only migration, establish
  one manifest and compatible rollback target, then stage every component from a
  clean audited revision.
- Verification method: migration history/advisors, image/source attestation,
  rollout identity, health/readiness, and authenticated smoke evidence.
- Assigned agent: Agent 5 / Orchestrator
- Fix status: RELEASE WITHHELD — local source/schema recovery and release checks
  are green, but hosted source, image, schema, rollout, and rollback identities
  are not one compatible immutable release
- Deployment status: EXISTING PRODUCTION DRIFT VERIFIED; NO MUTATION PERFORMED

### AUD-011 — High — Legacy feedback accepts uncontrolled sensitive payloads

- Status: VERIFIED
- Area: Privacy, evidence governance
- Affected files: `services/api/src/simula_api/phase34_models.py`,
  `services/api/src/simula_api/phase34_routes.py`,
  `supabase/migrations/20260720100002_phase4_mvp_product.sql`
- Evidence: editors may persist large arbitrary
  survey/focus-group/campaign-outcome/sentiment payloads using only a free-form
  rights assertion; every tenant member can read them. There is no
  aggregate-only schema, consent registry, purpose/retention/deletion workflow,
  or PII prohibition.
- Expected behavior: production evidence intake is schema-bounded,
  purpose-limited, consent/rights-admitted, access-controlled, auditable, and
  deletable under policy.
- Actual behavior: sensitive raw data can enter a broadly readable legacy table
  outside the governed source registry.
- Impact: privacy, legal, and cross-role disclosure risk.
- Proposed remediation: fail-close the legacy endpoint in production or require
  admitted aggregate-only evidence with retention/deletion controls.
- Verification method: production-mode gating and privacy adversarial tests.
- Assigned agent: subsequent implementation slice
- Fix status: COMPLETE LOCALLY / FAIL-CLOSED — production feedback intake
  rejects uncontrolled sensitive payloads with regression coverage
- Deployment status: NOT DEPLOYED

### AUD-012 — High — One browser API origin cannot reach both production API families

- Status: VERIFIED / REMEDIATED LOCALLY
- Area: Architecture, deployment connectivity
- Affected files: `apps/web/src/lib/api.ts`, `scripts/dev.mjs`, `.env.example`,
  `apps/web/Dockerfile`, deployment environment configuration
- Evidence: the web client previously selected v1 FastAPI versus v2 NestJS paths
  but always sent both to one origin. Production hosts those families on
  different services, so one family was necessarily unreachable. The client, dev
  allowlist, environment example, and Docker build arguments now support
  explicit v1/v2 origins with a legacy fallback.
- Expected behavior: v1 and v2 requests resolve to their authoritative service
  in development and every production build path.
- Actual behavior: source-level routing and Docker inputs are repaired locally;
  hosted environment parity and an exact image/browser release have not been
  verified.
- Impact: Campaign Lab or Evidence Lab commands can fail despite healthy
  individual services.
- Verification method: API unit tests, dev-script tests, Docker build contract,
  and hosted browser/network proof using both families.
- Fix status: COMPLETE LOCALLY; HOSTED ENVIRONMENT CONFIGURATION PENDING

### AUD-013 — High — Methodology reports accepted caller-selected configuration unrelated to the run

- Status: VERIFIED / FAIL-CLOSED LOCALLY
- Area: Scientific integrity, immutable provenance, UX
- Affected files: `services/api/src/simula_api/phase34_routes.py`,
  `apps/api/src/methodology/optimization.controller.ts`,
  `apps/web/src/features/runs/methodology-report-panel.tsx`
- Evidence: v1 and v2 report commands accepted a fresh caller-selected
  configuration after a run completed; repository execution writes no immutable
  configuration binding that a report service can verify.
- Expected behavior: execution persists an immutable configuration/result
  binding and report generation consumes only that edge.
- Actual behavior: backend report creation is intentionally unavailable pending
  the writer; the existing web form still exposes a guaranteed failing
  submission until its unavailable state is implemented.
- Impact: the old behavior allowed provenance rebinding; the safe fail-close
  currently creates an incomplete user journey.
- Verification method: API rejection before any mutation, no independent-config
  request path, and component coverage for the unavailable UI state.
- Fix status: COMPLETE LOCALLY / FAIL-CLOSED; NOT DEPLOYED

### AUD-014 — High — v2 Campaign Evidence duplicates source/outcome substitution and lease failures

- Status: VERIFIED
- Area: Evidence integrity, worker reliability
- Affected files: `apps/api/src/campaign-evidence/campaign-evidence.service.ts`,
  `services/worker/src/simula_worker/campaign_evidence.py`,
  `supabase/migrations/20260801121240_campaign_lab_evidence_jobs.sql`
- Evidence: v2 accepts direct survey aggregates and caller-provided survey
  imports/outcomes without exact registry checksum and allowed-use binding. Its
  worker also claims five jobs, performs synchronous CPU work on the asyncio
  event loop, and has no heartbeat against a two-minute lease.
- Expected behavior: immutable admitted evidence edges and a bounded,
  heartbeating, stale-result-safe worker.
- Actual behavior: the v1 repair does not protect the split v2 production
  origin.
- Impact: evidence substitution, duplicate execution, stale writes, and false
  provenance.
- Verification method: fail-close or end-to-end binding tests across
  TypeScript/SQL/Python plus deterministic lease/liveness tests.
- Fix status: COMPLETE LOCALLY / FAIL-CLOSED — v2 substitution is rejected and
  worker lease/liveness behavior is repaired

### AUD-015 — High — Database persistence caps contradict the repaired 6 MiB HTTP envelope

- Status: VERIFIED
- Area: End-to-end contract reliability
- Affected files:
  `supabase/migrations/20260801121240_campaign_lab_evidence_jobs.sql`,
  `supabase/migrations/20260802060315_campaign_simulation_lab.sql`, forward
  migration under review
- Original evidence: queue table checks and admission functions capped
  request/secret JSONB at 4,194,304 bytes. A contract-legal 4 MiB raw payload
  necessarily exceeded that after JSON escaping or base64 encoding, so the HTTP
  layer could accept a request the database rejected.
- Expected behavior: one derived, documented envelope limit is enforced
  consistently at transport and persistence boundaries.
- Repaired behavior: bulk HTTP routes enforce 6 MiB while database functions
  provide a bounded 8 MiB encoded-payload envelope.
- Verification method: pgTAP and API/database integration at approximately 5.6
  MiB, plus rejection above 6 MiB.
- Fix status: COMPLETE LOCALLY — database persistence boundaries align with the
  6 MiB HTTP envelope and pass pgTAP/integration coverage

### AUD-016 — High — Runtime emitted a problem code absent from the governed public inventory

- Status: VERIFIED / REMEDIATED LOCALLY
- Area: Public API compatibility and client error handling
- Affected files: Campaign Evidence controllers, generated OpenAPI, shared
  contracts, and controller regressions
- Evidence: a runtime denial used `evidence_not_admitted`, which was not in the
  stable public problem-code inventory. Other retired or unavailable flows also
  needed standardized governed responses.
- Repaired behavior: denials use the governed `forbidden`, `version_conflict`,
  and `unsupported_scope` codes with explicit `ProblemDetails` 409/410 schemas.
  Generated OpenAPI and compatibility tests pass.
- Fix status: COMPLETE LOCALLY
- Deployment status: NOT DEPLOYED

### AUD-017 — High — Campaign Lab exposed controls for deliberately unavailable governed operations

- Status: VERIFIED / REMEDIATED LOCALLY
- Area: Frontend integrity and user workflow completeness
- Affected files: Campaign Lab navigation/workspace, report panel, Evidence
  workspace, and component tests
- Evidence: the UI still exposed report, historical backtest, and calibration
  actions after the underlying mutations were intentionally fail-closed.
- Repaired behavior: dead actions were removed or replaced by explicit
  unavailable-state panels with tested navigation and governance behavior.
- Fix status: COMPLETE LOCALLY / FAIL-CLOSED
- Deployment status: NOT DEPLOYED

## Audit challenge status

Agent 1 completed semantic review of 763 of 775 tracked files; seven
generated/lock artifacts and five binary assets were inventoried with explicit
exclusions. Agent 2 completed architecture and connectivity review. Agent 3
completed the implementation repair slice and returned `SUCCESS / PASS`. Agent 4
independently reproduced residual v2, persistence, UI, container,
release-provenance, privacy, calibration, cancellation, and problem-code issues,
verified their repairs, and returned `SUCCESS / PASS`; its final post-signoff
integration-test review also passed `git diff --check`. Agent 5 completed the
DevOps/debugging and hosted-state audit. All five required agents are complete,
successful, and unblocked.

## Release decision

Local remediation is verified green. Production release is withheld because its
independent admission gates are not green: required Vercel/GitHub origin
variables are absent, the working tree is not one clean reviewed immutable
revision, the new migrations are local only, hosted leaked-password protection
is disabled, branch protection and PITR are not proven/enabled, and the current
source/image/schema/rollout/rollback identities do not unify. No production
mutation was performed.
