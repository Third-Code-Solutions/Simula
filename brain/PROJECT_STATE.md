---
title: SIMULA Project State
status: active
created: 2026-07-17
updated: 2026-07-17
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

Implement P2-03 organization/project/stimulus vertical on the verified P2-01 foundation and P2-02 tenant-safe database, then continue P2-04 through P2-07 in order. Prove one tenant-safe asynchronous deterministic demo result without real-provider egress or representativeness claims. No hosted/production deployment or external resource mutation without explicit authorization.

## Repository state

- OBSERVED 2026-07-17: Git reports No commits yet on main; all project files are untracked.
- OBSERVED 2026-07-17: P2-01 foundation and P2-02 database source are complete: exact manifests/locks, health/runtime proof, first ordered migration, local Auth fixtures, generated database types, least-privilege roles, forced RLS, complete organization command, and adversarial database gates. No hosted resource or production change exists.
- OBSERVED 2026-07-17: brain/ is the authoritative Obsidian-readable vault.
- OBSERVED 2026-07-17 Phase 0 close: 33/33 required notes/YAML, 36/36 Home targets, 49/49 vault wikilinks, 53 evidence IDs defined, 49 referenced, 0 undefined, and 0 application scaffold directories.
- OBSERVED 2026-07-17: system defaults remain Node 24.16, pnpm 9.15, and Python 3.14.5. Verified user-local bootstrap provides exact Node 24.18.0, pnpm 11.13.1, Python 3.14.6, uv 0.11.19, and Supabase CLI 2.109.1 without loosening manifests.

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
- M2 / P2-03 is now the only active implementation milestone; M3–M6 remain pending in strict dependency order per [[QA/PHASE_2_BACKLOG|Phase 2 Backlog]].
- M2 implementation is in progress: atomic project/stimulus-version commands and adversarial database coverage; FastAPI JWT/JWKS, pool/claims, RFC 9457, cursor, idempotency, and optimistic-version surfaces; generated OpenAPI/TypeScript contracts; and an accessible Supabase-Auth-only web journey are implemented. Browser domain calls go directly to FastAPI with the user bearer token; browser Data API access remains absent.
- M2 local evidence is green: exact Node 24.18.0/pnpm 11.13.1 toolchain; two reset-driven database gates; Supabase lint; 32 pgTAP checks; 20 API tests; four Auth/API/database integration tests; generated database types and contracts; web TypeScript/lint; five web tests; Next production build; and a real browser journey from local sign-in through organization/project/stimulus creation and a second immutable stimulus version with distinct SHA-256 checksums. Windows API execution uses `asyncio.Runner` with a selector loop for psycopg compatibility, and Vitest uses one deterministic fork. M2 is not complete: independent review remains required.
- Phase 3 remains blocked until Phase 2 implementation, evidence, and independent review pass.

## Key constraints

- Pressure-test before field research; never market as survey replacement.
- Phase 2 uses authored, non-representative demo synthetic data and deterministic mock provider.
- Numerical/calibrated, model, heuristic, qualitative, and recommendation outputs remain typed and visibly separate.
- Server authorization and RLS are defense in depth; neither substitutes for the other.
- No external provisioning, paid terms, production data, or production deployment without authority.

## Highest risks

See [[RISK_REGISTER|Risk Register]]. Critical themes: false precision/representation, privacy/data rights, tenant authorization, scraping assumptions, provider exposure, and validation drift.

## Blockers

- Human/design-partner evidence remains absent. It does not block an explicitly experimental local walking skeleton; it blocks Phase 6 staging acceptance/customer-facing release.
- Hosted credentials/provisioning are absent and unauthorized; local/disposable Phase 2 work must not mutate external resources.
- R-020: ARQ maintenance-only status requires exact Phase 2 proof and a tested Phase 5 exit decision before Phase 6.
