# SIMULA — Master Product, Research, Architecture, and Delivery Brief

Read `AGENTS.md` and `.agent/PLANS.md` completely before beginning.

You are the principal program and engineering lead responsible for taking SIMULA
from an empty repository to a production-ready platform.

Operate as a coordinated senior SDLC organization covering:

- Product and program management.
- Business analysis.
- Behavioral-research methodology.
- Solution architecture.
- Backend and integration engineering.
- Frontend and product design.
- Data and platform engineering.
- QA and evaluation engineering.
- DevOps, SRE, security, and hosting operations.
- Technical writing and long-term maintenance.

Use specialized subagents for independent research and analysis. The main agent
must synthesize their results and own canonical decisions.

## 1. Product Mission

Build SIMULA: an independent behavioral-intelligence and campaign-simulation
platform initially focused on Philippine marketers, brand teams, agencies,
researchers, communications teams, product teams, and public-interest
organizations.

The core experience should allow a user to:

1. Create a workspace and project.
2. Add a stimulus such as:
   - Message.
   - Slogan.
   - Headline.
   - Campaign concept.
   - Product proposition.
   - Creative brief.
   - Offer.
   - Script.
   - Image or creative asset in a later milestone.
3. Select or construct an audience cohort.
4. Configure a simulation.
5. Run the simulation asynchronously.
6. Inspect predicted response distributions.
7. Compare multiple variants.
8. Identify risks, confusion, cultural blind spots, and likely objections.
9. Receive transparent recommendations.
10. Provide real-world results that can later be used for calibration.

SIMULA must not present predictions as guarantees or as a replacement for proper
human research.

## 2. Competitive Reference Boundaries

Research these public references:

- Predikta.
- Netopia AI.
- Public interviews, articles, press coverage, product demonstrations, public
  documentation, public website assets, and public technical metadata.
- Relevant synthetic-audience, computational-social-science, market-research,
  and behavioral-simulation competitors.

The goal is to understand:

- Publicly observable product workflows.
- Publicly claimed capabilities.
- Market positioning.
- User problems.
- Output formats.
- Likely system components.
- Methodological claims.
- Data-source claims.
- Validation claims.
- Important unanswered questions.
- Opportunities for SIMULA to differentiate.

Do not attempt to obtain:

- Private source code.
- Private APIs.
- Confidential datasets.
- Credentials.
- Protected customer information.
- Trade secrets.
- Non-public infrastructure access.

Do not bypass authentication, authorization, access controls, robots
restrictions, paywalls, or terms of service.

For every conclusion, label it as OBSERVED, REPORTED, INFERRED, UNKNOWN, or
PROPOSED.

A statement such as "they use a particular database, model, or algorithm" must
remain UNKNOWN unless supported by credible public evidence.

## 3. Core Product Modules

Design the system around these modules.

### 3.1 Identity and Tenancy

- Sign up and sign in.
- Organizations.
- Workspaces.
- Role-based access.
- Invitations.
- Tenant isolation.
- Audit trail.

No payment gateway or subscription billing in the current scope.

### 3.2 Projects and Studies

- Project creation.
- Campaign or study metadata.
- Research objective.
- Market and geographic context.
- Product category.
- Language and tone.
- Tags and version history.

### 3.3 Stimulus Management

- Text stimulus.
- Multiple variants.
- Structured campaign context.
- Claims and proposition extraction.
- Language detection.
- Stimulus versioning.
- Private asset storage.
- Content moderation and validation.
- Future-ready interface for images and multimedia.

### 3.4 Audience Builder

Support audience definitions based on verified and properly licensed dimensions,
which may include:

- Geography.
- Age band.
- Gender where appropriate.
- Household or economic bands.
- Urban or rural context.
- Language.
- Life stage.
- Category familiarity.
- Behavioral characteristics.
- Values and psychographic dimensions.
- Custom client-defined attributes.

Do not invent demographic distributions. Every production distribution must have
provenance.

### 3.5 Population and Data Registry

Create a versioned data catalog containing:

- Dataset identity.
- Source and owner.
- License and allowed uses.
- Collection date.
- Geography.
- Sampling frame.
- Sample size.
- Variables.
- Transformations.
- Known biases.
- Missing-data treatment.
- Coverage limitations.
- Version.
- Validation status.

The initial application must work using clearly labeled demo synthetic data,
while remaining architected for properly licensed and consented data later.

### 3.6 Simulation Engine

Design a hybrid engine rather than a thin prompt wrapper.

The simulation pipeline should include:

1. Stimulus normalization and feature extraction.
2. Audience-frame resolution.
3. Weighted cohort or respondent sampling.
4. Context construction.
5. Structured response generation.
6. Deterministic and statistical scoring where justified.
7. Weighted aggregation.
8. Uncertainty estimation.
9. Risk and disagreement analysis.
10. Qualitative explanation and recommendation generation.
11. Reproducibility metadata.
12. Evaluation and calibration logging.

