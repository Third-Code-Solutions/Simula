---
title: PhantomCrowd to SIMULA Campaign Simulation Integration Audit
status: completed
created: 2026-08-01
updated: 2026-08-01
owner: SIMULA engineering and methodology leads
classification: OBSERVED
---

# Executive decision

PhantomCrowd is a useful MIT-licensed product decomposition, not a scientific or
production implementation to merge. SIMULA already has the safer native
boundaries needed for a campaign-simulation vertical: PostgreSQL/Supabase
tenancy and RLS, durable run state, Redis queue transport, a private Python
engine, versioned population frames, deterministic weighted sampling, typed
synthetic outputs, and held-out evaluation scaffolding.

The integration must therefore be additive and staged. PhantomCrowd's
LLM-generated `viral_score` is rejected completely. SIMULA's numerical path must
be based on population weights and named component metrics, repeated seeded
runs, consented survey calibration, and held-out historical backtesting.
Qualitative LLM output may explain typed evidence; it may not calculate or
override the final numerical result.

This audit is the required pre-implementation gate. No PhantomCrowd code has
been copied into SIMULA.

## 1. SIMULA architecture discovered

| Boundary             | Current implementation                                                                                                 | Integration consequence                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Web                  | `apps/web`, Next.js 16, React 19, existing SIMULA design system                                                        | Extend existing workspaces; do not add Vue or a second frontend.                                     |
| Public control plane | `apps/api`, NestJS 11, versioned `/api/v2`, strict DTOs, auth, rate limits, OpenAPI                                    | New campaign-lab commands belong here when durable product routes are added.                         |
| Existing Python API  | `services/api`, FastAPI, Supabase-backed routes and Phase 3/4 methodology/report routes                                | Reuse existing methodology registry and tenant-scoped read patterns.                                 |
| Private execution    | `services/ai-engine`, authenticated private FastAPI boundary                                                           | Execute bounded simulations/calibration/backtests asynchronously; no public direct engine access.    |
| Shared methodology   | `packages/simula-core`, Pydantic 2 models, deterministic weighted cohort sampler, typed aggregators, behavioral engine | Add repeat/calibration/backtest primitives here; keep provider and scoring boundaries explicit.      |
| Worker               | `services/worker`, Python worker with durable run leases and BullMQ/ARQ transport                                      | Long work remains worker-owned; queue payloads carry identifiers and frozen versions only.           |
| Data                 | Supabase PostgreSQL, `api` and `private` schemas, forward-only migrations, forced RLS                                  | Add bounded tables/functions with organization-scoped foreign keys and immutable terminal artifacts. |
| Cache/transport      | Redis plus BullMQ/ARQ transport depending on release mode                                                              | Never use process-local progress as authoritative state.                                             |
| Storage              | Supabase/S3-shaped private object storage                                                                              | Keep survey files, research, creative assets, and reports private and provenance-bound.              |
| Contracts            | `packages/contracts`, generated OpenAPI/database contracts and JSON schemas                                            | Generate and check contracts after API changes; do not hand-edit generated output.                   |

Existing SIMULA methodology already provides:

- versioned population frames and source provenance;
- largest-remainder weighted cohort sampling with sparse-cell suppression;
- population and audience weights on every sampled cell;
- deterministic provider adapters and cost/deadline checks;
- weighted aggregate distributions, metrics, risks, effective sample size, and
  uncertainty components;
- a governed held-out evaluation harness with MAE, Brier score, subgroup slices,
  checksums, and promotion disabled by default;
- a separate behavioral engine with weighted synthetic agents, replayable
  rounds, typed heuristic outputs, and synthetic-agent disclosure;
- durable tenant-scoped run artifacts, result normalization, audit history, and
  cross-tenant denial controls.

Current gaps relevant to this request:

- one methodology or behavioral run at a time; no first-class repeated-run
  summary with confidence intervals or rank stability;
- no consented survey aggregate import/calibration contract or calibration
  status in a campaign result;
- no blind historical campaign replay and post-reveal ranking comparison;
- current evaluation schemas are benchmark registries, not the complete survey
  calibration/backtesting workflow;
- the current durable behavioral command is still named and constrained as a
  demo run in worker/database admission paths;
- no production admission exists for real population data, human survey data, or
  outcome backtests.

## 2A. Implementation follow-through (2026-08-02)

The bounded implementation now closes the Campaign Simulation Lab slice without
changing the above architecture decision:

- `packages/simula-core/src/simula_core/campaign_lab.py` composes the existing
  population frame, deterministic weighted sampler, repeated methodology engine,
  structured persona contract, disclosure, compliance review, and 30-section
  report. It has no `viral_score` output.
- `services/api/src/simula_api/campaign_lab_routes.py` exposes the authenticated
  `/api/v1/campaign-lab/...` campaign, artifact, run, evidence, audit, and
  report routes through the existing tenant/RLS database gateway.
- `services/worker/src/simula_worker/campaign_lab.py` and the worker database
  capability provide durable leases, progress, retries, cancellation, and
  worker-only survey/outcome secret handling.
