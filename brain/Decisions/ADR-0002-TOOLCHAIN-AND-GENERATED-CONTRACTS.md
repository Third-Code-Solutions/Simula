---
title: ADR-0002 Toolchain and Generated Contracts
status: accepted
created: 2026-07-17
updated: 2026-07-20
owner: Architecture lead
classification: PROPOSED
source_of_truth: true
---

# ADR-0002 — Toolchain and Generated Contracts

## Context

Phase 2 needs one reproducible monorepo for a Next.js web app, FastAPI API, Python worker, database migrations, and generated contracts. Local tools are newer/older than some current releases; implicit “latest” would make CI and rollback non-reproducible.

Current official/registry observations on 2026-07-17:

- Node 24 is LTS; current patch is `24.18.0`. Node 26 is Current, not LTS.
- Python `3.14.6` is the current 3.14 maintenance release.
- Next.js `16.2.10` requires Node `>=20.9`; `@supabase/supabase-js 2.110.7` requires Node `>=22`.
- Supabase changelog announces TypeScript 5+ as a future client minimum, Node 20 support removal, changed Data API exposure defaults, and a prior pgmq upgrade hazard. Pins and migration tests are mandatory.
- Repository host has Node `24.16.0`, pnpm `9.15.0`, Python `3.14.5`, uv `0.11.19`, Docker `29.6.1`, Railway CLI `5.12.1`, and Vercel CLI `54.7.1`. Host drift is allowed only for bootstrap; CI/container pins are authoritative.

