---
title: SIMULA Phase 2 Traceability Matrix
status: approved
created: 2026-07-17
updated: 2026-07-20
owner: QA lead
classification: PROPOSED
source_of_truth: true
---

# SIMULA Phase 2 Traceability Matrix

## Exit-audit snapshot — 2026-07-19

E-5032 records the current green implementation gate: root `pnpm verify`, immutable semantic audience v2 with full-manifest checksum authority, exact owned Redis admission markers and atomic run buckets, a governed stable RFC 9457 code inventory, base-aware fail-closed OpenAPI compatibility, and hosted migration equality through `20260719050000` with clean linked lint and security advisors. [[PHASE_2_AUDIT_2026-07-18|The final audit]] retains three formal exit blockers and two Medium operational findings. Phase 3 is unauthorized.

## Product acceptance to tests

| Acceptance | Automated proof | Manual/runtime proof | Owner |
|---|---|---|---|
| AC-AUTH-001, AC-AUTH-002 | `API-AUTH-001`, `E2E-AUTH-001` | expired-session check | Web/API |
| AC-ORG-001, AC-ORG-002 | `DB-ORG-001`, `API-ORG-001`, `SEC-DATA-API-001`, `E2E-ORG-001` | atomic create/idempotency/no-roster audit review | DB/API/Web |
| AC-TEN-001, AC-TEN-002 | `SEC-RLS-001`, `SEC-API-001` | independent RLS review | DB/API/Security |
| AC-PROJ-001, AC-PROJ-002 | `API-PROJ-001`, `DB-VERSION-001`, `E2E-PROJ-001` | none | API/Web |
| AC-AUD-001 | `DB-FIXTURE-001`, `API-AUD-001`, `E2E-AUD-001` | disclosure copy review | Data/Web |
| AC-RUN-001 | `API-IDEM-001`, `INT-RUN-001` | none | API/DB |
| AC-RUN-002, AC-RUN-003 | `UNIT-STATE-001`, `INT-QUEUE-001`, `INT-WORKER-001` | queue evidence review | Worker/DB |
| AC-RUN-004 | `API-CANCEL-001`, `INT-CANCEL-RACE-001`, `E2E-CANCEL-001` | cancel/result race evidence | API/Worker/Web |
| AC-RUN-005, AC-RUN-006 | `INT-RETRY-001`, `E2E-FAIL-001` | safe-error copy review | Worker/Web |
| AC-RES-001, AC-RES-002, AC-RES-003 | `SCHEMA-RESULT-001`, `INT-PROV-001`, `E2E-RESULT-001` | no-false-claim review | Method/API/Web |
| AC-ERR-001 | `CONTRACT-PROBLEM-001`, `E2E-ERROR-001` | recovery copy review | API/Web |
| AC-A11Y-001, AC-A11Y-002 | `A11Y-AXE-001`, component tests, Playwright skip-link/disclosure keyboard proof | human screen-reader smoke outstanding | Web/QA |

Acceptance IDs are defined in [[../Product/ACCEPTANCE_CRITERIA|Product Acceptance Criteria]].

## Architecture decisions to proof

| Decision | Required proof before Phase 2 exit |
|---|---|
| ADR-0002 | exact manifests/locks; clean install; generated-contract drift check; runtime version check |
| ADR-0003 | JWT positive/negative/rotation-cache; `SEC-DATA-API-001`; `SEC-RLS-001`; `SEC-ROLE-001` no-direct-DML/helper separation; `SEC-CLAIMS-001` claim injection/pool reset; self-only membership; browser bundle secret scan |
| ADR-0004 | migration reset from zero; composite FK/immutability/deletion tests; result uniqueness |
| ADR-0005 | base-aware fail-closed OpenAPI compatibility; generated client compile; governed RFC 9457 inventory/examples; exact owned idempotency/rate-marker concurrency |
| ADR-0006 | canonical JSON serializer wired identically on producer/inspector/worker; pickle-gadget/no-fallback test; every transition; retry classes/budget; lease expiry; duplicate delivery; poison branches; cancel race |
| ADR-0007 | deterministic byte-equivalence; network-deny; schema/failure injection; external-call count zero |
| ADR-0008 | local images/config; health/readiness; non-root container; env schema; no external provisioning |
| ADR-0009 | correlation propagation; log allowlist/canaries; metrics; audit immutability/atomicity |
| ADR-0010 | route/UI/storage inventory proves export/share absent |

## Method, data, privacy, and threat proof

| Requirement | Proof |
|---|---|
| Output kinds cannot blur | schema enums; compile-time UI exhaustiveness; snapshot copy; unknown-kind fail-closed test |
| Demo values estimate nobody | immutable semantic v2 fixture manifest/full checksum; result limitations; forbidden-claim scan; E2E comprehension copy |
| Determinism | `test_deterministic_mock.py`: 100 subprocess outputs equal committed SHA-256 golden `14c1be5ba973cd24e819468176ed5f9b605b2110ff25fb8f2c29e9eba7c51dc0` |
| No predictive threshold/claim | prohibited output kinds rejected; copy scan for banned terms; independent method review |
| Provenance complete | schema-required frozen fields including exact code release/configuration hashes; database equality checks; E2E provenance view |
| No unapproved data/provider | seed inventory; egress denial; dependency/config route inventory |
| Privacy/deletion | `PRIV-DEL-001`; forbidden-field log tests; non-production retention configuration |
| Threats T-01–T-13 | evidence named in [[../Security/CONTROL_TEST_MATRIX|Security Control and Test Matrix]] |
| Rate/resource/backpressure | `SEC-LIMIT-001`, `LOAD-RATE-001`, `INT-BACKPRESSURE-001`, `INT-WORKER-LIMIT-001`, `E2E-POLL-001` against [[../Architecture/RESOURCE_LIMITS|approved limits]] |

## CI gate order

1. Repository policy/frontmatter/link/forbidden-claim checks.
2. Exact runtime and lockfile install; generated artifact drift.
3. Format, lint, static type, unit, schema, and contract tests.
4. Supabase reset, lint, pgTAP/RLS/migration tests, generated DB type drift.
5. API/worker integration including queue fault cases.
6. Web component/accessibility tests.
7. Playwright critical path and failure states.
8. npm/Python/secret/dependency/container security checks.

Any Critical control, tenant isolation, migration, contract, deterministic fixture, or critical E2E failure blocks merge. Flaky retry is not a pass.
