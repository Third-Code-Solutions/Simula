---
title: Phase 2 Product Acceptance Criteria
status: approved
created: 2026-07-17
updated: 2026-07-17
owner: Product and QA leads
classification: PROPOSED
source_of_truth: true
---

# Phase 2 Product Acceptance Criteria

## Decision boundary

These criteria authorize an experimental walking skeleton. They do not validate demand, predictive accuracy, representativeness, or production fitness.

Primary prototype user: a brand or agency strategist pressure-testing text before human research. Primary job: identify wording worth revising or testing with people before committing fieldwork or media spend.

Public product and research evidence supports the problem shape (E-1001, E-1003, E-1008, E-1013, E-1016). It does not establish customer demand for SIMULA. Human evidence remains `UNKNOWN` and is governed by [[USER_DISCOVERY_PLAN|User Discovery Plan]].

## Phase 2 slice

Sign in → organization → project → immutable text stimulus version → authored demo audience → idempotent asynchronous mock run → typed demo result → provenance and limitations.

## Behavioral acceptance

| ID | Given | When | Then | Required proof |
|---|---|---|---|---|
| AC-AUTH-001 | A signed-out visitor | They open a protected route | They are sent to sign-in and no tenant data is returned | E2E plus API `401` test |
| AC-AUTH-002 | A valid session | Its token expires or refreshes | The session refreshes or fails closed; authorization is rechecked at the API | E2E plus API auth tests |
| AC-ORG-001 | A signed-in user has no organization | They create one with a valid name and idempotency key | Organization, sole owner membership, and create audit event commit atomically; replay returns the same organization | Database-command/API/concurrency/E2E tests |
| AC-ORG-002 | A user belongs to one or more organizations | They list organizations | Only their memberships are returned with current role; a foreign organization is absent | API/RLS/E2E tests |
| AC-TEN-001 | User A belongs only to Organization A | They request any Organization B object by identifier | API and database deny it without disclosing object contents | Cross-tenant API/RLS matrix |
| AC-TEN-002 | A viewer lacks write role | They attempt project, stimulus, run, or cancel mutation | The operation returns `403`; domain state is unchanged; a safe denied-action audit event may be appended | API/RLS test |
| AC-PROJ-001 | An authorized member | They create a project with valid name, objective, market, language, and category | One tenant-owned project is created and visible to that organization | API integration and E2E |
| AC-PROJ-002 | A project exists | The user saves changed stimulus text | A new immutable stimulus version is created; prior versions remain unchanged | Database and API test |
| AC-AUD-001 | The Phase 2 demo audience is listed | The user inspects it | The UI and API show `authored_demo`, version, checksum, non-representative status, and limitations | Contract and E2E |
| AC-RUN-001 | A valid frozen configuration | The user submits a run with an idempotency key | Exactly one run is created and queued; replay returns the same run | API, database, and worker tests |
| AC-RUN-002 | A run is queued | The deterministic mock worker processes it | State follows an allowed transition and one terminal result is committed | State-machine integration test |
| AC-RUN-003 | A lease expires or a message is delivered again | Another worker attempt receives the same run | Terminal side effects remain single; duplicate work is safely discarded or resumed | Duplicate-delivery test |
| AC-RUN-004 | A queued or running run is cancelable | An authorized user requests cancellation | If cancel CAS wins, API returns `202 cancel_requested` and worker commits `canceled`; if terminal commit won first, API returns `200` with existing `succeeded`; no result is deleted/relabelled | API/worker race/E2E tests |
| AC-RUN-005 | A transient failure occurs | Retry budget remains | State and attempt history show bounded retry/backoff; no provider or method silently changes | Worker integration test |
| AC-RUN-006 | Retry budget is exhausted or failure is permanent | Processing stops | State becomes terminal `failed` with safe user guidance and correlation ID | Worker and E2E test |
| AC-RES-001 | A mock run succeeds | The user opens its result | Every output has an explicit kind; mock values say they estimate nobody | Schema and E2E test |
| AC-RES-002 | Provenance is requested | The user opens the method/provenance view | Frozen stimulus, audience, method, provider, config, code, seed, timestamps, and limits are visible without secrets | Contract and E2E |
| AC-RES-003 | A slice is absent, unsupported, or suppressed | Results render | The condition is explicit; no zero, invented value, or hidden omission substitutes for it | Unit and visual test |
| AC-ERR-001 | Validation, auth, conflict, quota, or processing fails | The client receives the error | It renders a safe RFC 9457 problem, recovery action where possible, and correlation ID | Contract and E2E |
| AC-A11Y-001 | A keyboard-only user | They complete the critical slice | Focus is visible/unobscured; controls, errors, status, and results are programmatically named | Playwright/axe plus manual keyboard review |
| AC-A11Y-002 | A chart-like result is shown | It renders | An equivalent table/text representation exists and meaning does not depend on color | Component and manual review |

## Product thresholds

Phase 2 engineering gate:

- `100%` pass for the critical-path E2E and contract suite.
- `0` successful cross-tenant operations in the adversarial RLS/API matrix.
- `1` durable run and `1` terminal result after at least `20` concurrent replays of one idempotency key.
- Deterministic mock result available within `10 seconds` at local/CI p95 over `30` runs; this is a test budget, not a production SLO.
- `0` serious or critical automated accessibility findings on the critical path; manual keyboard review passes.
- Mock provider cost is exactly `0`; real-provider egress is disabled.

Human comprehension gate before Phase 6 staging acceptance:

- At least five participants matching the primary-user hypothesis attempt the scripted task.
- At least four of five complete first run without operator correction.
- All five correctly state that demo output is not measured opinion and not representative.
- At least four of five find provenance/limitations within one minute.
- Any participant interpreting generated text as a human quotation is a blocking defect.

These are prespecified prototype thresholds, not market-validation statistics.

## Forbidden claims

The product, fixtures, tests, demo, documentation, and release notes must not say or imply:

- representative of Filipinos or any real population;
- survey, focus-group, panel, or fieldwork replacement;
- predictive accuracy, calibration, confidence interval, or margin of error;
- real participant, quote, respondent, or observed behavior;
- legal compliance or safe use outside the approved experimental scope.

## Exit decision

`APPROVED FOR PHASE 2 EXPERIMENTAL PROTOTYPE`. User demand remains unvalidated. Production and external-provider use remain blocked.
