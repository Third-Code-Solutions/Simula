# SIMULA

SIMULA is an experimental evidence and synthetic-audience pressure-testing
product. Synthetic message tests use authored, non-representative demo data and
estimate nobody. A separate respondent-free path can produce an experimental
national aggregate-turnout forecast from checksum-locked official history; it
does not predict candidates, parties, individual voters, or causal persuasion,
and it does not replace human research.

The Obsidian vault in `brain/` is the product and architecture source of truth.
The active remediation plan is
`plans/active/005-ux-and-production-remediation.md`. Current local capabilities,
hosted controls and pending release gates are recorded in
`brain/PROJECT_STATE.md` and `docs/audit/2026-09-05/REMEDIATION_TRACKER.md`.

## Current release

Production web/admin and five backend components are verified on source
`eb0ea931a180f1912f690be5648a6fb4a6557ab0` as of 5 September 2026. The signed
release and required CI passed; bounded production smoke verifies 52 assertions
including role denials, a persisted campaign run and a real experimental
behavioral run. This does not establish every route, hosted recovery or
scientific validity. See
[production evidence](docs/audit/2026-09-05/production-smoke-verification.json)
and [remaining acceptance](docs/audit/2026-09-05/REMEDIATION_TRACKER.md).

## Exact local toolchain

- Node.js `24.18.1`
- pnpm `11.13.1` through Corepack
- Python `3.14.7`, discovered and synchronized by uv
- uv `0.11.19`
- Docker with Redis `8.2.7-alpine`

```powershell
corepack enable
corepack install --global pnpm@11.13.1
pnpm install --frozen-lockfile
uv sync --all-packages --all-groups
pnpm contracts:generate
pnpm check
```

Install Python `3.14.7` from the signed PSF distribution or
`uv python install 3.14.7` when the pinned uv catalog supports that patch. Put
the exact interpreter on `PATH`; `pnpm toolchain:check` fails on drift.

On the configured Windows workstation, isolate the pinned tools from ambient
versions before running gates:

```powershell
$simulaTools = Join-Path $env:USERPROFILE '.codex/toolchains'
$env:PATH = "$simulaTools/node-v24.18.1-win-x64;$simulaTools/uv-0.11.19;$simulaTools/bin;$env:PATH"
$env:UV = "$simulaTools/uv-0.11.19/uv.exe"
.venv/Scripts/python.exe -m scripts.check_toolchain
```

Use the complete PSF Python distribution, including `venv`, for a new
development environment. A version check alone does not establish
standard-library completeness. The dependency audit also supports the Windows
embedded distribution: it exports all frozen packages/groups and scans them
using an isolated full Python runtime with the locked pip-audit version. This
fallback does not change the project interpreter requirement or omit packages
from the audit.

The pinned Next ESLint plugin patch replaces its directory globber with `glob`,
removing the `fast-glob` → `micromatch` → `braces` dependency chain affected by
GHSA-vfj7-8cjw-p6xm. All lint rules and the dependency audit remain enabled.
`scripts/next_eslint_glob.test.mjs` checks directory discovery and the actual
link rule for both apps. Revalidate or remove this version-specific patch when
upgrading the plugin. Trailing slashes restrict matches to directories, and
`follow: true` preserves symlink traversal.

Start the local queue with `pnpm redis:up`. Supabase is managed separately with
`pnpm supabase:start`; no hosted project is linked or mutated by these commands.
With local Supabase running, `pnpm verify:m2-api` performs two clean resets,
database lint, catalog-derived pgTAP tests, real-role RLS/claims/atomic-command
tests, anonymous and authenticated Data API denial probes, generated
database-type drift checking, and the real Auth → FastAPI → `simula_api` → RLS
organization/project/stimulus vertical. `pnpm database:types:generate`
intentionally rewrites the pinned generated artifact after an accepted
migration. Authored local identities live only in `supabase/seed.sql`; runtime
database-role passwords remain out of source and are injected only by the
disposable integration harness or deployment environment.

Run the complete disposable M0 runtime proof with `pnpm verify:m0-runtime`. Use
`pnpm verify:m0-runtime -- --preflight-only` to check the local-only guard,
exact toolchain, Compose configuration, and Docker engine without starting
resources. The gate removes inherited Docker/Compose routing, accepts only a
local Unix socket or Windows named-pipe context, holds one cross-clone runtime
lock, checks fixed ports, and uses per-run Compose, Supabase, image, and probe
container names. The full proof bounds commands, contains descendant processes
with a Windows Job Object or POSIX process group, and attempts exact cleanup
after failure, timeout, or catchable interruption; POSIX SIGTERM is included.
Any cleanup failure is reported. Docker Desktop requires firmware virtualization
plus Windows Virtual Machine Platform/WSL2 on Windows.
`HCS_E_HYPERV_NOT_INSTALLED` requires host remediation and usually a reboot; it
is not a repository error.

Copy `.env.example` to `.env` for local values. Never commit credentials or
content.

## Services

- `apps/web`: Next.js account, organization/project, Campaign Lab and result UI.
- `apps/admin`: restricted platform administration UI.
- `apps/api`: NestJS control plane and durable outbox dispatcher.
- `services/api`: FastAPI public authority for M2 organization/project/stimulus
  commands; browser credentials never reach application Data API schemas.
- `services/worker`: private durable simulation and Campaign Lab job execution.
- `services/ai-engine`: private bounded behavioral and methodology execution.
- `packages/contracts`: generated OpenAPI, application, and database TypeScript
  contracts.
