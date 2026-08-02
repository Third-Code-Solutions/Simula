---
title: SIMULA Project State
status: active
created: 2026-07-17
updated: 2026-07-30
owner: Principal program and engineering lead
classification: OBSERVED
source_of_truth: true
---

# SIMULA Project State

## Current phase

- Status: M0 architecture and M1 NestJS/BullMQ foundation are locally complete.
  M2 authenticated domain parity is active. Existing Phase 2 release gates
  remain open and are not waived.
- Active production plan:
  [[../plans/active/003-predikta-class-production-platform|003-predikta-class-production-platform]].
- Architecture decision:
  [[Decisions/ADR-0011-NESTJS-BULLMQ-CONTROL-PLANE|ADR-0011]].
- Behavioral-engine decision:
  [[Decisions/ADR-0012-PHANTOMCROWD-DERIVED-BEHAVIORAL-ENGINE|ADR-0012]].
- Technical-image-profile decision:
  [[Decisions/ADR-0015-ASSET-BOUND-TECHNICAL-IMAGE-PROFILE|ADR-0015]].
- Status: Phase 2 implementation/remediation and independent code re-review are green through E-5033; human accessibility evidence and enforceable required-check governance remain open.

- Phase 2 — Walking Skeleton.
- Active plan: [[../plans/active/002-phase-2-walking-skeleton|002-phase-2-walking-skeleton]].
- Completed: [[../plans/completed/000-phase-0-evidence-and-discovery|Phase 0]] and [[../plans/completed/001-phase-1-product-and-architecture-definition|Phase 1]] after independent review and exit audits.

## Current objective

Build the requested production stack incrementally: first a disabled,
rollback-safe NestJS/BullMQ control plane, then authenticated domain parity,
private Python/FastAPI behavioral execution, governed audience/campaign/outcome
data, pgvector and storage, the complete campaign-test/refinement/retest
experience, and production operations. Existing human accessibility,
required-check, hosted deletion/recovery, restore, data-rights,
provider-admission, and independent-validation gates remain mandatory. No
representativeness or predictive-accuracy claim is authorized.

## Repository state

- OBSERVED 2026-07-30: E-5073 adds exact-head database readiness and one shared
  fail-closed production release admission contract across NestJS, dispatcher,
  FastAPI rollback API, Python worker, and private engine. The dedicated
  dispatcher manifest has zero overlap and liveness/pass-staleness readiness.
- OBSERVED 2026-07-30: the tag-only release workflow uses pinned Sigstore
  keyless signing and immediately verifies the exact `github.workflow_ref` and
  GitHub Actions OIDC issuer. The archive and Sigstore-bundle digests plus exact
  Actions run URL become runtime inputs.
- OBSERVED 2026-07-30: exact Node 24.18.0, pnpm 11.13.1, Python 3.14.6, uv
  0.11.19, and Supabase CLI 2.109.1 gates pass: API 250/250, web 141/141,
  Python 414 passed plus 2 expected Windows skips, contracts 7/7, admin 2/2,
  builds/generated drift/claims/secrets, SCA, observability, deterministic
  capacity, and asset browser 1/1.
- BLOCKED 2026-07-30: the linked Supabase dry-run still lists 18 unapplied
  migrations. No immutable commit, pushed tag, Sigstore bundle, Rekor entry,
  provider deployment, hosted readiness, backup restore, or staged cutover
  exists. Sigstore exposes the private repository workflow identity and tag in
  its public transparency log; explicit disclosure and git-release
  authorization remain required.
- OBSERVED 2026-07-30: E-5072 closes the local abandoned-request recovery
  implementation gap from E-5070. Every pending deletion now owns a forced-RLS
  cache/run/storage ledger with skip-locked 15-minute worker leases, ten
  attempts, current-token completion, safe fixed-code releases, bounded retry,
  and finalization only after every external cleanup is complete.
- OBSERVED 2026-07-30: the dispatcher resumes due deletion resources through
  verified S3 absence, exact BullMQ generation removal, and exact Redis
  organization-key removal. PostgreSQL partial-failure/retry/finalization
  adversarial proof passes; owner deletion and least-privilege gateway
  regressions pass; live Redis/BullMQ passes 10/10; exact live catalogs match.
  Current `pnpm check` is green with API 230/230, web 141/141, Python 396 plus
  2 expected Windows skips, contracts 7/7, admin 2/2, all builds, and generated/
  policy/secret gates.
- BLOCKING 2026-07-30: E-5072 remains local disposable proof. Exact Supabase
  reset/lint/pgTAP/type generation, a killed/restarted deployed dispatcher,
  populated real-S3 recovery, hosted Storage/Redis/BullMQ recovery,
  backup-expiry propagation, and staging/production execution remain open.
- OBSERVED 2026-07-30: E-5071 corrects technical-image provenance after the
  Pillow security upgrade: new profiles now declare 12.3.0 while historical
  12.1.0 profiles remain readable. It also restores the visual-profile audit
  action accidentally omitted by E-5070's policy rewrite.
- OBSERVED 2026-07-30: complete migration replay/catalog proof and the real
  least-privilege gateway integration pass. Current `pnpm check` is green with
  API 223/223, web 141/141, Python 396 plus 2 expected Windows skips, contracts
  7/7, admin 2/2, all builds, and generated/policy/secret gates.
- OBSERVED 2026-07-30: E-5070 adds a durable, owner-triggered organization
  deletion workflow. Exact-name confirmation persists a pending request and
  manifest before disabling the organization; NestJS verifies private-object,
  BullMQ, and organization-scoped Redis cleanup before the final PostgreSQL
  cascade. Same-request retries resume safely and changed requests fail.
- OBSERVED 2026-07-30: direct least-privilege PostgreSQL adversarial proof,
  live Redis/BullMQ cleanup tests, API/web/contract suites, and a production
  Next/Nest/PostgreSQL/Redis/BullMQ browser journey are green. The browser
  confirms wrong-name rejection, completed deletion, redirect, zero Axe
  violations, no overflow, and visually reviewed before/after screenshots.
- BLOCKING 2026-07-30: E-5070 is local disposable proof. Exact Supabase
  reset/lint/pgTAP/type generation, hosted storage/queue/cache deletion,
  populated-object/job browser proof, and backup-expiry propagation remain
  open. E-5072 closes only the local automated-recovery implementation subset.
- OBSERVED 2026-07-30: E-5069 closes the stale whole-repository
  format/lint/mypy blocker recorded by E-5068. ReportLab and matching stubs are
  pinned as owned development dependencies; the guide generator is strictly
  typed without copy/design changes; the generated admin declaration is
  Prettier-clean; and the visual-analysis test seam is explicit.
- OBSERVED 2026-07-30: the first dependency audit exposed Pillow 12.1.0
  advisories. The exact pin is upgraded to 12.3.0. Focused image tests pass 9/9,
  Python SCA reports zero known vulnerabilities, and npm SCA retains only the
  pre-existing documented dev-only advisory exception with an expiry.
- OBSERVED 2026-07-30: final `pnpm check` exits 0 with contracts 7/7, admin 2/2,
  NestJS API 213/213, web 138/138, and Python 396 plus 2 expected Windows
  skips. Production builds, generated-contract drift, claims, and secrets pass.
  The regenerated 15-page guide passes structural and all-page visual QA.
- BLOCKING 2026-07-30: E-5069 is a local repository/PDF/SCA gate. Exact
  Supabase-container reset/lint/generated database types, hosted services,
  human screen-reader evidence, enforceable required checks, external-provider
  and rights-cleared-data admission, held-out validation, deployment, and
  production admission remain open.
- OBSERVED 2026-07-30: E-5068 closes the missing local post-rollback ARQ
  terminal-result subset. After the audited BullMQ-to-ARQ switch, the actual
  authenticated NestJS run command, Python ARQ dispatcher, and production ARQ
  worker composition produce a succeeded run with exactly one attempt/result.
  Recutover to BullMQ then consumes the retained BullMQ delivery without any
  additional durable work. The clean 51-migration suite passes 14/14.
- OBSERVED 2026-07-30: E-5068 also fixed a production ARQ startup defect found
  by TDD: the durable transport assertion now has an allowlisted bounded
  telemetry label. API 213/213, Python 396 plus 2 expected Windows skips,
  API build/typecheck, contracts, focused formatting/Ruff/mypy, claims, and
  secrets pass. Final fixture state is ARQ/admission-on with no active fixture
  work or temporary role passwords.