Sources: [Node release table](https://nodejs.org/en/about/previous-releases), [Node 24.18.0](https://nodejs.org/en/blog/release/v24.18.0), [Python 3.14.6](https://www.python.org/downloads/release/python-3146/), [Next 16.2](https://nextjs.org/blog/next-16-2), [Supabase changelog](https://supabase.com/changelog.md), npm and PyPI registry metadata queried 2026-07-17.

Evidence ledger: E-4014, E-4015, E-4016, E-4017, E-4018, E-4026, E-4027.

## Decision

Use a polyglot monorepo:

```text
apps/web/                 Next.js App Router
services/api/             FastAPI public domain API
services/worker/          private queue worker
packages/contracts/       generated TypeScript/OpenAPI/JSON Schema
packages/simula-core/     shared Python domain package
supabase/migrations/      ordered SQL authority
supabase/seed.sql         authored demo fixtures only
tests/                    cross-service, RLS, and E2E assets
```

- JavaScript workspace/package manager: pnpm workspaces with Turborepo task orchestration.
- Python workspace/package manager: uv workspace with PEP 621 projects and one lock.
- Node pin: `24.18.0`; pnpm `11.13.1`; Turbo `2.10.5`.
- Python pin: `3.14.6`; uv `0.11.19` minimum/CI pin.
- Containers and CI use exact runtime patch versions. Developers may use another compatible patch only if lock/install/test output is identical.
- Exact direct dependencies are committed. Transitives are locked by `pnpm-lock.yaml` and `uv.lock`; no wildcard, caret, tilde, URL branch, or unpinned action reference in release inputs.

### Phase 2 direct pin baseline

| Surface | Pins |
|---|---|
| Web runtime | Next `16.2.10`; React/React DOM `19.2.7`; TypeScript `5.9.3` (openapi-typescript 7.13 requires TypeScript 5.x) |
| Web types | `@types/node 24.13.3`; `@types/react 19.2.17`; `@types/react-dom 19.2.3` |
| Web data/contracts | `@supabase/supabase-js 2.110.7`; `@supabase/ssr 0.12.3`; Zod `4.4.3`; openapi-typescript `7.13.0` |
| Web style | Tailwind CSS `4.3.3`; `@tailwindcss/postcss 4.3.3`; PostCSS `8.5.19` |
| Web unit/component quality | Vitest `4.1.10`; Vite `8.1.5`; `@vitejs/plugin-react 6.0.3`; Vite 8 native `resolve.tsconfigPaths`; jsdom `29.1.1`; Testing Library React `16.3.2`, DOM `10.4.1`, jest-dom `6.9.1`, user-event `14.6.1` |
| Web static/E2E quality | ESLint/config-next `9.39.5`/`16.2.10` (config-next plugins require ESLint 9.x); Prettier `3.9.5`; `@playwright/test 1.61.1`; `@axe-core/playwright 4.12.1` |
| Python runtime/database | FastAPI `0.139.2`; Uvicorn `0.51.0`; Pydantic `2.13.4`; settings `2.14.2`; HTTPX `0.28.1`; Psycopg `3.3.4`; psycopg-binary `3.3.4`; psycopg-pool `3.3.1` |
| Python queue/runtime | ARQ `0.28.0`; redis client `5.3.1` (ARQ requires `>=4.2,<6`); PyJWT `2.13.0`; cryptography `49.0.0`; structlog `26.1.0`; tenacity `9.1.4`; prometheus-client `0.25.0` |
| Python quality | pytest `9.1.1`; pytest-asyncio `1.4.0`; Ruff `0.15.22`; mypy `2.3.0`; coverage `7.15.2`; pip-audit `2.10.1` |
| Supabase | CLI npm package `2.109.1` |
| Railway queue | Redis image `redis:8.2.7-alpine` |

Phase 2 scaffolding verifies resolver compatibility before accepting the lockfiles. A pin may change only through a reviewed dependency change with changelog, migration, security, and rollback evidence.

pnpm 11 reads only authentication/registry settings from `.npmrc`; project policy therefore lives in `pnpm-workspace.yaml` per [pnpm 11 settings](https://pnpm.io/settings). The effective gate asserts `autoInstallPeers=false`, `strictPeerDependencies=true`, exact Node compatibility, package-manager mismatch failure, exact save prefix, and the selected resolution mode. `pnpm-lock.yaml` must record `autoInstallPeers: false`; an ignored policy file is a failed gate.

Implementation evidence on 2026-07-17 removed `vite-tsconfig-paths 6.1.1`: pinned Vite 8.1.5 reports that path resolution is native through `resolve.tsconfigPaths`, while the redundant plugin pulls deprecated `tsconfck 3.1.6`. The native setting passes the same web tests and type check with one fewer supply-chain dependency. Rollback is to restore the exact plugin pin and config only if native resolution regresses.

The same gate found `next 16.2.10` resolving vulnerable `postcss 8.4.31` (GHSA-qx2v-qp2m-jg93, Moderate, fixed in 8.5.10). pnpm therefore overrides only `next>postcss` to the already accepted direct pin `8.5.19`. Clean build/test/audit evidence is mandatory; rollback is prohibited while the advisory applies and otherwise restores Next's transitive after an upstream fixed release is accepted.

Dependency audit exits nonzero at Moderate or higher; there is no implicit severity exception. Any reviewed temporary exception requires an explicit package/advisory-scoped allowlist, owner, expiry, compensating control, and ADR/changelog entry.

### Contract authority

- FastAPI/Pydantic code is the source for the public OpenAPI document and result JSON Schema.
- The typed FastAPI problem-code inventory is the source for the generated root `x-simula-stable-problem-codes` extension.
- CI generates and commits normalized `packages/contracts/openapi.json`, JSON Schemas, and TypeScript types.
- Generated files contain a header and are never hand-edited.
- CI regenerates from a clean tree and fails on a diff.
- Supabase SQL migrations are the database authority; generated database types are derived with pinned Supabase CLI and fail CI on drift.
- `scripts/check_generated.py` compares the current normalized contract against the explicit `SIMULA_OPENAPI_BASE_REF`, defaulting locally to `HEAD`; CI checks out full history and supplies its base in both Linux and Windows gates.
- The compatibility classifier fails closed when the base cannot be read or parsed and rejects removed paths/operations, changed operation IDs or security, removed required request/response media/status/header coverage, and tightened or incompatible parameter/schema constraints. Breaking changes require `/v2` or an accepted compatibility ADR.

## Rejected options

- One package manager for both ecosystems: weak Python or Node ergonomics.
- Unpinned `latest`: irreproducible and unsafe under living platform changes.
- Hand-maintained TypeScript API models: duplicate authority and silent drift.
- GraphQL in Phase 2: no demonstrated need; adds schema and authorization surface.

## Consequences

- Two locks and two ecosystem toolchains are maintained.
- Host version drift is visible and must not redefine pins.
- Dependabot/Renovate may propose updates; CI, not automation, decides acceptance.

## Rollback

Revert manifests and both lockfiles to the last green commit. Runtime/container pins roll back with the same release. Generated contracts regenerate from that source revision.