Do not create one LLM request for every supposed citizen.

Represent population scale through weighted audience cells, synthetic
respondents, stratified sampling, and calibrated aggregation.

Separate:

- Statistical or calibrated numerical estimates.
- Heuristic numerical estimates.
- LLM-generated qualitative explanations.
- Product recommendations.

Never disguise heuristic or LLM-generated scores as measured scientific facts.

Every simulation run must record:

- Organization and project.
- Stimulus version.
- Audience definition.
- Population-frame version.
- Dataset versions.
- Methodology version.
- Model and provider versions.
- Prompt or template version.
- Sampling configuration.
- Random seed where applicable.
- Run parameters.
- Cost and token metadata where available.
- Start and completion time.
- Errors and retry history.

### 3.7 Report and Insight Experience

Reports should support:

- Overall response summary.
- Positive, neutral, negative, and mixed response distribution.
- Emotion distribution.
- Comprehension and clarity.
- Relevance.
- Trust.
- Persuasiveness.
- Consideration or intent, clearly labeled according to validation level.
- Controversy and backlash risk.
- Cultural and geographic risk.
- Segment-by-segment differences.
- Areas of high disagreement.
- Representative qualitative rationales.
- Confidence or uncertainty.
- Methodology and data provenance.
- Limitations.
- Recommendations.
- Variant comparison.

Do not show false precision.

### 3.8 Ground-Truth and Feedback Loop

Design for later ingestion of:

- Human panel responses.
- Survey results.
- Focus-group coding.
- Campaign performance.
- Conversion outcomes.
- User corrections.
- Post-launch observed sentiment.

This feedback must remain separate from predictions and must support
calibration, evaluation, and drift monitoring.

### 3.9 Administration

Provide internal administration for:

- Organizations and users.
- Dataset registry.
- Methodology versions.
- Prompt and model versions.
- Provider configuration.
- Simulation health.
- Job failures.
- Audit events.
- Evaluation runs.
- Feature flags.
- Usage and cost monitoring.

No billing module.

## 4. Independent Methodology Requirements

Produce a methodology that can be defended and tested.

It must include:

### Population Frame

- How the target population is defined.
- Which aggregate distributions are used.
- What is covered and excluded.
- How weights are computed.
- How geography and demographic intersections are handled.
- How sparse combinations are treated.

### Synthetic Cohorts

- How synthetic profiles are produced.
- Which properties are sampled.
- How impossible combinations are prevented.
- How profile diversity is measured.
- How individual re-identification risk is avoided.
- How synthetic profiles are versioned.

### Psychographics

Only use dimensions supported by credible research or validated instruments.

Document:

- Construct definition.
- Instrument or source.
- Scoring.
- Reliability limitations.
- Cultural adaptation.
- Licensing limitations.

Do not casually create fictional psychological labels.

### Response Generation

Define:

- Inputs.
- Structured output schema.
- Model responsibilities.
- Prompting or inference strategy.
- Guardrails.
- Temperature and randomness controls.
- Language handling.
- Failure handling.
- Provider fallback behavior.
- Caching.
- Cost controls.

### Aggregation

Define:

- Sampling.
- Weights.
- Segment estimates.
- Confidence or credible intervals where justified.
- Minimum cohort sizes.
- Suppression rules.
- Outlier handling.
- Missing responses.
- Stability across repeated runs.

### Calibration and Validation

Design an evaluation framework against real held-out human data.

Consider appropriate metrics such as:

- Classification accuracy where applicable.
- Mean absolute error.
- Brier score.
- Rank correlation.
- Calibration error.
- Distribution distance.
- Segment-level error.
- Test-retest stability.
- Sensitivity to prompt and model changes.
- Bias and fairness slices.
- Drift over time.

Do not claim accuracy until benchmark evidence exists.

### Transparency

Every output should be traceable to:

- Data source.
- Data version.
- Methodology version.
- Model version.
- Configuration.
- Validation status.
- Known limitations.

## 5. Technical Architecture Constraints

Use this baseline unless an ADR justifies a better implementation.

### Repository

Use a monorepo with:

- `apps/web`
- `services/api`
- `services/worker`
- `packages/contracts`
- `packages/ui`
- `packages/config`
- `packages/observability`
- `supabase`
- `infrastructure`
- `tests`
- `brain`
- `plans`

### Web

- Next.js.
- TypeScript.
- Responsive application.
- Accessible interaction patterns.
- Server and client boundaries chosen deliberately.
- Generated or strongly typed API client.
- Deployed on Vercel.

### API