- BLOCKING 2026-07-30: E-5068 is disposable local evidence, not the complete
  hosted staged rollback drill. Hosted Supabase/Railway behavior, exact release
  identity, alert delivery, autoscaling/failure load, pgTAP/generated database
  types, external-provider admission, rights-cleared held-out validation,
  deployment, and production admission remain open.
- OBSERVED 2026-07-30: E-5067 extends the authenticated production-Next
  cross-tenant proof to desktop Chrome and a Pixel-class mobile profile. The
  organization empty state plus generic foreign dashboard, project-directory,
  and project denials pass 2/2 with non-empty titles, zero Axe violations, no
  horizontal overflow, and eight stable full-page screenshots. All eight
  artifacts were visually inspected and remain readable/unclipped.
- BLOCKING 2026-07-30: E-5067 is automated local responsive/visual evidence,
  not a human screen-reader session or hosted-device/service proof. Human
  assistive-technology review, hosted Supabase Auth/TLS, required-check
  governance, deployment, and production admission remain open.
- OBSERVED 2026-07-30: E-5066 closes the remaining locally audited automated
  M6 campaign-lab loading/empty/error-state subset. Project-list failure no
  longer renders as empty; dashboard and methodology initial failures have
  accessible generic headings/retry paths; missing methodology prerequisites,
  comparison output, report sections, and audit activity render explicit empty
  guidance. The production browser proves generic cross-tenant denial for the
  organization dashboard, project directory, and project with no fixture
  identifier/name/objective leak and zero Axe violations.
- BLOCKING 2026-07-30: E-5066 is automated local evidence. Human screen-reader,
  full responsive/visual review, hosted Supabase Auth/TLS, exact Supabase
  reset/lint/generated types, required-check governance, deployment, and
  production admission remain open.
- OBSERVED 2026-07-30: E-5065 closes the local M2 authenticated
  cross-tenant-browser subset. A production Next standalone build signs in
  through a Supabase-shaped Auth/JWKS boundary, reaches the actual NestJS/RLS
  routes, renders verified loading/empty state, and conceals a foreign project
  behind a generic 404 without exposing its organization/project identifiers,
  names, or objective. Both states pass Axe. The proof also corrected the
  missing denial-state h1 and missing standalone public-asset copy.
- BLOCKING 2026-07-30: E-5065 is local protocol-shaped evidence. Exact hosted
  Supabase Auth/TLS, Supabase reset/lint/generated database types, human
  screen-reader review, and required-check governance remain open; browser v1
  remains the default and production v2 admission remains rejected.
- OBSERVED 2026-07-30: E-5064 adds a durable PostgreSQL queue-transport
  singleton and serialized claim/cutover fence. A local clean 51-migration
  fixture proves drained ARQ-to-BullMQ cutover, rejection while work is active,
  one BullMQ result, rollback to ARQ, and stale BullMQ rejection before
  mutation. Database 19/19, API 213/213, Redis 7/7, Python 396 plus 2 expected
  Windows skips, and contracts 7/7 pass. This is not a completed hosted staging
  drill because no ARQ consumer produced a terminal result after rollback.
- BLOCKING 2026-07-30: exact Supabase-container pgTAP and generated
  database-type gates remain unavailable while Docker Linux/WSL virtualization
  is unavailable. Hosted dependencies, staged no-dual-consume rollback,
  autoscaling/failure load, external-provider admission, rights-cleared data,
  held-out validation, and production admission remain open.
- OBSERVED 2026-07-29: the current tree and public product workflow were
  re-audited. SIMULA has a production-grade walking-skeleton shell but its
  deterministic demo provider is not a validated behavioral model. The user
  selected NestJS, BullMQ, Python/FastAPI workers, pgvector, storage, generated
  OpenAPI, Sentry/OpenTelemetry, and full CI/CD. Plan 003 and ADR-0011 define the
  migration without copying competitor internals or weakening PostgreSQL/RLS
  authority. R-032 through R-034 track migration, evidence, and provider risks.
- OBSERVED 2026-07-20: root `pnpm verify` exits 0 with 68 pgTAP assertions, 64 API tests, 11 browser flows, 231 non-integration Python passes plus 2 expected Windows skips, 57 web tests, 23 complete integrations, exact builds/contracts/policy/secrets, and npm/Python SCA. Final remediations enforce database/provider receipt invariants, render verified receipt provenance, preserve runtime control state in dynamic restore proof, narrowly suppress the historical injection canary, stamp trusted log identity, probe the live worker process, and expose audited least-privilege operator run control. The independent cross-domain code re-review has no unresolved code Critical or High finding (E-5033).
- OBSERVED 2026-07-20: hosted project `ywiwmczccktwzqyhzhiz` matches checked-in migration history through `20260720083000`; linked lint and security advisors are clean. The `simula_operator` login has no password, memberships, elevated attributes, table privileges, or arbitrary schema creation and can execute only the two audited run-control functions. Run creation remains enabled. Existing performance-advisor notices remain monitored under R-031.
- OBSERVED 2026-07-20: commits through `72f1a66` are pushed to `main`. GitHub Actions run `29728979248` passes Foundation, Windows quality, complete-history secret, and hardened non-root/no-egress/SBOM/vulnerability container gates on exact head `72f1a66cf1a0be8e589f9ef5f88a84eb5cfcb10d`.
- OBSERVED 2026-07-19: root `pnpm verify` exits 0 with two clean resets, 59 pgTAP assertions, 61 API tests, 9 browser flows, 204 non-integration Python passes plus 2 expected Windows skips, 43 web tests, 22 complete integrations, exact builds/contracts/policy/secrets, and npm/Python SCA. Audience v2 immutability, owned fixed-lifetime rate markers, atomic two-bucket run admission, stable problem codes, and a base-aware breaking OpenAPI gate pass independent focused review. Hosted project `ywiwmczccktwzqyhzhiz` matches local migration history through `20260719050000`; v1 is retained/revoked, v2 is the sole active version with its exact checksum, linked lint and security advisors are clean, runtime selection is stable-audience based, and temporary owner CREATE remains revoked (E-5032).
- OBSERVED 2026-07-20: commits `d912b21` and `5ab8f6c` are pushed to `main`. GitHub Actions run `29718093557` passes Foundation, Windows quality, complete-history secret, and non-root/no-egress/SBOM/vulnerability container gates on exact head `5ab8f6c1b598ca2a57c69ab7ab442333453dba4b`.
- OBSERVED 2026-07-18: remediation head `bffe83b` is pushed to `main`. GitHub Actions run `29646850994` passed the disposable Supabase, five-browser, Linux quality-security, complete integration, non-root/no-egress, and three-image SBOM/fixable-vulnerability gates in 8m38s.
- OBSERVED 2026-07-18: the independent exit review failed with unresolved High findings across product evidence, database/worker authority, API/auth, accessibility, CI/supply chain, observability/operations, and method/data controls (E-5023). Risk-first remediations close expired-lease mutation/stale-attempt corruption (E-5024), structurally arbitrary result persistence/frozen-provenance drift (E-5025), worker retry/deadline/heartbeat/rejection-telemetry drift (E-5026), the deterministic worker's missing fail-closed no-egress proof (E-5027), R-025's SBOM/container-scan (E-5028), history-secret/Windows (E-5029), and root-verification-command gaps (E-5030). Required-check governance and remaining non-CI findings stay blocking.
- OBSERVED 2026-07-17: P2-01 foundation and P2-02 database source are complete: exact manifests/locks, health/runtime proof, first ordered migration, local Auth fixtures, generated database types, least-privilege roles, forced RLS, complete organization command, and adversarial database gates. No hosted resource or production change exists.
- OBSERVED 2026-07-17: brain/ is the authoritative Obsidian-readable vault.
- OBSERVED 2026-07-17 Phase 0 close: 33/33 required notes/YAML, 36/36 Home targets, 49/49 vault wikilinks, 53 evidence IDs defined, 49 referenced, 0 undefined, and 0 application scaffold directories.
- OBSERVED 2026-07-17: system defaults remain Node 24.16, pnpm 9.15, and Python 3.14.5. Verified user-local bootstrap provides exact Node 24.18.0, pnpm 11.13.1, Python 3.14.6, uv 0.11.19, and Supabase CLI 2.109.1 without loosening manifests.
- OBSERVED 2026-07-18: the hosted Supabase target is `ywiwmczccktwzqyhzhiz` (Simula, active). MCP-authorized access as `kurtgav` bootstrapped the four least-privilege roles and applied checked-in migrations seed-free. Remote migration history exactly matches Git through `20260718070000`; cancellation/retry/recovery/poison helpers, API/worker ACLs, and temporary-schema-CREATE revocations were verified (E-5011, E-5016–E-5019).
- OBSERVED 2026-07-18: checked-in migration `20260718010000_phase2_runs_and_worker` was reset-tested locally and applied once to the same hosted project. It adds the immutable global authored-demo fixture, frozen run/outbox command authority, worker-owner RLS policies, and execute-only worker helpers. Remote history was reconciled to the Git timestamp; verification found one fixture audience/version, no tenant/run data, no direct worker run DML, and the expected worker claim helper grant (E-5012).

