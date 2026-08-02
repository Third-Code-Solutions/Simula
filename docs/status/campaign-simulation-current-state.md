---
title: Campaign Simulation Lab current state
status: active
updated: 2026-08-02
classification: OBSERVED
---

# Current state

## Completed in this turn

- PhantomCrowd reference cloned at the stated upstream commit and inspected.
- SIMULA architecture, data, worker, provider, auth/tenant, queue, deployment,
  and CI boundaries inspected.
- Pre-implementation integration audit completed.
- MIT license register and provenance record created.
- Population-weighted repeated simulation core added with derived seeds,
  component summaries, run-stability intervals, and variant rank stability.
- Aggregate consented-survey calibration core added with weighted distribution,
  MAE/RMSE/Brier, and rank-agreement metrics.
- Held-out blind historical backtesting core added with leakage checks,
  ranking/error metrics, and baseline regression deltas.
- Methodology formulas and evidence boundaries documented.
- Repeated seeded execution wired through the authenticated methodology command
  and private AI-engine path; the existing tenant-scoped report artifact now
  persists the repeated result and exposes database-indexed stability metadata.
- Supabase migration `20260801111007_campaign_simulation_report_evidence` was
  applied to the linked project and verified with migration, column, trigger,
  and schema-lint queries.
- Durable `campaign_evidence_runs`, private held-out secret storage, progress
  events, tenant-scoped RLS, lease/retry/cancel state, and worker audit hooks
  were added in migrations `20260801121240_campaign_lab_evidence_jobs`,
  `20260801124952_campaign_lab_evidence_cancel_finalize`, and
  `20260801135222_campaign_lab_runtime_head`, applied to Supabase project
  `ywiwmczccktwzqyhzhiz`.
- The visual-profile command now has the required asset foreign-key privilege
  through `20260801150000_m6_visual_profile_fk_privilege`; runtime admission is
  bound to the then-current `20260802063625_campaign_lab_api_wrappers` after the
  Campaign Lab API security-wrapper correction; the durable-workflow head below
  supersedes that runtime binding.
- Authenticated NestJS v2 survey-calibration and historical-backtest commands,
  idempotency, status/events/cancel reads, OpenAPI, and a native Evidence Lab UI
  were added. The worker now claims and evaluates these durable jobs with the
  deterministic core; held-out outcomes are never returned by the read API.
- Project-scoped outcome references, per-run `retention_until` metadata, bounded
  retention deletion, and retention audit events were added in migration
  `20260801150001_campaign_lab_runtime_head`.
- Aggregate-only CSV, Formbricks, ODK, and generic JSON adapters now normalize
  external response exports in memory with duplicate, bot, low-quality,
  malformed, consent, rights, and prohibited-field controls. Respondent rows are
  not persisted.
- Native bounded Campaign Simulation Lab core now composes the population frame,
  deterministic weighted sampling, repeated seeded runs, structured synthetic
  personas, disclosed interviews, compliance review, and a 30-section report
  contract. No `viral_score` field or LLM final score exists.
- Repeated Campaign Lab results now include per-cell component rankings bound to
  each sampled cohort's frozen dimensions and population weight, so aggregate
  results do not hide cohort differences. These findings remain explicitly
  synthetic diagnostics, not survey estimates or vote-share forecasts.
- Historical backtests now persist a version-2 result with explicit
  campaign/cohort/variant keys, declared cohort weights, weighted campaign
  aggregates, and per-cohort component slices. The durable outcome schema's
  `subgroup_key` is accepted as a compatibility alias.
- Human-reviewed English, Filipino, and Taglish cultural evaluation suites now
  have a versioned core contract, focused tests, a durable Campaign Lab artifact
  route, and an optional report attachment field. Regional languages remain
  disabled until an admitted evaluation dataset exists.
- Campaign update and simulation-cancellation commands now persist replay-safe
  idempotency receipts. Explicit `Idempotency-Key` headers are supported, with a
  deterministic request-derived fallback for legacy callers. The change is in
  `20260802105930_campaign_lab_mutation_idempotency`, applied to
  `ywiwmczccktwzqyhzhiz`; its compatibility entrypoints remain available while
  the current runtime binding is the durable-workflow head below.
