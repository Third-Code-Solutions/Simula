# SIMULA Repository Operating Contract

## Mission

Build SIMULA: an independently designed, production-grade behavioral
intelligence and campaign-simulation platform initially focused on the
Philippine market.

Predikta and Netopia AI are competitive references based only on publicly
observable information. Never copy or attempt to obtain proprietary source code,
protected assets, private APIs, confidential datasets, trade secrets,
credentials, or non-public methodology.

Use only public, licensed, consented, user-provided, or clearly labeled
synthetic data.

## Non-Negotiable Product Rules

- Do not implement a payment gateway.
- Use Vercel for the web application.
- Use Railway for API, workers, queues, and supporting runtime services.
- Use Supabase for PostgreSQL, Auth, Storage, pgvector when justified,
  migrations, and Row Level Security.
- Do not claim that SIMULA represents or predicts 70 million Filipinos unless
  independently validated evidence supports that claim.
- Demo or unvalidated outputs must be explicitly labeled as experimental.
- Never present LLM-generated numbers as scientifically validated measurements.
- Never fabricate competitor implementation details, datasets, accuracy, or
  methodology.

## Start-of-Session Protocol

Before performing substantive work:

1. Read `brain/00_HOME.md`.
2. Read `brain/PROJECT_STATE.md`.
3. Read the active execution plan under `plans/active/`.
4. Read relevant ADRs under `brain/Decisions/`.
5. Inspect `git status`, recent commits, tests, and open failures.
6. State the current objective, assumptions, risks, and validation plan.
7. Continue from documented state rather than restarting the project mentally.

## Evidence Standard

Every external or competitor-related statement must be classified as:

- `OBSERVED`: directly visible in a cited public source.
- `REPORTED`: claimed by a company, founder, publication, or third party.
- `INFERRED`: reasoned from evidence but not directly confirmed.
- `UNKNOWN`: insufficient evidence.
- `PROPOSED`: our independent design decision.

For research entries, record:

- Source title and URL.
- Publisher.
- Access or publication date.
- Relevant evidence.
- Classification.
- Confidence: low, medium, or high.
- Limitations and unresolved questions.

Never convert an inference into a factual statement.

## Planning and Execution

For any significant feature, cross-service change, architectural change, data
model change, security-sensitive change, or task expected to touch multiple
modules:

1. Create or update an ExecPlan under `plans/active/`.
2. Define user outcome, scope, non-goals, architecture, milestones, tests,
   risks, rollback, and exit criteria.
3. Keep the ExecPlan current throughout implementation.
4. Move completed plans to `plans/completed/`.
5. Do not mark a milestone complete without verification evidence.

Use subagents for bounded, independent, read-heavy work such as research,
codebase exploration, test analysis, threat modeling, and documentation review.
The primary agent owns canonical decisions and shared-file edits.

## Obsidian Brain Contract

`brain/` is the authoritative project memory and must remain readable in
Obsidian.

At the end of every meaningful milestone:

- Update `brain/PROJECT_STATE.md`.
- Update `brain/CHANGELOG.md`.
- Add or update relevant research notes.
- Record architectural decisions as ADRs.
- Update `brain/RISK_REGISTER.md`.
- Update `brain/EVIDENCE_LEDGER.md`.
- Link new documents from `brain/00_HOME.md`.
- Record the exact tests and verification performed.

Do not store secrets, access tokens, production credentials, personal data, or
private keys in the vault.

Use concise Markdown, stable filenames, backlinks, and YAML frontmatter where
helpful.

## Architecture Baseline

Unless an approved ADR states otherwise:

- Monorepo.
- `apps/web`: Next.js and TypeScript, deployed on Vercel.
- `services/api`: Python FastAPI service, deployed on Railway.
- `services/worker`: Python asynchronous simulation worker on Railway.
- `packages/contracts`: OpenAPI, JSON Schema, and generated client contracts.
- `packages/ui`: shared UI and design-system components.
- Supabase PostgreSQL is the source of truth.
- Supabase Auth handles identity.
- Supabase Storage handles private and public assets with explicit policies.
- Tenant-owned tables use organization-scoped Row Level Security.
- Background simulations are idempotent, retryable, observable, and versioned.
- LLM providers are behind an internal provider abstraction.
- Numerical scoring and qualitative LLM explanations must remain separable.
- Every simulation records dataset version, methodology version, model version,
  prompt version, configuration, timestamp, and deterministic seed where
  applicable.

Research and pin current stable versions before implementation.

## Engineering Standards

- Use strict typing.
- Validate all external inputs.
- Use migrations for every database change.
- Keep generated API contracts synchronized.
- Use structured logging and correlation IDs.
- Never expose service-role credentials to the browser.
- Add rate limits and resource limits to expensive operations.
- Make jobs idempotent and safely retryable.
- Use explicit timeouts and failure states.
- Avoid silent fallback behavior.
- Never log secrets, raw credentials, or sensitive research responses.
- Keep production configuration outside source control.
- Prefer reversible, incremental changes over large uncontrolled rewrites.

## Testing Requirements

A feature is not complete without appropriate:

- Unit tests.
- Integration tests.
- API contract tests.
- Database and RLS tests.
- End-to-end tests for critical user journeys.
- Simulation evaluation tests.
- Security tests.
- Migration verification.
- Failure and retry-path tests.
- Accessibility checks for user-facing interfaces.

Use fixtures or synthetic test data rather than production personal data.

## Security and Privacy

- Follow least privilege.
- Treat all uploaded stimuli and customer research as confidential.
- Maintain a threat model.
- Maintain tenant isolation.
- Support data retention and deletion workflows.
- Review current applicable privacy and data-protection obligations before
  claiming compliance.
- Never bypass authentication, authorization, robots controls, paywalls, or
  access restrictions during competitor research.
- Do not deploy to production or alter production data without explicit user
  authorization.

## Autonomy

Resolve non-blocking and reversible ambiguities using the most conservative
production-grade default, then record the decision.

Stop and request authorization only when work requires:

- Credentials or account authentication.
- Purchasing paid infrastructure.
- Irreversible external actions.
- Production deployment.
- Destructive data operations.
- Acceptance of legal, licensing, or compliance risk.

Do not repeatedly ask for routine implementation decisions that can be safely
resolved and documented.

## Definition of Done

A milestone is complete only when:

- Its behavior works.
- Tests pass.
- Security implications were reviewed.
- Documentation is updated.
- Obsidian memory is updated.
- Migrations are verified.
- Observability is present.
- Failure and rollback procedures are documented.
- Remaining limitations are clearly disclosed.
- No unsupported scientific, performance, or competitor claims are made.