- OBSERVED 2026-07-19: hosted migration history equals the composed local migration set through version `20260719050000`. Audience v2 governance is applied seed-free after two local reset replays; linked remote lint reports no errors and the security advisor reports zero lints. Application relations intentionally reside in non-exposed `api` and `private` schemas, so an empty `public` Table Editor is expected (E-5032).

## Phase 0 outcome

- Five live research streams synthesized into competitor, market, methodology, data, privacy, architecture, security, operations, product, and QA notes.
- Two independent audits found zero Critical. Initial 4 High/3 Medium and re-audit 2 High/1 Medium findings were resolved.
- Vendor efficacy remains REPORTED. Competitor internals, broad data rights, SIMULA validity, and final legal/provider terms remain UNKNOWN.
- Ten bounded subagents were used in concurrency-limited waves; two research handoffs timed out and were recovered from official primary sources by the primary agent.

## Phase 1 outcome

- M0 complete: prototype job/scope, Given/When/Then criteria, success budgets, and non-fabricated discovery plan.
- M1 complete: methodology/output/uncertainty/evaluation fail-closed policy; demo-data/provenance/privacy/provider gates.
- M2 complete: current-version research and ADR-0002–0010; tenancy/RLS, data/API/job/provider/deployment/observability specifications.
- M3 complete: threat/requirement traceability, CI strategy, Definition of Ready/Done, ordered vertical Phase 2 backlog.
- M4 complete: independent contradiction, security, method, dependency, and feasibility audit passed.

Initial M4 audit found 0 Critical/6 High. Iterative review then exposed and corrected cancellation, authorization, dispatch, dependency, serialization, timeout, queue-binding, durability, lock-order, concurrency, and cancellation-occupancy defects. Final independent review passed 0 Critical / 0 High / 0 Medium. Phase 1 gate integrity: 55/55 YAML, 128/128 wikilinks, 54/54 Home links, 68 evidence IDs with zero undefined/duplicates, 7/7 Ready stories, 21/21 acceptance IDs traced, 31 npm pins with zero peer/ERESOLVE warnings, 21 Python pins resolving together, and zero scaffold.

## Active Phase 2 work

- M0 / P2-01 complete: exact pnpm/uv locks; web/API/worker/contracts/core packages; health/correlation surfaces; canonical JSON-only queue codec; local Redis/Supabase config; digest-pinned non-root containers; immutable-action CI; runtime failure tests; and one fail-closed local runtime harness are implemented and verified.
- M0 observed green: exact toolchain check including effective pnpm 11 policy; frozen pnpm/uv checks; 29 exact npm dependencies plus pnpm 11.13.1 and 21 exact Python pins; format/lint; strict TypeScript/Python types over 30 Python source files; 4 web/contract plus 61 Python unit tests, with 2 POSIX-only lock tests expected-skipped on Windows; Next production build; byte-level generated-contract drift; 148-file secret baseline; canonical Compose boundary validation; image-manifest match; and zero known Moderate-or-higher npm or known Python dependency vulnerabilities.
- M0 review corrections: Redis tests are fixed to loopback DB 15 with dedicated exact-key cleanup; FastAPI exposes health routes only, accepts UUIDv4/v7 correlation, returns safe correlated failures, emits payload-free JSON logs, detects privileged Supabase credentials, and fails readiness on missing/unsafe runtime configuration. pnpm policy moved to its effective v11 configuration surface and CI now owns a disposable Supabase start/health/reset/stop lifecycle.
- M0 independent reviews: static confirmation and final runtime-harness safety review each passed 0 Critical / 0 High / 0 Medium after all findings were corrected (E-5005, E-5007).
- M0 runtime harness: `pnpm verify:m0-runtime` strips inherited Docker/Compose routing and hosted Supabase overrides; validates and re-injects only a local Unix-socket/named-pipe context; requires canonical Redis loopback publication plus Compose DNS; refuses hosted links, nonlocal config, occupied ports, prior namespaces, or cross-clone concurrency; owns per-run resources; suppresses local credentials; contains descendants; probes Auth directly; and performs exact cleanup. The 32-test suite has 30 applicable Windows passes and 2 expected POSIX-only skips.
- M0 runtime proof: after user host remediation, Docker 29.6.1 passed the exact gate. Redis 8.2.7 non-root startup plus 3/3 ARQ enqueue/retry/hard-crash/shutdown tests, local Supabase Auth health/reset, three pinned image builds, `node`/`simula` runtime-user inspection, API/worker probes, and cleanup all passed. Post-run audit found zero run-owned containers, networks, images, temp directories, or hosted link markers (E-5008).
- R-021 is Mitigated. Docker Desktop 4.82.0 now starts after Virtual Machine Platform/WSL and hypervisor boot remediation plus reboot; Docker Server 29.6.1 passes the local engine probe. The prior timeout remains historical evidence only.
- M1 / P2-02 complete: `api`/`private` schemas, 14 constrained tables, four exact runtime/owner roles, global default function denial, forced RLS, 16 policies, self-only membership reads, composite tenant foreign keys, authored local Auth identities, atomic idempotent organization creation, and pinned generated database types are implemented.
- M1 observed green: `pnpm verify:m1-database` passes two zero-state resets, Supabase lint, 32 catalog-derived pgTAP assertions, Auth sign-in for three fixtures, anonymous plus authenticated Data API denial, real-session claim expiry/allowlist/pool-reset checks, direct-DML/owner-role denial, two-tenant RLS, idempotent replay/conflict, injected late-failure rollback, and the organization deletion-graph skeleton. Combined Redis/database integration is 5/5; full `pnpm check`, 157-file secret scan, and Moderate-blocking npm/Python SCA pass (E-5009).
- M1 correction loop caught and fixed restricted-role bootstrap semantics, ineffective schema-scoped function default revocation, retained `PUBLIC EXECUTE`, qualified SQL grammar misuse, generated Auth identity email handling, post-owner ACL ordering, and an ambiguous correlated RLS predicate that incorrectly blocked a user’s second organization.
- Current Obsidian integrity: 58/58 governed Markdown files have frontmatter, 152/152 wikilinks resolve, and 106 evidence definitions have zero duplicates or undefined references. The Phase 2 plan remains active with sections 1–11 until the exit gate passes.
- M2 / P2-03 is complete. Atomic project/stimulus-version commands, generated contracts, Auth-only accessible web journey, JWT/JWKS/claim boundary, rate/CORS/media safeguards, and audit-denial evidence are implemented. Browser domain calls use FastAPI bearer auth only; browser Data API access remains absent.
- M2 final local evidence: `pnpm verify:m2-api` passes two clean resets, lint, 32 pgTAP checks, 26 API tests, five database/Auth/API/Redis integrations, generated database/OpenAPI drift checks, and the full repository format/lint/type/web-test/web-build/secret/SCA gate. Review remediation added atomic Redis buckets, pre-auth IP protection with verified-request refunds, 24-hour idempotency replay bypass, DB-15 exact-key test cleanup, JSON-only command media, forged/expired/rotation proof, audit outcome/source/denial records, and browser-readable correlated CORS error headers. Two independent final reviews reported no remaining findings (E-5010).
- M3 / P2-04 is complete. Strict ARQ codec/result contract, durable run/outbox authority, queue transport, dispatcher, role-pinned worker execution, and run/result APIs now have a reset-driven real asynchronous proof. Hosted Supabase history matches migrations through `20260718020400`; the P2-05–P2-07 sequence remains pending (E-5013).