- FastAPI `/api/v1/campaign-lab/...` routes now cover campaign state, typed
  research/cohort/variant/interview artifacts, durable simulations, status,
  progress events, cancellation, cloning, survey intake, calibration, historical
  backtest intake, compliance review, audit, and reports.
- Research ingestion now runs as a bounded, provenance-first worker job for
  text, Markdown, CSV, JSON, DOCX, and text-bearing PDF inputs; scanned PDFs
  fail closed with an OCR-required state instead of inventing extracted text.
- Persona interviews, compliance reviews, and report generation now use the same
  durable leased run queue, with run-status endpoints and aggregate evidence
  binding. Behavioral diagnostics persist repetition, round, topology, exposure,
  action, memory, and event evidence for synthetic-agent disclosure.
- Supabase migrations `20260802060315_campaign_simulation_lab` and
  `20260802063625_campaign_lab_api_wrappers` plus
  `20260802090954_campaign_lab_cultural_evaluation` are applied to project
  `ywiwmczccktwzqyhzhiz`. Campaign Lab campaign, artifact, run, event, and
  worker-secret relations have forced RLS; command and worker functions are
  least-privilege and lease-bound.
- Supabase migration SQL `20260802143000_campaign_lab_durable_workflows.sql` is
  applied to `ywiwmczccktwzqyhzhiz`; the hosted migration registry assigned
  apply-time version `20260802131842` under the name
  `campaign_lab_durable_workflows`. Because the hosted command/worker functions
  are owned by dedicated database roles, the migration adds owned v2 entrypoints
  and preserves the published API contract while binding runtime
  readiness/observability to the compiled `20260802143000` head.
- The worker now claims Campaign Lab runs from PostgreSQL, persists progress,
  retries bounded failures, finalizes cancellation, and keeps raw survey rows
  and held-out outcomes in the worker-only secret envelope.
- The web project workspace now exposes Campaign Simulation Lab as a primary
  navigation destination with a permanently visible 14-item Campaign Lab
  sidebar, end-to-end campaign setup, aggregate request editor, durable run
  polling, evidence-stage disclosure, and report boundary. Evidence results
  expose survey/backtest component metrics and cohort slices in the UI.
- Verification completed locally: Python/API/worker suites 365/365, mypy 152/152
  files, full Ruff, generated-contract drift, web workspace navigation tests
  4/4, admin tests 2/2, web/admin/API production builds, TypeScript
  lint/typecheck tasks, and contract tests 7/7. Full API/web Jest/Vitest runs
  exceeded the bounded test timeout without a failure report; they are not
  counted as passing. The repository `uv run --frozen` wrapper remains
  environment-blocked by installed UV `0.12.0` versus required `0.11.19`; direct
  project-interpreter Ruff and mypy checks pass.

## Implemented before this turn

- Versioned population frames with source provenance and normalized cell
  weights.
- Deterministic weighted audience sampling and sparse-cell suppression.
- Private behavioral engine with weighted synthetic agents, deterministic
  provider fixtures, replayable action events, bounded memory, typed heuristic
  component metrics, and synthetic-agent disclosure.
- Durable run/attempt/lease/result/audit infrastructure and tenant-scoped RLS.
- Held-out benchmark registry/evaluation primitives.

## Not yet verified or supplied

- Lawfully admitted Philippine survey and historical campaign datasets.
- The non-deterministic provider adapters are contract-level only; the first
  deployable worker release intentionally admits the deterministic provider.
- End-to-end hosted authenticated browser/API/worker evidence for the new routes
  after the GitHub release is promoted.
- Railway project authorization and an observed GitHub-to-Railway deployment
  event; the currently logged-in Railway account is not authorized for the
  requested project.

## Truth boundary

SIMULA is not authorized to claim population prediction, survey replacement,
vote-share prediction, universal accuracy, or Predikta-equivalent capability.
The current deterministic fixture and authored tests remain experimental and
estimate nobody. Survey calibration and historical backtesting are now durable
evaluation jobs, but no real Philippine survey or historical outcome dataset is
attached here; hosted verification and lawful data admission remain required
before any validity claim.
