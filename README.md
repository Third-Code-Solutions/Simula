# SIMULA

SIMULA is an experimental evidence and synthetic-audience pressure-testing
product. Synthetic message tests use authored, non-representative demo data and
estimate nobody. A separate respondent-free path can produce an experimental
national aggregate-turnout forecast from checksum-locked official history; it
does not predict candidates, parties, individual voters, or causal persuasion,
and it does not replace human research.

The Obsidian vault in `brain/` is the product and architecture source of truth.
The active execution plan is `plans/active/002-phase-2-walking-skeleton.md`.

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
