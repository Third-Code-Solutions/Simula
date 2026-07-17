---
title: SIMULA User Journeys
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-17
owner: Product and design leads
classification: PROPOSED
source_of_truth: true
---

# SIMULA User Journeys

## Primary journey

1. User signs in and creates or joins an organization.
2. User creates a project with objective, category, market, language, and context.
3. User enters one or more text stimulus versions; system preserves version history.
4. User selects an authored demo or approved audience and sees source, version, coverage, status, and limits.
5. User reviews frozen configuration, experimental status, output types, and cost/resource expectation.
6. System authorizes, validates, idempotently creates, and queues a run.
7. User sees accessible queued/running/retrying/failure/cancel states and correlation reference.
8. User inspects distributions, disagreement, unsupported slices, stability/uncertainty, qualitative rationales, provenance, and limitations.
9. User compares only compatible variants and sees material configuration differences.
10. Authorized user exports/shares within approved scope and audit controls.
11. User later attaches real outcomes separately; predictions remain immutable.

## Phase 2 vertical slice

Authentication → organization → project → text stimulus → one demo audience → async mock job → one structured result → provenance/limitations → Playwright E2E.

Exact Given/When/Then behavior: [[ACCEPTANCE_CRITERIA|Phase 2 Product Acceptance Criteria]].

## Required states

- Empty, loading, validation error, unauthenticated, unauthorized, rate/quota limited.
- Queued, delayed, running, retrying, cancel requested, canceled, succeeded, terminal failed.
- Partial provider failure without partial result publication.
- Unsupported language/audience/method and suppressed small segment.
- Stale client/session and version conflict.

## Trust requirements

- Validation badge adjacent to headline metric.
- Plain statement of what output is and is not.
- No unsupported decimal precision.
- Generated rationale marked synthetic; no quotation marks implying a participant.
- Source/data/method/model/config versions accessible in one action.
- Explanation of missing or suppressed segments.
- Real outcome visibly separate from prediction.
- Transparency, explanation, and interpretation tailored to user role (E-4012).

## Accessibility acceptance direction

Target WCAG 2.2 AA for complete critical processes (E-4010):

- Keyboard-only completion with visible/unobscured focus.
- Semantic controls, programmatic labels/names/states, and adequate target size.
- Text error identification and correction guidance.
- Programmatically announced queue/progress/error/success status.
- Accessible authentication; no cognitive-test-only login.
- Review/confirm/correct before destructive or consequential submission.
- Charts have text/table alternatives and do not rely on color alone.
- English/Filipino/Taglish content uses correct language metadata when supported.

## Research plan

No repository evidence shows completed interviews. [[USER_DISCOVERY_PLAN|User Discovery Plan]] prespecifies recruitment, instrument, falsifiers, and staging decision rules. Hypotheses do not become facts without recorded evidence.