- M4 / P2-05 is complete. The browser now has a validated run-route guard, exhaustive state rendering, bounded shared polling, explicit unavailable-result/legacy-provenance states, full frozen provenance/limits, XSS-safe text rendering, a server-owned rollback switch, content-free browser telemetry, and an executable forbidden-claim policy. The local browser gate passes terminal result, safe error, polling, keyboard, desktop/mobile Axe, and responsive proofs; full `pnpm check` passes 141 tests with 2 expected platform skips (E-5014). No hosted schema or application state changed for this UI-only slice.
- M5 / P2-06 cancellation, retry, durable recovery, poison, and failure-experience are complete. Checked-in forward migrations add an owner/editor-only cancel command, narrow RLS/event/audit authority, no-active-lease cancellation finalization, cancel-wins completion/failure transitions, cancellation-aware dispatch claiming, durable temporary-schema-CREATE cleanup, database-authoritative 5s/30s timing with three-attempt exhaustion, a worker-only stale lease/Redis-loss reconciler that supersedes outbox generations under run-then-outbox locks, and a worker-only terminalizer for expired unconfirmed tenth dispatch claims. API/UI expose documented empty-JSON `POST /runs/{id}/cancel`; failed state gives explicit no-substitute-result copy and never fetches result/provenance. Timeout, explicit preflight-unavailable, and explicit rate-limit rejections are the only retryable provider failures; unknown/ambiguous provider errors remain terminal. Local reset/pgTAP/type checks, API/worker tests, real authorization/cancel-versus-completion/retry-exhaustion/stale-lease/poison-cancel integrations, five-browser-test P2 gate, and every constituent repository quality gate pass; hosted history/ACL verification also passes where migrations apply (E-5015–E-5021). P2-07 is active; Phase 2 remains open.

- M6 / P2-07 implementation/remediation and independent code re-review are green through E-5033. Database/provider receipt invariants, receipt provenance UI, source-state-preserving dynamic restore, exact history-secret suppression, trusted log identity, live worker health/readiness, and audited least-privilege operator run control have executable proof. [[QA/PHASE_2_AUDIT_2026-07-18|The final audit]] keeps Phase 2 open for human screen-reader evidence, GitHub-plan-blocked required-check enforcement, user-facing deletion/cache orchestration, and a full application-compatible staging restore.

## Active production-platform program

- OBSERVED 2026-07-29: Plan 003 is active. NestJS is the target public control
  plane, Python/FastAPI is the private AI-engine boundary, BullMQ is the target
  queue transport, and Supabase PostgreSQL remains durable authority under
  ADR-0011.
- OBSERVED 2026-07-29: PhantomCrowd commit
  `4f197a8df0de5183f2376a210f42aaf948bd9b0a` is now the primary MIT-licensed
  implementation reference for the whole behavioral-simulation idea. ADR-0012
  adopts its context graph, tiered agent fleet, rounds/actions, memory,
  crowd-pulse, reports, interviews, and A/B/retest decomposition with independent
  production hardening.
- OBSERVED 2026-07-29: the reference's reported validation is not inherited.
  The inspected revision lacks the dataset file named by its validation report,
  and its SQLite/in-memory state, silent defaults, unseeded randomness,
  permissive auth, and URL-fetch patterns are prohibited in admitted SIMULA
  methodology.
- OBSERVED 2026-07-29: M1 is locally green through E-5034. The isolated NestJS
  control-plane foundation, separate OpenAPI-generated client, strict BullMQ
  identifier job contract, unit/E2E/real Redis integration, impacted Next
  regression/build, frozen install, claims/secrets, and SCA gates pass. Root
  format remains blocked only by unchanged generated `apps/admin/next-env.d.ts`;
  root Python lint/type commands additionally include an unrelated user-owned
  untracked PDF generator with existing findings. No traffic, hosted schema,
  production resource, deployment, commit, or push changed.
- OBSERVED 2026-07-29: M2 has one gated read-only slice through E-5035:
  `/api/v2/me` and organization listing now preserve strict Supabase JWT,
  FastAPI-compatible signed-cursor, transaction-local claim, RLS, RFC 9457,
  readiness, OpenAPI, and generated-client boundaries. Build/typecheck, 52 Jest,
  2 Redis/BullMQ, and 3 contract tests pass. Production enablement is explicitly
  rejected.
- BLOCKED 2026-07-29: the explicit reset-driven PostgreSQL gate found that the
  server on loopback port 54322 has no SIMULA schemas or authored users; Docker
  control is unavailable. It failed before password rotation or fixture writes.
  Therefore real RLS/claim-cleanup integration is unproven, M2 remains active,
  and no traffic can move from FastAPI.
- OBSERVED 2026-07-29: E-5036 expands M2 to the complete overlapping
  identity/organization/project/stimulus/demo-audience/run/result/provenance
  route surface with exact Redis admission/idempotency behavior, durable
  sign-in/denial audit calls, strict HTTP controls, generated v1/v2 golden
  contracts, and a fail-closed Next browser rollback flag. API 92 Jest plus 6
  live Redis/BullMQ tests, 4 contracts, web 76 Vitest tests, production build,
  impacted formatting, claims, secrets, and remediated SCA pass. This does not
  clear the real database, cross-tenant HTTP, or authenticated browser gates;
  the browser remains on v1 by default and production NestJS enablement remains
  prohibited.
- OBSERVED 2026-07-29: E-5047 closes the local Phase 3/4 methodology contract
  gap in M2. `/api/v2` now exposes the authenticated methodology registry,
  organization audience create/list, project simulation-configuration
  create/list, and methodology-preview workflow. NestJS reuses the existing
  authorized atomic SQL commands and performs strict DTO, RLS-context,
  idempotency, rate, response, and private-service binding checks. Numerical
  methodology and complete-report construction execute only inside the
  bearer-authenticated private FastAPI engine. The Next client routes this
  slice through the same default-v1 rollback flag and consumes generated v2
  input/response types. Golden v1/v2 parity and local unit/build gates pass.
  Real reset-driven PostgreSQL/RLS, cross-tenant HTTP, and authenticated browser
  proof remain blocked; no population, accuracy, equivalence, deployment, or
  production-readiness claim is made.
- OBSERVED 2026-07-29: E-5048 extends M2 with the durable campaign-optimization
  loop. `/api/v2` now creates/lists ordered variant groups, compares only
  compatible complete reports, creates/reads a methodology report only for a
  succeeded run, renders checksum-bound JSON/CSV in the private engine, stores
  it through the existing atomic Phase 4 export command, and downloads only an
  active unexpired artifact with safe content headers. NestJS rechecks private
  response identity, format, canonical base64, byte size, filename, media type,
  and SHA-256. The Next client uses generated v2 inputs through the default-v1
  rollback flag. API 167/167, Python core/engine 155/155, web 108/108, contracts
  7/7, optimized web build, generated drift, Ruff, mypy, claims, secrets, and
  diff gates pass. SQL/RLS/replay/expiry/cross-tenant HTTP and authenticated
  browser proof remain unavailable; M2 and production admission stay open.
- OBSERVED 2026-07-29: E-5049 exposes the durable optimization loop in the real
  Next client. Succeeded schema-v2 behavioral runs can select a frozen
  configuration, create and reload a bound experimental methodology report,
  and request JSON/CSV exports. The browser download boundary requires exact
  safe attachment filename, media type, declared length, actual length, quoted
  SHA-256 ETag, and Web Crypto checksum agreement before saving bytes.
  Methodology Lab now loads saved variant groups and renders compatible modeled
  deltas with an explicit no-winner/no-causal-market-lift boundary. Web tests
  pass 113/113 across 35 files; ESLint, focused formatting, optimized Next
  production build/TypeScript, 152-file claims, 1,790-file secrets, and diff
  checks pass.
- OBSERVED 2026-07-29: fixture-backed browser QA used an ephemeral ES256/JWKS
  Supabase session and the real Next/Supabase browser client. It created and
  reloaded a durable report, downloaded a checksum-bound JSON artifact, listed
  a two-member saved variant group, and rendered its modeled comparison.
  Final desktop/mobile report and comparison contexts had zero console errors
  or warnings; 390px Methodology Lab width had no horizontal overflow.
- BLOCKED 2026-07-29: E-5049 browser proof is client/presentation contract
  evidence against a loopback fixture, not real NestJS/PostgreSQL/RLS evidence.
  Database-backed replay/conflict, expiry, bytea persistence, cross-tenant
  denial, real private-engine HTTP, loading/empty/error coverage, assistive
  technology review, hosted deployment, and production admission remain open.
- OBSERVED 2026-07-29: E-5050 and ADR-0014 add the first supported private
  stimulus-asset ingestion seam. Migration `20260729151639` makes expected
  media, byte size, SHA-256, retention, and tenant/stimulus/asset/digest object
  path immutable; adds replay-safe reservation, exact upload confirmation,
  durable deletion request, and tombstone commands; and retains forced RLS,
  least privilege, a private bucket, and no browser `storage.objects` policy.
  NestJS exposes authenticated reserve/list/upload/download/delete operations,
  exact binary media/body limits, current-membership checks, byte/hash
  verification, retention rejection, private response headers, and optional
  readiness. The S3 adapter hard-codes and runtime-validates the sole bucket/key
  namespace and can later be replaced by an equivalent R2 adapter.