- `apps/web/src/app/projects/[projectId]/campaign-lab/` adds the native Campaign
  Simulation Lab workflow and evidence disclosures to primary project
  navigation.
- `supabase/migrations/20260802060315_campaign_simulation_lab.sql` adds the
  bounded tenant schema and forced-RLS capabilities. The migration is applied to
  project `ywiwmczccktwzqyhzhiz` and recorded by the provider as
  `20260802060315`.
- `supabase/migrations/20260802063625_campaign_lab_api_wrappers.sql` moves the
  command implementations behind private security-definer functions and restores
  invoker-only `api.*` wrappers; hosted readiness now binds to `20260802063625`.
- `supabase/migrations/20260802105930_campaign_lab_mutation_idempotency.sql`
  adds tenant-scoped replay receipts to campaign updates and simulation
  cancellation, removes the old callable signatures, and binds hosted runtime
  readiness/observability to `20260802105930`.

The remaining gaps are evidence and release gates, not permission to treat
synthetic output as measured public opinion: no real Philippine survey or
historical dataset is bundled, external provider adapters remain disabled for
the first deployable slice, and Railway access still needs correction.

## 2. PhantomCrowd architecture discovered

Inspected upstream repository:

- URL: `https://github.com/l2dnjsrud/PhantomCrowd`
- inspected commit: `4f197a8df0de5183f2376a210f42aaf948bd9b0a`
- backend: FastAPI, SQLAlchemy, SQLite, Python;
- frontend: Vue 3, Vite, Pinia, D3, ECharts;
- context: LightRAG/NetworkX and embedding-oriented knowledge graph;
- agents: camel-ai LLM agents plus rule-based agents;
- transport/state: process-local background tasks and in-memory progress/state;
- provider: OpenAI-compatible/Ollama-oriented configuration;
- license: MIT, copyright (c) 2026 PhantomCrowd.

Inspected source areas included `README.md`, `LICENSE`, backend manifests,
SQLAlchemy models, FastAPI campaign/simulation/A-B/export routes, the quick
simulation engine, `simulation_v2` engine/profile/config/memory modules,
knowledge services, report tools/agent, frontend views/components/store, tests,
`scripts/backtest.py`, and `docs/validation-report.md`.

## 3. Capability reuse/adaptation map

| PhantomCrowd capability                       | Decision                                | Reason                                                                                                                                      |
| --------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign intake and variant comparison        | Adapt natively                          | SIMULA already has projects, stimuli, variants, frozen configurations, and comparison routes.                                               |
| Knowledge graph/context grounding             | Adapt with SIMULA provenance            | Reuse the decomposition; use SIMULA's governed context graph and pgvector authorization instead of LightRAG/SQLite state.                   |
| LLM/rule tiering                              | Adapt with attribution at concept level | Keep provider-neutral interfaces, seeded rule behavior, cost limits, and private execution. Do not import camel-ai or its dependency graph. |
| Round-based agent interaction and crowd pulse | Rewrite natively                        | SIMULA already has replayable action events and typed pulse aggregation; preserve the concept, not the code/state model.                    |
| Agent memory and interviews                   | Adapt natively                          | Keep run-scoped memory and label every interview as a synthetic-agent explanation, never testimony.                                         |
| Report tools and qualitative synthesis        | Adapt natively                          | Report tools may search typed evidence; generated narrative cannot create metrics.                                                          |
| CSV/JSON exports                              | Reuse SIMULA export/storage seams       | Existing exports include safe CSV handling, provenance, and tenant controls.                                                                |
| Persona generation from LLM prompts           | Replace completely                      | Demographics and weights must come from admitted aggregate population frames, survey data, or explicit authored fixtures.                   |
| Rule-agent global randomness                  | Replace completely                      | Use injected seeds and canonical identifiers; process-global randomness is not reproducible.                                                |
| In-memory progress/background tasks           | Reject                                  | Use SIMULA's durable run/attempt/lease/outbox model.                                                                                        |
| SQLite/SQLAlchemy persistence                 | Reject                                  | SIMULA's PostgreSQL/Supabase schema and RLS are authoritative.                                                                              |
| LLM-generated `viral_score`                   | Replace completely                      | Numerical results must be component metrics with named formulas, repeated-run stability, survey calibration, and held-out outcomes.         |
| PhantomCrowd backtest script                  | Rewrite natively                        | The script imports a missing `backend/data/backtesting_campaigns.py`; its labels, leakage controls, and protocol are not reproducible.      |
| PhantomCrowd validation claims                | Do not reuse                            | The report is vendor/repository-reported evidence, not SIMULA validation or a population-representation proof.                              |

## 4. License and provenance

SIMULA will use PhantomCrowd as a reference implementation and concept source.
This audit found no verbatim copied source. The exact upstream revision and MIT
notice are recorded in:

- `THIRD_PARTY_NOTICES.md`;
- `docs/compliance/open-source-license-register.md`;
- `docs/audits/phantomcrowd-code-provenance.md`.

If a future change copies a substantial upstream code segment, the applicable
source location must retain the copyright and MIT permission notice. The default
remains an independent implementation because SIMULA's tenancy, durability, data
governance, and output contracts materially differ.

## 5. Security, privacy, political-use, and scaling risks

