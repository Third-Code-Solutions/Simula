---
title: Campaign Lab Survey Workflow UX ExecPlan
status: active
created: 2026-08-22
owner: Principal program and engineering lead
classification: PROPOSED
source_of_truth: true
---

# Campaign Lab Survey Workflow UX

## User outcome

An editor can add consented survey evidence and compare it with a completed
message test without reading, editing, or understanding JSON. The route makes
the next required action, privacy boundary, and readiness of each step clear.

## Scope

- Replace default raw-JSON survey import, native-form, response-batch, and
  calibration controls in the Campaign Lab route with structured controls.
- Compose the existing, validated API payloads in the browser; do not alter
  API contracts, storage, worker behavior, authorization, or policy checks.
- Replace raw calibration output with a concise, accessible result summary.
- Add focused UI coverage and browser verification at desktop and mobile sizes.

## Non-goals

- No new survey provider integration, database migration, production data
  import, hosted deployment, or change to aggregate-only policy.
- No claim that a comparison is a survey replacement, population estimate, or
  predictive proof.

## Acceptance criteria

- The default survey and calibration route shows no JSON editor or raw result.
- An editor can provide source metadata, import a supported file, create a
  native aggregate form, upload a native response batch, and start a ready
  comparison through plain-language controls.
- Field mappings and support details remain available only as collapsed,
  clearly labeled advanced controls.
- Loading, disabled, empty, failure, keyboard, and responsive states remain
  understandable and preserve existing authorization behavior.

## Delivery slices

1. Model the current API payloads as structured client-side form state.
2. Redesign the survey and comparison sections around a three-step workflow.
3. Add focused tests, type/lint checks, and real-browser visual/accessibility
   evidence; update project memory with the actual outcome.

## Risks and rollback

- Field composition could drift from the strict API schema. Mitigation: reuse
  existing payload shapes, run type/lint/unit checks, and retain the API's
  server-side validation as the authority.
- A responsive workflow may obscure prerequisite state. Mitigation: test the
  no-test/no-survey state and inspect desktop/mobile renderings.
- Rollback is a single web-route source revert; no persisted schema or data is
  changed by this work.

## Stop condition

Stop after the route meets the acceptance criteria, focused verification is
reported with evidence, and no additional user-facing JSON is exposed in the
survey/comparison flow.

## Execution record — 2026-08-23

- Complete: structured survey source metadata and field mapping, native survey
  form creation, native answer-batch upload, automatic comparison readiness,
  and human-readable import/comparison summaries.
- Complete: default Campaign Lab technical editors and raw result records are
  collapsed behind explicit specialist/support disclosures.
- PASS: focused `navigation.test.tsx` (5/5, Vitest threads), direct web
  TypeScript, changed-file ESLint, `git diff --check`, and a direct production
  Next build.
- NOT RUN: authenticated real-browser, Axe, keyboard, console/network, and
  human assistive-technology checks for this exact revision; the local browser
  control service was unavailable. This plan remains active until that visual
  verification is recorded.