- OBSERVED 2026-07-29: E-5050 local gates pass 31 API suites / 186 tests, 35 web
  files / 113 tests, 2 admin tests, 7 contract tests, 374 Python tests with 2
  expected Windows skips, all four production builds, generated OpenAPI/client
  drift, TypeScript workspace lint/typecheck, focused formatting/diff, 152-file
  claim policy, 1,807-file secret scan, npm Moderate admission with one exact
  ignored legacy dev advisory, and Python SCA with no known vulnerabilities.
- BLOCKED 2026-07-29: E-5050 database lint and pgTAP both exit 1 before tests
  because the local Supabase PostgreSQL service cannot enable `pgsql_check` or
  pgTAP while Docker is unhealthy. Migration execution, 21 assertions,
  generated database types, forced-RLS/cross-tenant proof, legacy-row
  precondition, and restore exercise are unverified. No real Supabase S3 key,
  upload, download, deletion, retention, cross-bucket denial, browser workflow,
  R2 adapter, OCR, computer vision, multimodal provider, or visual behavioral
  analysis exists. Storage remains disabled and production readiness rejected.
- OBSERVED 2026-07-30: E-5051 adds the fail-closed private stimulus-asset web
  workflow. The server-only UI switch also requires domain API v2. The browser
  computes SHA-256 before immutable reservation, reuses reserve/upload keys
  across ambiguous retries, accepts only the five generated media types and 16
  MiB limit, lists exact lifecycle/checksum/retention state, and requires
  explicit confirmation before retry-stable deletion. Viewers can inspect and
  verify available files but cannot mutate them.
- OBSERVED 2026-07-30: available downloads now require exact media type,
  filename, declared/actual size, quoted SHA-256 ETag, no-store, sandbox, and
  nosniff headers before Web Crypto verification. Images use private blob
  previews; PDFs use a sandboxed iframe; MP4 is verified then downloaded.
  Generated public contract parsing rejects extra/private storage coordinates
  and inconsistent lifecycle fields. UI copy states that SIMULA has not
  analyzed, interpreted, or scored the contents.
- OBSERVED 2026-07-30: E-5051 gates pass 37 web files / 126 tests, 31 API suites
  / 186 tests, web/API lint and type/build, generated contract drift, focused
  formatting, a 156-file claim scan, a 1,817-file secret scan, and a
  self-starting Chromium upload/preview/delete fixture with zero Axe violations.
- BLOCKED 2026-07-30: the browser proof injects an in-memory asset client into
  the real React component. Local Supabase Auth and the disposable database were
  unavailable, so no authenticated Next/NestJS/PostgreSQL/RLS/S3 full-stack
  journey, real-object retention/expiry, cross-tenant denial, deletion recovery,
  R2 behavior, or human assistive-technology review ran. Storage/UI flags remain
  off by default. No OCR, vision, multimodal inference, behavioral interpretation,
  deployment, or production-readiness claim exists.
- OBSERVED 2026-07-30: E-5052 and ADR-0015 add the first asset-bound technical
  image-profile slice. Only verified, retained, available JPEG/PNG/WebP bytes
  can enter the private Python engine after media/size/SHA-256 revalidation.
  Pillow verifies and reopens an allowlisted format, rejects decompression
  bombs and oversized decode/input envelopes, applies EXIF orientation, and
  deterministically samples at most 256 by 256 pixels. The immutable output
  contains normalized dimensions, sampling provenance, nine bounded technical
  signals, exact method/provider versions, checksum, experimental label, and
  explicit false behavioral/population/metadata-retention flags.
- OBSERVED 2026-07-30: authenticated NestJS v2 create/read routes recheck
  private asset bytes, use an asset-stable analysis identity plus durable
  idempotency receipt, reject response/identity/signal drift, and persist one
  immutable profile per immutable asset under forced RLS. Asset retirement
  removes the derived profile. The generated client and fail-closed web surface
  render the technical values and fixed limitations without exposing bytes or
  storage coordinates. API, Python, contract, web, build, claim, secret, and
  fixture-backed Chromium/Axe checks cover the slice.
- BLOCKED 2026-07-30: the E-5052 migration and its 18 pgTAP assertions are
  authored but unexecuted. Local database lint cannot enable `pgsql_check`, and
  local pgTAP cannot enable its extension. The browser injects an in-memory
  client; no authenticated Next/NestJS/PostgreSQL/RLS/S3 journey, real object,
  cross-tenant denial, retirement cleanup, or hosted readiness ran. PDF/video,
  OCR, object/brand recognition, semantic meaning, emotion, persuasion,
  aesthetic quality, and behavioral/campaign-performance prediction remain
  unsupported. All visual-profile flags remain off by default; no deployment,
  customer data, Predikta equivalence, validation, or production-readiness
  claim exists.
- OBSERVED 2026-07-30: E-5053 resolves the E-5052 local database/runtime gap.
  An isolated PostgreSQL 17 database accepted the entire migration chain from
  zero and all 13 pgTAP files passed 244/244 assertions. The visual coverage is
  18 catalog/contract assertions plus 14 adversarial assertions proving exact
  replay, immutable conflict, no duplicate audit, cross-tenant/missing-claim
  denial, retirement cleanup, and failed-command receipt discipline.
- OBSERVED 2026-07-30: a signed local RS256/JWKS session executed organization,
  project, stimulus, asset reservation, real S3-compatible object upload and
  verified download, private FastAPI/Pillow profiling, PostgreSQL creation,
  replay, and read through the actual NestJS routes. Direct database evidence
  binds asset SHA-256
  `431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460`
  to profile checksum
  `23cba6b384cefe7f8c0b35aeba3844ebd089f355de4b6aae8c904bb5bb23f03e`,
  one command receipt, one success audit event, nine technical signals, and
  false behavioral/population claims. Strict live validation also exposed and
  fixed the empty create DTO; the generated/client contract now requires exact
  `technical_image_signals_v1`.
- BLOCKED 2026-07-30: E-5053 is disposable local evidence, not hosted
  admission. Moto exercised the real S3 adapter but is not Supabase Storage;
  PostgreSQL did not reproduce the exact Supabase extension/linter packaging;
  Docker-backed Supabase is unavailable in the current verification session. The
  real Next browser was not connected to this stack, and hosted TLS/CORS,
  cross-tenant HTTP, retention expiry, deletion recovery, human assistive
  technology, and production observability remain open. All flags stay off.
  No customer data, behavioral validation, Predikta equivalence, deployment,
  or production-readiness claim exists.
- OBSERVED 2026-07-30: E-5054 makes the PostgreSQL gateway proof repeatable.
  `tsconfig.spec.json` now type-checks explicit database tests. On a fresh
  47-migration PostgreSQL database, 4/4 integrations passed: owner/foreign-
  tenant visibility, sign-in audit deduplication, pooled-claim cleanup, visual
  profile create/replay/read, cross-tenant concealment, one receipt/one audit,
  and derived-profile erasure on asset retirement. The disposable cluster was
  stopped and deleted after proof.
- OBSERVED 2026-07-30: E-5055 resolves the remaining local real-browser gap.
  Production Next standalone ran against loopback Supabase-shaped RS256/JWKS
  Auth, the actual NestJS v2 control plane, a clean 47-migration PostgreSQL
  database, isolated Redis, the real AWS-SDK S3 adapter, and the private
  FastAPI/Pillow engine. Chromium signed in; created an organization, project,
  stimulus, and bounded authored-demo run; uploaded and SHA-256-verified a
  4,277,838-byte PNG; rendered the private preview and immutable nine-signal
  technical profile; and permanently deleted the available object and an
  interrupted pending reservation. Fresh reload: both tombstones, 0 console
  errors, 0 warnings. Direct close-out: two `deleted` asset rows, zero derived
  profile rows, zero remaining objects.
- OBSERVED 2026-07-30: the browser exposed a v2 migration hole and an empty-
  command validation defect. NestJS now owns a strict tenant/RLS-scoped
  organization dashboard, the web client uses admitted-version routing, and
  asset deletion plus run cancellation accept only documented `{}` bodies.
  Generated contracts pass. Current gates: 35 API suites / 206 tests, 38 web
  files / 132 tests, and 7 contract tests.
- BLOCKED 2026-07-30: E-5055 is still disposable local evidence. Auth and S3
  were loopback protocol-shaped harnesses, not hosted Supabase services; the
  object store was process-local. Cross-tenant browser/HTTP denial, retention
  expiry, deletion-failure recovery, loading/empty states, human screen-reader
  review, hosted TLS/CORS/Storage/telemetry, restore/rollback, rights-cleared
  audiences, held-out human/outcome validation, external-provider admission,
  deployment, Predikta equivalence, and production readiness remain open. All
  production flags remain off; no customer or production data was used.
