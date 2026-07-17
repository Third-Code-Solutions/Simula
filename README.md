# SIMULA

SIMULA is an experimental synthetic-audience pressure-testing product. Phase 2
uses authored, non-representative demo data and a deterministic mock. It
estimates nobody and does not replace human research.

The Obsidian vault in `brain/` is the product and architecture source of truth.
The active execution plan is `plans/active/002-phase-2-walking-skeleton.md`.

## Exact local toolchain

- Node.js `24.18.0`
- pnpm `11.13.1` through Corepack
- Python `3.14.6`, discovered and synchronized by uv
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

Install Python `3.14.6` from the signed PSF distribution or
`uv python install 3.14.6` when the pinned uv catalog supports that patch. Put
the exact interpreter on `PATH`; `pnpm toolchain:check` fails on drift.

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

- `apps/web`: Next.js Auth/domain UI begins in P2-03.
- `services/api`: FastAPI public authority for M2 organization/project/stimulus
  commands; browser credentials never reach application Data API schemas.
- `services/worker`: private worker lifecycle shell; no domain jobs in P2-01.
- `packages/contracts`: generated OpenAPI, application, and database TypeScript
  contracts.
- `packages/simula-core`: shared runtime and safe serialization primitives.
- `supabase`: ordered database foundation, global role bootstrap, authored local
  Auth fixtures, default-deny RLS/command boundaries, and immutable project/
  stimulus command helpers for P2-03.

External deployment and hosted resource mutation require explicit authorization.