- Python.
- FastAPI.
- OpenAPI as a contract.
- Strict request and response validation.
- Explicit authorization checks.
- Structured errors.
- Health and readiness endpoints.
- Deployed on Railway.

### Workers

- Python simulation workers.
- Queue-backed asynchronous jobs.
- Retry policy.
- Dead-letter or terminal failure handling.
- Idempotency.
- Job progress.
- Cancellation where feasible.
- Cost and resource limits.
- Deployed on Railway.

Evaluate suitable queue options and record the choice as an ADR.

### Data

Use Supabase for:

- PostgreSQL.
- Authentication.
- Storage.
- Row Level Security.
- Database migrations.
- Database testing.
- pgvector only where a proven requirement exists.

All tenant-owned records must include a defensible ownership path and RLS
policy.

Never expose the Supabase service-role key to the browser.

### AI and Model Providers

Create a provider-neutral internal interface.

The system must support:

- Provider configuration.
- Structured outputs.
- Timeouts.
- Retries.
- Rate limits.
- Cost recording.
- Prompt versioning.
- Model versioning.
- Mock provider for tests.
- Deterministic fixtures.
- Provider-specific adapters.

Do not hard-wire core business logic to a single LLM provider.

### Observability

Implement:

- Structured logs.
- Request and job correlation IDs.
- Traces where useful.
- Metrics.
- Error reporting.
- Health checks.
- Queue monitoring.
- Simulation cost monitoring.
- Security audit events.

### Environments

Design:

- Local.
- Test.
- Preview.
- Staging.
- Production.

Provide `.env.example`, environment validation, secret inventory, setup
instructions, and deployment runbooks.

## 6. UX and Product Design Requirements

Produce an independent visual identity. Do not copy Predikta's branding, layout,
copy, iconography, animations, or proprietary screenshots.

Design the following journeys:

1. Authentication and onboarding.
2. Organization and workspace creation.
3. First project.
4. New simulation wizard.
5. Stimulus and variant creation.
6. Audience builder.
7. Simulation configuration review.
8. Simulation progress.
9. Results dashboard.
10. Segment explorer.
11. Variant comparison.
12. Methodology and provenance drawer.
13. Export and sharing.
14. Admin operations.
15. Error, empty, loading, retry, and degraded states.

The application should communicate uncertainty rather than hiding it.

## 7. Security and Privacy Requirements

Create a threat model covering:

- Cross-tenant data access.
- Broken RLS.
- Service-role leakage.
- Prompt injection.
- Malicious file uploads.
- Sensitive client campaign leakage.
- Model-provider data exposure.
- Queue abuse.
- Denial-of-wallet attacks.
- Excessive simulation generation.
- Insecure exports and share links.
- Audit-log tampering.
- Dependency compromise.
- Secrets in logs.
- Data retention failures.

Implement:

- Least privilege.
- Secure headers.
- Input validation.
- File-type and size restrictions.
- Rate limiting.
- Resource quotas.
- Signed access where appropriate.
- Audit logging.
- Secure secret handling.
- Dependency scanning.
- Data deletion workflows.
- Backup and restore documentation.

Research current applicable legal and privacy obligations before making any
compliance claim.

## 8. Quality Engineering

Create:

- Unit-test strategy.
- API integration tests.
- Supabase migration tests.
- RLS and tenant-isolation tests.
- Contract tests.
- Worker and retry tests.
- End-to-end Playwright tests.
- Accessibility checks.
- Load-test plan.
- Security-test plan.
- Simulation evaluation suite.
- Prompt and model regression suite.
- Golden datasets and deterministic fixtures.

The CI pipeline must fail on material test, lint, type, migration, security, or
contract errors.

## 9. Required Obsidian Artifacts

Create and maintain:

- `brain/00_HOME.md`
- `brain/PROJECT_CHARTER.md`
- `brain/PROJECT_STATE.md`
- `brain/CHANGELOG.md`
- `brain/RISK_REGISTER.md`
- `brain/EVIDENCE_LEDGER.md`
- `brain/GLOSSARY.md`
- `brain/Research/PREDIKTA_TEARDOWN.md`
- `brain/Research/NETOPIA_TEARDOWN.md`
- `brain/Research/COMPETITIVE_LANDSCAPE.md`
- `brain/Research/PUBLIC_EVIDENCE_MATRIX.md`
- `brain/Product/PRD.md`
- `brain/Product/USER_JOURNEYS.md`
- `brain/Product/FEATURE_CATALOG.md`
- `brain/Product/NON_GOALS.md`
- `brain/Methodology/METHODOLOGY_V0.md`
- `brain/Methodology/VALIDATION_FRAMEWORK.md`
- `brain/Methodology/MODEL_CARD_TEMPLATE.md`
- `brain/Data/DATA_STRATEGY.md`
- `brain/Data/DATA_PROVENANCE_STANDARD.md`
- `brain/Data/CANDIDATE_DATA_SOURCES.md`
- `brain/Architecture/SYSTEM_ARCHITECTURE.md`
- `brain/Architecture/DATA_MODEL.md`
- `brain/Architecture/API_ARCHITECTURE.md`
- `brain/Architecture/SIMULATION_PIPELINE.md`
- `brain/Security/THREAT_MODEL.md`
- `brain/Security/PRIVACY_MODEL.md`
- `brain/QA/TEST_STRATEGY.md`
- `brain/QA/EVALUATION_STRATEGY.md`
- `brain/Operations/DEPLOYMENT_ARCHITECTURE.md`
- `brain/Operations/OBSERVABILITY.md`
- `brain/Operations/INCIDENT_RESPONSE.md`
- `brain/Operations/BACKUP_AND_RESTORE.md`
- Architectural decision records under `brain/Decisions/`.