- OBSERVED 2026-07-30: E-5056 closes three E-5055 local HTTP gaps with an
  opt-in adversarial NestJS suite over a fresh 47-migration PostgreSQL 17
  database, Redis, and the real AWS-SDK adapter against a loopback S3-shaped
  boundary. Foreign-tenant read and deletion attempts return generic 404s
  without object access or removal. An ambiguous 204 deletion that retains
  bytes produces 503 while preserving durable `deletion_requested`; the same
  key then replays, removes the object, and confirms `deleted`. An available
  expired asset returns 404 before object GET. The database suite passes 5/5;
  default controller regressions plus the full API suite pass 208/208 across
  35 suites, followed by typecheck, build, and OpenAPI drift.
- BLOCKED 2026-07-30: E-5056 remains isolated local evidence. Project/stimulus
  setup used the real gateway to keep unrelated organization-mutation burst
  capacity outside the asset assertions. Auth and S3 were protocol-shaped
  loopback processes, object bytes were process-local, and Redis was 8.0.4
  rather than the pinned production release. Cross-tenant browser UX,
  loading/empty states, human screen-reader review, hosted Supabase Auth/
  Storage/TLS, telemetry, restore/rollback, deployment, rights-cleared
  audiences, held-out human/outcome validation, external-provider admission,
  Predikta equivalence, and production readiness remain open. All production
  flags remain off; no customer or production data was used.
- OBSERVED 2026-07-30: E-5057 adds the missing real PostgreSQL/Redis
  cross-language BullMQ v2 proof. The actual NestJS run route performs the
  best-effort identifier publish, the pinned Python worker receives
  `awaiting_confirmation` and delays without an attempt, the real Node
  dispatcher proves and confirms the exact retained job, and redelivery
  commits one deterministic terminal result. A forced exact duplicate
  delivery completes as no-work while the database retains one attempt and
  one result. Fresh focused proof passes 1/1; all opt-in Nest database tests
  pass 6/6 across three suites. API 208/208, Nest live-Redis 7/7, worker 82/82,
  pinned Python BullMQ live-Redis 1/1, types, build, contracts, claims, and
  secrets pass.
- BLOCKED 2026-07-30: E-5057 closes only the confirmation/terminal/duplicate
  subset. BullMQ crash/stall, cancellation, poison, stale lease, Redis loss,
  and backpressure equivalence remain required. The proof used disposable
  local PostgreSQL/Redis and loopback Auth; production BullMQ admission stays
  rejected and ARQ remains the rollback path. No hosted runtime, deployment,
  rights-cleared audience, held-out human/outcome validation, behavioral
  accuracy, Predikta equivalence, or production readiness is established.
- OBSERVED 2026-07-30: E-5058 extends the real PostgreSQL/Redis/Python BullMQ
  proof to queued cancellation and hard process loss. HTTP cancellation before
  dispatch reaches durable `canceled` with zero attempts/results and terminal
  `canceled` outbox state despite the already-published job's bounded
  confirmation deferrals. A Python process forced to exit immediately after
  claim leaves attempt 1 and the job active; expiring its database lease and
  backdating progress lets the real dispatcher recover generation 2. Attempt
  1 becomes `superseded/recovered_stale_dispatch`, outbox generation 1 becomes
  `terminal/recovery_replaced`, generation 2 is dispatched, and the run
  succeeds with two attempts but exactly one immutable result. Focused proof
  passes 3/3; all opt-in database tests pass 8/8 across three suites. API
  208/208, Nest live-Redis 7/7, worker 82/82, pinned Python BullMQ live-Redis
  1/1, types, build, contracts, claims, and secrets pass.
- BLOCKED 2026-07-30: E-5058 does not prove poison dispatch, Redis loss,
  organization/global backpressure, exact BullMQ stalled-job timing, running
  cancellation, behavioral-engine execution on the v2 transport, or hosted
  production admission. PostgreSQL, Redis, and Auth remained disposable local
  boundaries. ARQ remains the rollback path; production BullMQ admission stays
  rejected. No deployment, customer data, behavioral validation, Predikta
  equivalence, or production readiness is established.
- OBSERVED 2026-07-30: E-5059 extends the real M3 failure matrix through
  Redis loss and poison admission control. A separate live Redis server is
  stopped after BullMQ connection; the actual dispatcher claims once but
  cannot publish or prove the job, leaving the outbox claimed and unconfirmed
  with zero result. After expiry and live transport recovery, the real
  dispatcher claims a second time, confirms, and the pinned Python worker
  succeeds with one attempt/result. A separate expired tenth dispatch claim
  becomes `terminal/dispatch_exhausted`; its run fails with zero execution
  attempts/results, and the same transaction latches global run admission
  `disabled/poison_outbox` with one audit. The next authenticated HTTP run
  request receives `503 queue_backpressure` and `Retry-After: 30`; the exact
  verified operator command re-enables admission and is audited. Focused proof
  passes 5/5; all opt-in database tests pass 10/10 across three suites. API
  208/208, Nest live-Redis 7/7, worker 82/82, pinned Python BullMQ live-Redis
  1/1, types, build, contracts, claims, and secrets pass.
- BLOCKED 2026-07-30: E-5059 advances the poison row directly to an expired
  tenth dispatch claim; it does not spend wall-clock time inducing ten organic
  outages. Exact BullMQ stalled-job timing, running cancellation,
  count/age/organization saturation thresholds, behavioral-engine execution
  under v2, exact hosted dependencies, and production admission remain open.
  ARQ remains rollback; all production BullMQ flags remain rejected.
- OBSERVED 2026-07-30: E-5060 closes the local running-cancellation and
  behavioral-execution gaps in the BullMQ v2 matrix. A worker paused after
  claim and pre-provider heartbeat observes the authenticated HTTP
  cancellation on completion, records `canceled/canceled_by_user`, terminal
  outbox `canceled`, and no result. A separate behavioral command selects the
  active governed authored-demo audience v2, emits the canonical `created`
  event, passes through the real private FastAPI engine, and persists one
  checksum-valid canonical artifact, one provider receipt, and one
  `experimental/deterministic_tiered` summary with 10 calls. The authenticated
  result route returns the same bounded contract.
- OBSERVED 2026-07-30: clean replay and execution uncovered fail-closed drift
  across the original M4-M6 migrations: retired audience v1 selection,
  non-admitted creation reason, non-canonical demo-input key ordering, missing
  summary/FK-lock authority for the completion owner, revoked owner execution
  on both normalization routines, missing action-event FK-lock authority, and
  a missing behavioral-completion metrics allowlist operation. Migration
  `20260730160000` corrects the database chain without weakening the runtime
  `simula_worker` role; the non-login function owner receives only the forced-
  RLS capabilities required by completion and trigger execution.
- OBSERVED 2026-07-30: one fresh 48-migration fixture passes focused BullMQ
  7/7 and all database suites 12/12. Regression gates pass API 208/208, Nest
  live-Redis 7/7, Python domain/worker/engine 250/250, two cross-language
  private HTTP/BullMQ integrations, scoped Ruff/mypy/Prettier, API
  typecheck/build/OpenAPI, generated contracts, contracts build, claims, and
  secrets. Docker Desktop is stopped and the disposable PostgreSQL package set
  has no pgTAP, so updated pgTAP files and Docker-bound database-type generation
  did not run.
- OBSERVED 2026-07-30: E-5061 closes the local behavioral replay, duplicate,
  hard-crash recovery, and normalized deletion-cascade gaps. Exact API replay
  returns the original accepted `queued` snapshot with the same run identity;
  forced queue redelivery performs no additional durable work. A behavioral
  worker lost after claim is recovered through generation 2 with one final
  checksum-valid result. Deleting the completed run removes every canonical
  and normalized artifact.
- OBSERVED 2026-07-30: that deletion proof exposed a real ACL defect.
  Migration `20260730170000` grants `DELETE` on
  `api.behavioral_run_results` only to its non-login owner so the foreign-key
  cascade can execute; `simula_worker` still has no direct delete privilege.
  One fresh 49-migration fixture passes focused BullMQ 8/8 and all database
  suites 13/13. API 208/208, Nest live-Redis 7/7, Python 387 passed with 2
  expected Windows skips, contracts 7/7, builds, OpenAPI/contracts drift,
  scoped format/lint, claims, and secrets pass.
