---
title: SIMULA Project State
status: active
created: 2026-07-17
updated: 2026-07-18
owner: Principal program and engineering lead
classification: OBSERVED
source_of_truth: true
---

# SIMULA Project State

## Current phase

- Phase 2 — Walking Skeleton.
- Active plan: [[../plans/active/002-phase-2-walking-skeleton|002-phase-2-walking-skeleton]].
- Completed: [[../plans/completed/000-phase-0-evidence-and-discovery|Phase 0]] and [[../plans/completed/001-phase-1-product-and-architecture-definition|Phase 1]] after independent review and exit audits.

## Current objective

Implement P2-06 cancellation/recovery, then P2-07's integrated exit gate in order. P2-05 is locally proven; P2-06 must preserve one authoritative terminal result through cancellation, retry, and worker races. No real-provider egress or representativeness claim is authorized.

## Repository state

- OBSERVED 2026-07-17: Git reports No commits yet on main; all project files are untracked.
- OBSERVED 2026-07-17: P2-01 foundation and P2-02 database source are complete: exact manifests/locks, health/runtime proof, first ordered migration, local Auth fixtures, generated database types, least-privilege roles, forced RLS, complete organization command, and adversarial database gates. No hosted resource or production change exists.
- OBSERVED 2026-07-17: brain/ is the authoritative Obsidian-readable vault.
- OBSERVED 2026-07-17 Phase 0 close: 33/33 required notes/YAML, 36/36 Home targets, 49/49 vault wikilinks, 53 evidence IDs defined, 49 referenced, 0 undefined, and 0 application scaffold directories.
- OBSERVED 2026-07-17: system defaults remain Node 24.16, pnpm 9.15, and Python 3.14.5. Verified user-local bootstrap provides exact Node 24.18.0, pnpm 11.13.1, Python 3.14.6, uv 0.11.19, and Supabase CLI 2.109.1 without loosening manifests.
- OBSERVED 2026-07-18: the hosted Supabase target is `ywiwmczccktwzqyhzhiz` (Simula, active). MCP-authorized access as `kurtgav` bootstrapped the four least-privilege roles and applied the three checked-in P2-03 migrations without seed data. Remote migration history now matches the checked-in versions; 9 `api` and 5 `private` empty RLS tables were verified (E-5011).
- OBSERVED 2026-07-18: checked-in migration `20260718010000_phase2_runs_and_worker` was reset-tested locally and applied once to the same hosted project. It adds the immutable global authored-demo fixture, frozen run/outbox command authority, worker-owner RLS policies, and execute-only worker helpers. Remote history was reconciled to the Git timestamp; verification found one fixture audience/version, no tenant/run data, no direct worker run DML, and the expected worker claim helper grant (E-5012).

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
- Current Obsidian integrity: 56/56 governed Markdown files have required frontmatter, 145/145 wikilinks resolve, 55 Home links resolve, 82 evidence IDs have zero duplicates or undefined references, and the active plan retains sections 1–11.
- M2 / P2-03 is complete. Atomic project/stimulus-version commands, generated contracts, Auth-only accessible web journey, JWT/JWKS/claim boundary, rate/CORS/media safeguards, and audit-denial evidence are implemented. Browser domain calls use FastAPI bearer auth only; browser Data API access remains absent.
- M2 final local evidence: `pnpm verify:m2-api` passes two clean resets, lint, 32 pgTAP checks, 26 API tests, five database/Auth/API/Redis integrations, generated database/OpenAPI drift checks, and the full repository format/lint/type/web-test/web-build/secret/SCA gate. Review remediation added atomic Redis buckets, pre-auth IP protection with verified-request refunds, 24-hour idempotency replay bypass, DB-15 exact-key test cleanup, JSON-only command media, forged/expired/rotation proof, audit outcome/source/denial records, and browser-readable correlated CORS error headers. Two independent final reviews reported no remaining findings (E-5010).
- M3 / P2-04 is complete. Strict ARQ codec/result contract, durable run/outbox authority, queue transport, dispatcher, role-pinned worker execution, and run/result APIs now have a reset-driven real asynchronous proof. Hosted Supabase history matches migrations through `20260718020400`; the P2-05–P2-07 sequence remains pending (E-5013).

- M4 / P2-05 is complete. The browser now has a validated run-route guard, exhaustive state rendering, bounded shared polling, explicit unavailable-result/legacy-provenance states, full frozen provenance/limits, XSS-safe text rendering, a server-owned rollback switch, content-free browser telemetry, and an executable forbidden-claim policy. The local browser gate passes terminal result, safe error, polling, keyboard, desktop/mobile Axe, and responsive proofs; full `pnpm check` passes 141 tests with 2 expected platform skips (E-5014). No hosted schema or application state changed for this UI-only slice.

## Key constraints

- Pressure-test before field research; never market as survey replacement.
- Phase 2 uses authored, non-representative demo synthetic data and deterministic mock provider.
- Numerical/calibrated, model, heuristic, qualitative, and recommendation outputs remain typed and visibly separate.
- Server authorization and RLS are defense in depth; neither substitutes for the other.
- No external provisioning, paid terms, production data, or production deployment without authority. The user authorized the named hosted P2-03 and P2-04 schema migrations; the sole hosted fixture is a fixed, explicitly non-representative authored-demo record, not customer or production data.

## Highest risks

See [[RISK_REGISTER|Risk Register]]. Critical themes: false precision/representation, privacy/data rights, tenant authorization, scraping assumptions, provider exposure, and validation drift.

## Blockers

- Human/design-partner evidence remains absent. It does not block an explicitly experimental local walking skeleton; it blocks Phase 6 staging acceptance/customer-facing release.
- Hosted Supabase P2-04 migration is applied. The local CLI remains unlinked; before future hosted changes, compare MCP migration history to Git, reset/test the ordered migration locally, and apply the checked-in migration exactly once with the authorized MCP identity. Do not apply `seed.sql` or customer data.
- R-020: ARQ maintenance-only status requires exact Phase 2 proof and a tested Phase 5 exit decision before Phase 6.
