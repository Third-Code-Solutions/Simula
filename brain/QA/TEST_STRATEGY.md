---
title: SIMULA Test Strategy
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-17
owner: QA lead
classification: PROPOSED
source_of_truth: true
---

# SIMULA Test Strategy

> Phase 1 approved quality system. Exact requirement/threat/decision mapping: [[TRACEABILITY_MATRIX|Phase 2 Traceability Matrix]].

## Test layers

- Unit tests for validation, authorization helpers, weighting/scoring, state transitions, and transformations.
- API integration and OpenAPI/JSON Schema contract tests.
- Supabase migration, constraint, RLS, and cross-tenant adversarial tests.
- Worker idempotency, retry, timeout, cancellation, dead-letter, and recovery tests.
- Provider adapter conformance with deterministic mocks and recorded safe fixtures.
- End-to-end tests for critical journeys and failure/degraded states.
- Accessibility checks plus keyboard/screen-reader/manual review.
- Load, quota, rate-limit, denial-of-wallet, and backpressure tests.
- Security tests for authentication, tenant isolation, uploads, prompt injection, exports, secrets, and dependencies.
- Simulation evaluation and prompt/model/data/method regression suite.
- Backup/restore and incident exercise verification.

## CI quality gate

Material lint, formatting, type, unit, integration, contract, migration, RLS, security, or evaluation-regression failures block promotion. Flaky tests are defects, not ignored success.

Planned commands are root-orchestrated and non-interactive: pnpm format/lint/type/unit/contract/E2E tasks; uv Ruff/mypy/pytest/audit tasks; pinned Supabase reset/lint/test/type generation; secret/dependency/container scans. Phase 2 scaffold must expose one `verify` task that runs the same gates as CI.

## Test data

Use authored synthetic fixtures or rights-approved benchmark data. Never copy production personal data into test, preview, or developer environments.

## Traceability

Every feature acceptance criterion maps to tests; every threat maps to prevention/detection tests; every methodology claim maps to evaluation evidence.

## Phase 0 validation

- Required-file/frontmatter audit.
- Evidence classification and citation audit.
- Contradiction and unsupported-claim review.
- No-code inventory.

## Phase 1 output

- Approved product thresholds: [[../Product/ACCEPTANCE_CRITERIA|Acceptance Criteria]].
- Ordered vertical implementation: [[PHASE_2_BACKLOG|Phase 2 Backlog]].
- Security evidence: [[../Security/CONTROL_TEST_MATRIX|Control/Test Matrix]].