- BLOCKED 2026-07-30: E-5061 is still deterministic experimental local proof.
  Exact BullMQ stalled-job timing, count/age/organization saturation, hosted
  dependency behavior, external-provider admission, rights-cleared audiences,
  held-out human/outcome validation, deployment, and production admission
  remain open. Docker-bound pgTAP and generated database-type gates did not
  run. ARQ remains rollback; all production BullMQ flags remain rejected.
- OBSERVED 2026-07-30: E-5062 closes the remaining local M3 timing and
  saturation subset. Migration `20260730180000` persists only bounded
  worker-observed BullMQ queue pressure and makes authenticated run admission
  reject depth 100, oldest-ready age 60 seconds, or Redis memory 80%; a healthy
  below-threshold dispatcher observation clears only this transient pressure.
  Real BullMQ depth 100/99 and ready age 61/30 seconds close/reopen admission.
  The live Redis memory parser/dispatcher path plus SQL 80/79.9% boundary are
  covered. Organization run 20 succeeds, run 21 returns `quota_exceeded`, and
  concurrent v2 claims hold exactly three execution leases.
- OBSERVED 2026-07-30: a production-configured Python BullMQ worker now
  detects a hard-crashed generation-1 job through the real 30-second lock and
  30-second stalled scan. The same job settles on its second BullMQ start only
  inside the asserted 27-70 second wall-clock window; PostgreSQL still has one
  running attempt and no result until its independent stale-lease recovery is
  advanced, after which generation 2 succeeds with one result. A fresh
  50-migration fixture passes focused BullMQ 11/11 and all database suites
  16/16. API 211/211, Nest live-Redis 7/7, Python 387 passed with 2 expected
  Windows skips, contracts 7/7, builds, drift, and scoped static gates pass.
- BLOCKED 2026-07-30: E-5062 remains disposable local evidence, not production
  admission. Exact Supabase-container pgTAP and generated database types remain
  blocked by unavailable Docker Linux. Hosted Supabase/Redis/FastAPI behavior,
  production-shaped multi-replica load, external-provider admission,
  rights-cleared audiences, held-out human/outcome validation, deployment, and
  production cutover remain open. ARQ remains rollback and all production
  BullMQ flags remain rejected.
  This is not behavioral accuracy, Predikta equivalence, population
  representation, or production readiness.
- OBSERVED 2026-07-30: E-5063 closes the local two-replica M3 load subset.
  Two separate Node dispatchers, each with its own worker-role PostgreSQL pool
  and BullMQ Redis client, claim and confirm 30 authenticated tenant-isolated
  runs exactly once. Two distinct synchronized Python processes, each using
  production concurrency 4, both claim work; their disjoint claim sets cover
  all 30 exact jobs.
- OBSERVED 2026-07-30: all 30 jobs settle with one BullMQ start. PostgreSQL
  records 30 succeeded attempts, 30 dispatched outboxes with one dispatch
  attempt, and 30 immutable results. Attempt duration p95 is `0.161628s`,
  maximum `0.174258s`; creation-to-last-terminal fixture span is `6.049773s`.
  Focused load passes 1/1 and all database suites pass 17/17. API 211/211,
  Nest live-Redis 7/7, Python 387 plus 2 expected skips, contracts 7/7,
  builds, drift, and scoped static gates pass.
- BLOCKED 2026-07-30: E-5063 does not execute hosted Supabase/Railway Redis,
  provider/network latency, maximum behavioral workloads, staged
  no-dual-consume rollback, or production cutover. Production flags remain
  rejected and ARQ remains rollback.
- OBSERVED 2026-07-29: E-5037 adds the partial M3 BullMQ execution seam. A
  separate Node dispatcher uses only `simula_worker`, validates legacy durable
  outbox identity, proves the exact retained BullMQ job before confirmation,
  and evaluates durable run control. The Python worker has a disabled-by-default
  v2 transport, strict cross-language binding, a worker-only v2 SQL claim
  wrapper, bounded active-to-delayed database-authorized deferrals, queue
  metrics, and graceful/fatal lifecycle handling. Frozen install, 121 NestJS
  Jest tests, 7 Node live-Redis tests, 294 Python passes plus 2 expected Windows
  skips, one real Python BullMQ redelivery test, contracts, claims, secrets, and
  SCA pass. BullMQ production use is explicitly rejected.
- BLOCKED 2026-07-29: M3 is not complete. Migration
  `20260729090000_bullmq_v2_worker_binding.sql` and its pgTAP ACL test cannot be
  reset/replay tested while loopback 54322 is non-SIMULA and Docker control is
  unavailable. Real database-backed duplicate/crash/cancel/poison/stale/Redis
  loss/backpressure/terminal-result equivalence remains required. ARQ stays the
  default rollback path; no dual consumer is authorized.
- OBSERVED 2026-07-29: E-5038 adds the first M4 behavioral-engine slice. The
  independent Python core now has provenance-bound context graphs, governed
  population sampling, weighted psychographic tiered agents, seeded interaction
  rounds, immutable action events, bounded run-scoped memory, replayable crowd
  pulse, typed heuristic scoring, explicitly non-population synthetic
  dispersion, evidence-bound narrative synthesis, labelled synthetic
  interviews, and frozen matched A/B comparison.
- OBSERVED 2026-07-29: the new `services/ai-engine` private FastAPI boundary
  admits only the exact zero-cost deterministic provider descriptor, requires
  one or two rotating bearer tokens, rejects non-JSON/oversized/extra input,
  propagates cancellation/deadline/cost failure, exposes safe health/readiness,
  and has a pinned non-root image. A disabled worker HTTP adapter rejects
  proxy inheritance, redirects, encoded/oversized/malformed responses, unsafe
  origins, and valid-but-wrong command results.
- OBSERVED 2026-07-29: the M4 execution seam now freezes only the compact
  `behavioral_demo_run_v1` input plus release identity, admits it through a
  dedicated `/api/v2/projects/{project_id}/behavioral-demo-runs` command,
  routes schema-v2 claims through BullMQ to the private engine, binds exact
  canonical result bytes to the run/attempt/lease, and defines one atomic
  PostgreSQL completion for result summary, private payload, provider receipt,
  terminal state, event, and audit persistence. Public job IDs remain BullMQ
  IDs across create/replay/read/cancel. The generated OpenAPI client and
  rollback-safe legacy routes remain separate.
- OBSERVED 2026-07-29: a prespecified evaluation harness now requires disjoint
  development/holdout campaign IDs, exact holdout rows, frozen method identity,
  complete-or-absent baseline scores, deterministic outcome checksums, and
  sparse-subgroup suppression. It labels reports `benchmark_only`; no outcome
  corpus or validity threshold is bundled.
- OBSERVED 2026-07-29: the authenticated
  `/api/v2/runs/{run_id}/behavioral-result` route returns only the
  tenant-filtered report/checksum projection. The full canonical payload stays
  private. A generated Python-authority JSON Schema plus canonical action-share,
  typed-score, and narrative-evidence checks fail closed on malformed rows.
- OBSERVED 2026-07-29: 359 complete non-integration Python tests plus 2 expected
  Windows skips, 131 NestJS tests, 76 web tests, 5 contract tests, all TypeScript workspace
  lint/type checks, Python Ruff/mypy for the changed slice, generated-contract
  drift, forbidden-claim policy, and static PostgreSQL parsing pass.
- BLOCKED 2026-07-29: M4 is not complete. Migration
  `20260729094522_behavioral_engine_artifacts.sql` and its 18-assertion pgTAP
  boundary are authored but not reset-tested because the disposable SIMULA
  database remains unavailable. No rights-cleared behavioral dataset, external
  provider, held-out human/outcome benchmark, live deletion/crash proof,
  staging runtime, or scientific validation exists. Every output remains
  experimental.
- OBSERVED 2026-07-29: E-5039 starts M5 with three additive CLI-created
  migrations. Canonical result insertion normalizes tenant-bound context graphs,
  fleet manifests, action events, run-scoped memories, and report evidence
  links inside the completion transaction. Separate governed registries cover
  versioned evidence rights, approved-use/expiry controls, aggregate campaign
  outcomes with a 50-observation subgroup floor, private stimulus-asset
  metadata/bucket configuration, and benchmark-only protocol/run/member
  provenance. Forty-nine focused pgTAP assertions and the exact 35-assertion
  catalog inventory are authored.
- OBSERVED 2026-07-29: E-5046 and ADR-0013 add the first governed pgvector
  seam. Model-version rows carry artifact, dimensions, normalization, rights,
  prohibited-use, benchmark, exact-recall, and lifecycle evidence. Immutable
  vectors bind organization, graph version, node ID, content checksum, model
  version, and vector checksum. Worker-only ingestion rejects unadmitted models
  and conflicting retries. API-only exact cosine search is limited to one
  tenant-visible graph and 50 results; the existing graph ceiling bounds it to
  500 nodes. No model row is seeded or admitted.