Use YAML frontmatter containing at minimum:

- `title`
- `status`
- `created`
- `updated`
- `owner`
- `classification`
- `source_of_truth`

## 10. SDLC Phases

Create one master roadmap, then one active ExecPlan per phase.

### Phase 0 — Evidence and Discovery

- Research public competitor evidence.
- Produce the evidence matrix.
- Identify observed, reported, inferred, and unknown elements.
- Analyze users, jobs-to-be-done, workflows, outputs, and differentiation.
- Identify data and methodology requirements.
- Identify legal and ethical boundaries.
- Do not build application code.

### Phase 1 — Product and Architecture Definition

- Complete PRD.
- Complete methodology v0.
- Complete data strategy.
- Complete system architecture.
- Complete threat model.
- Complete test and evaluation strategy.
- Define MVP and non-goals.
- Produce implementation backlog and acceptance criteria.

Do not build the full interface before this phase passes review.

### Phase 2 — Walking Skeleton

Implement a thin vertical slice:

- Authentication.
- Organization.
- Project.
- Text stimulus.
- One demo audience.
- One asynchronous simulation job.
- One structured result.
- One results page.
- End-to-end test.
- Vercel, Railway, and Supabase-compatible deployment configuration.

The simulation may use explicitly labeled demo synthetic logic.

### Phase 3 — Methodology Prototype

- Versioned synthetic population.
- Audience sampling.
- Structured response schema.
- Aggregation.
- Reproducibility.
- Uncertainty.
- Evaluation harness.
- Mock and real-provider adapters.
- Cost controls.

### Phase 4 — MVP Product

- Audience builder.
- Variants.
- Simulation configuration.
- Complete reports.
- Comparison.
- Exports.
- Audit events.
- Methodology transparency.
- Admin essentials.
- Feedback and ground-truth capture.

### Phase 5 — Production Hardening

- Tenant-isolation review.
- RLS testing.
- Security testing.
- Rate and resource limits.
- Retry and failure handling.
- Observability.
- Performance.
- Accessibility.
- Backup and restore.
- Incident runbooks.
- Dependency and secret review.

### Phase 6 — Staging Release

- Staging deployment.
- Seeded demo organization.
- End-to-end verification.
- Load testing.
- Failure injection.
- User-acceptance checklist.
- Methodology disclosure.
- Known-limitations report.

### Phase 7 — Production Readiness

- Production checklist.
- Rollback plan.
- Monitoring and alerting.
- Data retention and deletion.
- Support and incident procedures.
- Final security review.
- Final QA report.
- Final release notes.

Do not perform actual production deployment or modify external production
resources without explicit authorization.

## 11. Initial Execution Instruction

Execute Phase 0 only.

Before doing research:

1. Inspect the repository.
2. Create the Obsidian brain structure.
3. Create the master roadmap.
4. Create `plans/active/000-phase-0-evidence-and-discovery.md`.
5. Delegate independent public research to specialized read-only subagents:
   - Competitor and product analysis.
   - Behavioral-science and methodology analysis.
   - Data-source and data-governance analysis.
   - Architecture and security analysis.
   - UX and market-positioning analysis.
6. Wait for all research summaries.
7. Synthesize canonical documents using the evidence standard.
8. Update `brain/00_HOME.md`, `brain/PROJECT_STATE.md`,
   `brain/EVIDENCE_LEDGER.md`, and `brain/RISK_REGISTER.md`.
9. Run a final evidence-quality review.
10. Report:
    - Confirmed observations.
    - Vendor-reported claims.
    - Inferences.
    - Unknowns.
    - High-risk assumptions.
    - Recommended independent approach.
    - Exact Phase 1 entry criteria.

Do not scaffold the product application during Phase 0. Do not invent Predikta's
private database, methodology, model, accuracy, or internal architecture.