### Security

- Do not copy optional-auth behavior, arbitrary URL scraping, broad exception
  defaults, or provider calls into SIMULA.
- Research/stimulus text is untrusted data. Prompt-injection isolation,
  SSRF-safe ingestion, strict schemas, bounded bytes, timeouts, retries, cost
  reservations, receipts, and kill switches remain required.
- Survey files and historical outcomes require private storage, checksum and
  provenance binding, malware-scanning integration points, retention, and
  deletion behavior.

### Privacy

- Store aggregate cohort and survey values where possible; do not build
  identifiable voter dossiers or one-agent-per-citizen records.
- Do not infer individual political affiliation, persuadability, vulnerability,
  or household political maps.
- Synthetic persona IDs must not be realistic names or contactable identities.
- Consent purpose, rights, collection mode, weighting, missingness, and
  retention must travel with survey evidence.

### Political use

Allowed scope is aggregate issue/message research, public-content review, policy
comprehension, broad geography, consented surveys, and human-reviewed reporting.
Prohibited scope includes individual persuasion scoring, vulnerable target
lists, private-profile scraping, voter suppression, fake accounts,
impersonation, disinformation, automated harassment, or autonomous publishing.
These restrictions must be enforced in schemas, business logic, workers,
exports, reports, and audit events.

### Scaling

- Repetitions multiply provider calls, cost, storage, and queue pressure. Use
  explicit repetition ceilings, concurrency, deadlines, and cost budgets.
- Persist compact summaries and checksums; retain full action/event artifacts
  only under explicit retention policy.
- Calibration and backtesting must be bounded, idempotent, held-out, and
  restart-safe. Partial results must not be published as complete evidence.

## 6. Exact implementation phases

1. **Audit/governance:** complete this audit, license records, status files,
   methodology contract, and threat/privacy review.
2. **Population-weighted panel:** reuse `sample_population`; add a frozen
   repeated-run contract that emits component metrics, dispersion, confidence
   intervals explicitly labelled as run-stability diagnostics, and ranking
   stability. No single viral score.
3. **Survey calibration:** add aggregate consented-survey provenance, import
   validation, response-quality/duplicate gates, demographic/geographic weights,
   post-stratification, distribution distance, MAE/RMSE/Brier/rank metrics, and
   calibration confidence. Keep real observations separate from synthetic runs.
4. **Historical backtesting:** add a blind replay contract, held-out observed
   outcome set, variant ranking comparison, error metrics, subgroup reports,
   leakage checks, and model-version regression tracking.
5. **Durable integration:** add migrations, tenant-scoped routes, idempotency,
   queue jobs, audit events, retention/deletion, generated contracts, and
   private-worker execution only after the core seams are green.
6. **Product/reporting:** add existing-design-system UI and reports that show
   population weights, run count, sample sizes, calibration/backtest status,
   uncertainty, evidence provenance, and limitations. Do not show a standalone
   prediction/viral score.
7. **Promotion/release:** require rights-cleared Philippine data, held-out
   human/outcome evidence, independent review, subgroup/language checks, exact
   release identity, hosted migration/readiness, and live browser/API/data
   verification before any production validity claim.

## 7. Exact files proposed for the first implementation slice

Create:

- `packages/simula-core/src/simula_core/repeated_simulation.py`;
- `packages/simula-core/src/simula_core/survey_calibration.py`;
- `packages/simula-core/src/simula_core/historical_backtesting.py`;
- `packages/simula-core/tests/test_repeated_simulation.py`;
- `packages/simula-core/tests/test_survey_calibration.py`;
- `packages/simula-core/tests/test_historical_backtesting.py`;
- `docs/methodology/campaign-simulation-scoring.md`;
- `docs/methodology/survey-calibration.md`;
- `docs/methodology/historical-backtesting.md`.

Defer until those seams pass:

- `services/api/src/simula_api/phase34_models.py` and `phase34_routes.py` or a
  bounded campaign-lab route module;
- NestJS DTO/controller/gateway additions under `apps/api/src`;
- `packages/contracts` generated schemas;
- a forward-only Supabase migration for survey/calibration/backtest state;
- worker job contracts and campaign-lab UI routes.

## 8. Modules that must remain untouched in the first slice

- `apps/web` visual design and existing dashboard flows;
- authentication/token verification, RLS helpers, and organization deletion
  orchestration;
- queue transport and run state-machine SQL;
- existing result contracts and generated contract artifacts;
- deployment manifests, provider admission, and production release gates;
- PhantomCrowd source checkout.

## 9. Exit criteria for the first slice

- Population weights affect aggregate component metrics and are visible in the
  repeated-run manifest.
- At least three seeded repetitions are required for stability reporting;
  unstable ranking is disclosed, not hidden.
- Survey calibration refuses missing consent/provenance and does not mutate
  synthetic results.
- Historical backtesting requires a held-out observed outcome set and computes
  rank agreement and error metrics without claiming universal accuracy.
- No new or existing code path accepts an LLM-generated `viral_score` as a
  numerical result.
- Focused core tests, mypy, Ruff, generated-claim checks, and relevant contract
  checks pass.