- BLOCKED 2026-07-29: M5 migrations, trigger backfill, RLS, bucket behavior,
  cascades, generated database types, and pgTAP are not executed because Docker
  remains unavailable and loopback 54322 is not SIMULA. The pgvector migration,
  21 focused assertions, catalog allowlists, RLS, ingestion/search behavior,
  generated database types, and query plan are therefore unexecuted. No asset,
  outcome/retrieval corpus, vector row, model admission, hosted resource, or
  external provider was created.
- OBSERVED 2026-07-29: E-5040 starts M6 with generated Python-authority
  context-graph and benchmark-only evaluation schemas. Authenticated
  `/api/v2/runs/{run_id}/behavioral-evidence` validates canonical graph order,
  node content hashes, normalized row/result checksum binding, counts, and
  limitations, then returns only bounded aggregate trace groups and sample
  event IDs. It does not read private actions, memory, fleet, or canonical
  payloads. NestJS passes 138 tests, contracts pass 6, all 13 TypeScript
  lint/type/test tasks pass, and complete non-integration Python remains 359
  passes plus 2 expected Windows skips.
- BLOCKED 2026-07-29: the M6 evidence route has no real database/RLS/HTTP or
  browser proof because M5 is not applied to a disposable SIMULA database. The
  complete audience/stimulus/setup/status/results/interview/refinement/retest/
  comparison/export/audit campaign lab and human accessibility evidence remain
  open. No production traffic moved.
- OBSERVED 2026-07-29: E-5040 expands the feature-gated M6 slice through
  behavioral run launch/status, strict result/evidence rendering, checksum-bound
  public fleet and round summaries, ten fixed synthetic/not-testimony interview
  replays, recommendations/limitations, and frozen matched retest/A/B deltas
  with no winner/lift/causal/human-preference claim. Validated comparison JSON
  export is present. NestJS passes 154 tests, web 98, contracts 7, and Python
  371 plus 2 expected Windows skips; the optimized Next build passes.
- OBSERVED 2026-07-29: E-5045 adds a retry-stable immutable
  refinement-and-retest path and a strict run-scoped audit timeline. The
  coordinator preserves append/run idempotency across ambiguous failure and
  never appends the revision twice on retry. Migration `20260729113000` exposes
  at most 50 tenant-visible run-state events while excluding actor identity,
  metadata, payloads, prompts, agent memory, and rationale. NestJS passes 156
  tests, web 107 across 33 files, contracts 7, and Python 371 plus 2 expected
  Windows skips; the optimized Next build passes. Fixture-backed browser QA
  used a real ES256/JWKS-verified Supabase SSR session and real Next/client
  code. It proved full report/evidence/audit rendering, keyboard refinement
  through immutable-version and retest POSTs, queued-run navigation, matched
  comparison JSON export with no winner, fail-closed audit 503/recovery,
  desktop/mobile responsive rendering, and zero final console errors. Axe
  reported 0 violations with 48 desktop and 49 mobile passes after two
  accessibility corrections; manual contrast ratios for four clipped-scroll
  automation-incomplete nodes were 5.70:1 and 6.11:1.
- BLOCKED 2026-07-29: M6 remains open because migrations through
  `20260729113000_m6_run_audit_history.sql`, its 14 new pgTAP assertions, the
  16 public-summary assertions, and prior M5 schema are not disposable-reset
  tested. There is no database-backed tenant/RLS/HTTP/browser/export/refinement
  journey, rights-cleared population builder, loading/empty-state proof, or
  human screen-reader evidence. Production behavioral enablement remains
  false.
- BLOCKED 2026-07-29: Docker Desktop restart did not recover the Linux engine.
  Its backend reports `hasNoVirtualization:true`; Windows reports
  `HypervisorPresent=False`; the Docker server remains null and Engine API
  version/info calls return HTTP 500. Elevated hypervisor/platform remediation
  plus a reboot is required before any disposable reset, image, restore, or
  database-backed browser proof.
- OBSERVED 2026-07-29: E-5041 starts M7 with disabled-by-default Sentry error
  capture and OpenTelemetry trace export across NestJS, Next.js, Python API,
  worker, and private AI engine. Exact environment/release identity, HTTPS
  exporters, fixed sampling, payload/identity/error-message redaction, generic
  span names, and a fixed attribute allowlist fail closed. Checked deployment
  assets define an immutable eight-panel dashboard, six symptom alerts, and
  linked runbooks.
- BLOCKED 2026-07-29: M7 has no hosted Sentry/collector, dashboard import, alert
  receiver/delivery/recovery, staging deployment, load/cost evidence,
  application-compatible restore, rollback drill, or signed release proof.
  Static configuration and local tests do not establish production readiness.
- OBSERVED 2026-07-29: E-5042 adds a deterministic local engine-envelope
  rehearsal. Repeated 10x1, 200x3, and maximum 2,000-agent x 5-round cases stay
  within 0.056s, 1.158s, and 24.006s observed p95; maximum canonical output is
  9,480,823 of 16,000,000 bytes; peak traced allocation is about 81 MB; provider
  call counts bind exactly, deterministic cost is zero, and repeated checksums
  are stable.
- BLOCKED 2026-07-29: E-5042 is not a hosted/concurrent service load or
  billable-provider cost forecast. Queue/database/network concurrency,
  autoscaling, sustained soak, telemetry overhead, query plans, and real cost
  reservation proof remain M7 requirements.
- OBSERVED 2026-07-29: E-5043 adds target Railway manifests for the non-root
  NestJS control plane and private AI engine, carries public telemetry identity
  through the web image, and defines a fail-closed deterministic release bundle
  plus pinned GitHub/Sigstore provenance attestation and immediate verification.
  Nine static deployment/release/rollback tests and two current-head restore
  contract tests pass; isolated pnpm runtime assembly and Sentry/OpenTelemetry
  requires pass.
- BLOCKED 2026-07-29: Docker's Linux server returns HTTP 500, so the new
  control-plane image is unbuilt/unscanned. No manifest is deployed and no
  release workflow, tag, attestation, verified bundle, or GitHub-plan support is
  proven. NestJS remains rejected in production until full equivalence gates.
- INFERRED 2026-07-29: E-5044 completes the repository technical M7
  privacy/security data-flow and threat delta. It confirms default-off vendor
  export/provider admission and existing redaction/isolation/release controls,
  but explicitly rejects production.
- BLOCKED 2026-07-29: no named legal/privacy/security approval, vendor
  data-processing/region/retention/RBAC/deletion review, hosted redaction,
  disposable tenant/storage proof, external-provider assessment, independent
  security test, recovery exercise, or go/no-go record exists.

## Key constraints

- Pressure-test before field research; never market as survey replacement.
- Phase 2 uses authored, non-representative demo synthetic data and deterministic mock provider.
- Numerical/calibrated, model, heuristic, qualitative, and recommendation outputs remain typed and visibly separate.
- Server authorization and RLS are defense in depth; neither substitutes for the other.
- No external provisioning, paid terms, production data, or production deployment without authority. The user authorized the named hosted Phase 2 schema migrations through remediation version `20260720083000`; the sole hosted fixture lineage contains two explicitly non-representative authored-demo versions, with only immutable v2 active and no customer or production data.

## Highest risks

See [[RISK_REGISTER|Risk Register]]. Critical themes: false precision/representation, privacy/data rights, tenant authorization, scraping assumptions, provider exposure, and validation drift.

## Blockers

- The independent code re-review is complete, but formal Phase 2 exit remains open. Phase 3 is not authorized.
- Human keyboard/screen-reader smoke evidence remains absent. Automated keyboard focus, accessibility-tree, responsive, and Axe proofs pass; they do not substitute for a human screen-reader pass.
- GitHub branch protection/required-check enforcement remains unavailable on the current private repository plan; API attempts return `403`. Changing visibility or billing requires user authority.
- Human/design-partner evidence remains absent. It does not block an explicitly experimental local walking skeleton; it blocks Phase 6 staging acceptance/customer-facing release.
- Hosted Supabase migrations through version `20260720083000` are applied and history-aligned. Before future hosted changes, inspect `db push --linked --dry-run`, reset/test the ordered migration locally, apply only checked-in migrations, and verify linked history/lint. Do not apply `seed.sql` or customer data.
- R-020: ARQ maintenance-only status requires exact Phase 2 proof and a tested Phase 5 exit decision before Phase 6.
