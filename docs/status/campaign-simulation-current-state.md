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
  bound to `20260802063625_campaign_lab_api_wrappers` after the Campaign Lab API
  security-wrapper correction.
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
- FastAPI `/api/v1/campaign-lab/...` routes now cover campaign state, typed
  research/cohort/variant/interview artifacts, durable simulations, status,
  progress events, cancellation, cloning, survey intake, calibration, historical
  backtest intake, compliance review, audit, and reports.
- Supabase migrations `20260802060315_campaign_simulation_lab` and
  `20260802063625_campaign_lab_api_wrappers` are applied to project
  `ywiwmczccktwzqyhzhiz`. Campaign Lab campaign, artifact, run, event, and
  worker-secret relations have forced RLS; command and worker functions are
  least-privilege and lease-bound.
- The worker now claims Campaign Lab runs from PostgreSQL, persists progress,
  retries bounded failures, finalizes cancellation, and keeps raw survey rows
  and held-out outcomes in the worker-only secret envelope.
- The web project workspace now exposes Campaign Simulation Lab as a primary
  navigation destination with an end-to-end campaign setup, aggregate request
  editor, durable run polling, evidence-stage disclosure, and report boundary.
- Verification completed locally: core focused tests 9/9, API tests 77/77,
  worker tests 90/90, web tests 141/141, web typecheck/lint, Python compile, and
  focused Ruff checks. Hosted Supabase migration/RLS/function checks and
  security advisor review also completed.

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

- Lawfully admitted Philippine survey and historical campaign datasets. The
  adapters and evaluators are functional, but no real dataset is attached to
  this release, so no validity or accuracy claim is permitted.
- Lawfully admitted Philippine survey and historical campaign datasets.
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