- `packages/simula-core`: shared runtime and safe serialization primitives.
- `supabase`: ordered database foundation, global role bootstrap, authored local
  Auth fixtures, default-deny RLS/command boundaries, and immutable project/
  stimulus command helpers for P2-03.

External deployment and hosted resource mutation require explicit authorization.

## Filipino and Taglish Campaign Lab

Campaign Lab reuses Simula's research ingestion, source registry, population
cohorts, bounded behavioral engine, durable jobs, interviews, and reports. Its
original implementation contains no imported MiroFish/AGPL source or dependency.
Select Filipino, Taglish, or English and a Philippine marketing or
public-service scenario. Demo output remains deterministic and synthetic. Live
output is experimental model research; it is neither observed public opinion nor
a sales or vote forecast.

Live execution is disabled by default. Configure `SIMULA_LIVE_*` from
`.env.example` on the API and worker; provision `SIMULA_LIVE_API_KEY` only on
the worker. Set a server-approved HTTPS chat-completions endpoint and requested
model identifier, plus current input/output token prices in micro-USD per
million tokens. The provider must support JSON-object output, `max_tokens`, and
token usage receipts. Enable only after both services are configured; the API
capability response checks configuration, not the worker's secret or provider
connectivity. Never use production credentials for local QA.

The current example selects OpenCode Go's `deepseek-v4.1-flash` through
`https://opencode.ai/zen/go/v1`. Its
[published rates](https://docs.opencode.ai/docs/go/#usage-limits), checked
2026-10-10, are USD 0.15 input and USD 0.60 output per million tokens off-peak,
or USD 0.30 input and USD 1.20 output at peak. Configuration uses peak, uncached
prices conservatively. Peak windows are weekdays 01:00–04:00 and 06:00–10:00
UTC; weekends are off-peak. Go costs USD 10/month; Go Plus costs USD 40/month.
Token costs count toward model-specific subscription allowances, so Simula's
uncached token estimate is not an invoice or an account-quota check. Go's
documented client expectations target coding-agent traffic. Live research QA
requests were accepted; ongoing suitability for this workload is not confirmed.
Simula identifies itself as `simula-research/1.0` and supplies a stable session
header per job. The internal `openai_compatible` name describes the API format;
OpenCode credentials and endpoint handle these requests. No OpenAI key is
needed.

DeepSeek uses non-thinking mode for these bounded structured decisions. Decision
schemas explicitly bind agent, round, allowed evidence and discussion targets;
evidence identifiers are sorted without changing their values. Duplicates,
unknown references, invalid or overlong responses fail validation without a paid
automatic retry. The example allows 8,192 output tokens so a ten-cohort response
fits without truncation; the shared per-job spending limit still applies.
Interviews receive allowed citation identifiers and an explicit four-field JSON
example. Missing or invented references fail validation; the server never fills
in citations omitted by the model.

Default limits admit 10 agents, one round, three repetitions, 100 calls, and a 1
USD maximum per job. A call reserves the configured maximum token cost before
dispatch. Invalid output, missing usage, budget exhaustion, or timeout fails the
run without substituting demo results. Unknown charged outcomes are not retried
automatically, including reclaimed jobs. Receipts retain model/prompt identity,
returned model identifiers, token usage, cost, and hashes; they do not promise
identical output on replay.

Live browser QA is opt-in: provide only the `SIMULA_LIVE_*` configuration in the
process environment, set `SIMULA_LIVE_E2E=true` and
`SIMULA_E2E_GREP="Campaign Lab live provider"`, then run `pnpm verify:p2:e2e`.
This resets the disposable local Supabase database and makes paid provider calls
for four Filipino/Taglish marketing/public-service journeys. It uses real local
authentication, API, worker, persistence, interviews, and reports. The harness
keeps the provider key on the worker and strips it from build/browser processes;
never load hosted database credentials for this gate.

Marketing runs retain separate experimental component metrics. Public-service
runs retain qualitative explanations and evidence-linked interviews, with no
persuasion ranking or public-support estimate. Research sources must be admitted
and linked to the request. Interviews cite the persisted simulation events; they
are synthetic explanations, never testimony from participants. Filipino/Taglish
fluency, cultural interpretation, and consequential conclusions require human
review and consent-based real-world validation.

## UX refactor verification — 2026-09-05

Current implementation and its evidence are tracked in
[the active remediation plan](plans/active/005-ux-and-production-remediation.md)
and [the remediation tracker](docs/audit/2026-09-05/REMEDIATION_TRACKER.md). The
refactor covers public/account pages, contextual mobile navigation,
organization/project workspaces, Campaign Lab forms/history, results, and admin
pagination. It retains experimental labels and permission boundaries.

Build tasks currently run without Turbo artifact caching. Windows builds contain
runtime module links that Turbo could not archive reliably; restoring partial
outputs is not safe. This trades build speed for complete, freshly generated
artifacts until cache round-trip verification supports re-enabling it.
Development output and caches are also excluded from the declared release
outputs. Local passing checks do not establish hosted release or scientific
validation.

Git-triggered application deployments are disabled. Release through the signed
source promotion boundary described in
[the promotion procedure](docs/audit/2026-09-05/PROMOTION_PROCEDURE.md), using
explicit existing provider targets and retained rollback identities. Provider
SUCCESS alone does not establish application health or completed verification.

The current runtime requires database migration `20261010155547` and uses V6
readiness and observability functions. The migration preserves V5 and its
`20260905104327` contract so previously deployed binaries remain healthy during
rollout and application rollback.
