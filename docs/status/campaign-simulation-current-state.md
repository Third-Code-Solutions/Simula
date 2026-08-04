---
title: Campaign Simulation Lab current state
status: active
updated: 2026-08-04
classification: OBSERVED
---

# Current state

## Completed in this turn

- The release implementation was verified at
  `5e7d55c8a22ef7cd4a7aca74270dd38f23a4dc69`
  (`fix(worker): restore campaign lab startup`) before this status update. The
  worker import/startup syntax defect was corrected without changing the
  campaign methodology contract.

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
- Survey imports now run through the same durable worker queue as calibration
  and backtesting. Public requests retain only format/field-map metadata; raw
  CSV/Formbricks/ODK/generic JSON payloads stay in the worker-only secret
  envelope, are normalized in memory, and are deleted after aggregate output
  completion. The hosted registry recorded this forward-only migration as
  `20260802150729` under `campaign_lab_survey_import_workflow`; the later
  retention migration advances the compiled runtime head to `20260803100000`.
- Persona interviews, compliance reviews, and report generation now use the same
  durable leased run queue, with run-status endpoints and aggregate evidence
  binding. Behavioral diagnostics persist repetition, round, topology, exposure,
  action, logical action timestamps, memory, event evidence, provider usage,
  token/cost receipts, and synthetic-agent disclosure.
- Research ingestion now produces a bounded, deterministic knowledge graph with
  entities, relationships, source-chunk citations, claim grounding,
  conflicting-source detection, source-freshness metadata, and bounded lexical
  source-excerpt retrieval. Knowledge graph records are source-bound and reject
  raw documents or respondent rows when attached to a simulation request.
- Structured persona behavioral dimensions now carry the same explicit
  `Synthetic` provenance label as demographic, language, media, and issue
  attributes. Synthetic interviews record admitted research source/citation IDs
  alongside action and memory evidence.
- Survey calibration results now carry calibration/model versions and aggregate
  survey sample size. Version history and deterministic calibration drift
  monitoring use the documented `calibration_drift_thresholds_v1` contract;
  missing comparison history remains `unavailable` rather than being inferred.
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
  and preserves the published API contract.
- Supabase migration SQL
  `20260802150000_campaign_lab_survey_import_workflow.sql` is applied to the
  same project; its hosted registry version is `20260802150729`. The v3
  entrypoints are least-privilege replacements for the survey-import-capable run
  admission/completion/readiness path, bound to the then-current compiled
  `20260802150000` head. The forward-only retention migration
  `20260803100000_campaign_lab_retention_cleanup.sql` is also applied; the
  hosted registry assigned `20260803020312`, while the logical runtime head is
  `20260803100000`. Campaign Lab artifacts and runs now require 90-day retention
  deadlines, terminal rows have indexed worker cleanup policies, and cleanup
  audits before deletion.
- The worker now claims Campaign Lab runs from PostgreSQL, persists progress,
  retries bounded failures, finalizes cancellation, and keeps raw survey rows
  and held-out outcomes in the worker-only secret envelope.
- The web project workspace now exposes Campaign Simulation Lab as a primary
  navigation destination with a permanently visible 14-item Campaign Lab
  sidebar, end-to-end campaign setup, research-file upload with provenance
  metadata, worker-backed ingestion status polling, aggregate request editor,
  durable run polling, evidence-stage disclosure, and report boundary. The
  sidebar destinations now land on campaign-scoped cohort, message, simulation,
  interview, survey import, calibration, backtest, compliance, report, and audit
  surfaces; report approval is bound to a succeeded compliance review and named
  human reviewer. Evidence results expose survey/backtest component metrics and
  cohort slices in the UI.
- The connected Vercel `simula` and `simula-admin` projects use app-scoped
  ignored-build commands. The latest worker-only commit was cloned and then
  canceled at the ignored-build step before `vercel build`, preventing a full
  web/admin build for unrelated worker changes. Production promotion and an
  account-level spend cap remain unverified because the connected billing
  session is not authorized for the `pavi` team.
- Verification completed locally at `5e7d55c`: pinned `pnpm check` is green,
  including 475 Python tests with 2 skips, API/web/admin JavaScript suites, type
  checks, builds, contract generation/checks, formatting, lint, and the
  secret/forbidden-claim gates. The two skips are expected POSIX-only runtime
  checks. No manual Vercel deployment or retry was initiated for this audit.

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
  after the GitHub release is promoted; protected Vercel previews have not been
  browser-verified from this task.
- A current GitHub-to-Railway deployment event for this release branch. Railway
  CLI access now resolves the requested project and shows the API/worker GitHub
  source bound to `Third-Code-Solutions/Simula` on production `main`; production
  still serves release `4b37e1f8af7e4c377c8b44eca0c53e36345cb56c`, with
  `/health/live` 200 and `/health/ready` 503, because the release branch is not
  merged to `main`.
- The latest GitHub Actions PR run (`30908915269`) failed all required gates
  before runner steps were created; GitHub returned no job logs. The external
  account payment/spending-limit gate must be repaired before CI can provide a
  green merge signal.
- Hosted Campaign Lab retention/runtime objects and API/worker grants are
  present. The hosted migration registry uses apply-time versions
  `20260802131842`, `20260802150729`, and `20260803020312` for the equivalent
  durable-workflow/survey/retention changes, while local files retain logical
  names `20260802143000`, `20260802150000`, and `20260803100000`; no duplicate
  DDL was applied during this audit.
- The hosted `database_foundation.test.sql` transaction currently reports 30/35:
  the five remaining failures are environment-specific local bootstrap
  assumptions (provider-managed runtime-role passwords, hosted owner-role
  membership shape, absent authored Auth fixtures, and absent local seed
  fixtures). Hosted Campaign Lab migration/function/grant checks remain
  separately verified; these fixtures must not be copied into production.

## Truth boundary

SIMULA is not authorized to claim population prediction, survey replacement,
vote-share prediction, universal accuracy, or Predikta-equivalent capability.
The current deterministic fixture and authored tests remain experimental and
estimate nobody. Survey calibration and historical backtesting are now durable
evaluation jobs, but no real Philippine survey or historical outcome dataset is
attached here; hosted verification and lawful data admission remain required
before any validity claim.
