---
title: ADR-0008 Environments Deployment and Migrations
status: accepted
created: 2026-07-17
updated: 2026-07-17
owner: Platform lead
classification: PROPOSED
source_of_truth: true
---

# ADR-0008 — Environments, Deployment, and Migrations

## Context

The mandated platforms have different lifecycles and trust boundaries. Preview convenience must not expose production data or secrets. Database rollback is not equivalent to application rollback.

## Decision

### Topology

```text
browser
  ├─ HTTPS → Vercel / Next.js web (public)
  ├─ HTTPS → Railway / FastAPI API (public, exact CORS origins)
  ├─ HTTPS → Supabase Auth only (URL + publishable key)
  └─ never → application Data API/domain schema/worker/database secret/provider

FastAPI → Supabase Auth JWKS; verify user JWT
FastAPI → TLS Supabase Postgres direct or Supavisor session mode per this ADR as `simula_api`; transaction-local verified claims + RLS
FastAPI → private Railway Redis enqueue using deterministic job ID
worker  → private Railway Redis consume + TLS Supabase Postgres as `simula_worker`; named private helpers only
worker  → approved model provider only after Phase 3 gate
```

Railway worker has no public domain. API and worker are separate services/images/commands and may use Railway private DNS for future internal health/control traffic. Simulation work never runs as a Vercel post-response job (E-4002–E-4004).

Supabase connection/role evidence: E-4025. Psycopg runtime/pool evidence: E-4026.

### Environment isolation

| Environment | Data/resources | Promotion authority |
|---|---|---|
| Local | Local Supabase/Docker; authored fixtures | Developer |
| CI | Ephemeral local services; authored fixtures | CI workflow |
| Preview | Dedicated/branch non-production Supabase resource if provisioned; synthetic only; 7-day cleanup | PR workflow |
| Staging | Separate Supabase/Vercel/Railway resources; synthetic or separately approved research fixtures | Release owner |
| Production | Separate projects/accounts/secrets/data/telemetry | Explicit user authorization plus Phase 7 gate |

No environment shares database, Auth users, storage buckets, runtime database credential, provider secret, encryption material, or service URL with production. Preview/staging cannot read production backups or logs.

### Secrets and configuration

- Commit `.env.example` with names and safe descriptions only. `.env*` secrets are ignored and secret-scanned.
- Browser variables are limited to public API URL, Supabase URL, and publishable key. A `NEXT_PUBLIC_*` variable is assumed public.
- Railway API holds JWKS/issuer/audience config, private Redis URL, and TLS database URL for dedicated `simula_api`; worker holds Redis URL and a separate TLS database URL for `simula_worker`. Neither receives `postgres`, schema-owner, migration-owner, or Supabase service-role credentials. No provider credential exists in Phase 2.
- Runtime roles/password placeholders and grants are migration-controlled; environment-specific strong passwords are injected/rotated through a privileged bootstrap step and secret store, never committed or printed. Local/CI use disposable fixture passwords only.
- Persistent Railway services use the Supabase direct connection when verified IPv6 reachability exists, otherwise Supavisor session mode; transaction mode is not selected for the persistent pool. TLS verification is mandatory. API pool maximum is 10 connections; worker/dispatcher maximum is 4.
- Validate configuration at startup with environment-specific schemas; fail readiness on missing/unsafe values.
- Rotation runbooks cover Supabase signing/API keys, database/worker credentials, provider keys, and deployment tokens. CI uses OIDC or least-lived tokens where supported.

### Builds and promotion

- Web, API, and worker build independently from pinned lockfiles and immutable commit SHA.
- Images use exact runtime tags and non-root users; generated SBOM and dependency scan attach to release evidence.
- Promotion reuses the tested artifact; it does not rebuild from a mutable branch.
- Readiness checks dependencies needed for new work; liveness checks process only.
- Risky behavior uses server-owned flags default off. Flags do not bypass schema, authorization, or migration compatibility.

### Database migrations

- Ordered SQL in `supabase/migrations` is authoritative. Declarative/experimental schema tooling is not used.
- Migrations create default-deny `simula_api`, `simula_worker`, and NOLOGIN definer-owner roles/grants without embedding hosted passwords. A separate migration identity owns schema objects and is unavailable to runtime services.
- Local `supabase/config.toml` and hosted API settings exclude `api`/`private` from Data API schemas; any required `public`/platform schema contains no SIMULA object and has revoked defaults. Deployment gate queries settings/catalogs and probes with `anon` plus a real authenticated JWT before API startup.
- Local gate: start/reset from zero, lint database, run pgTAP/RLS tests, generate types, and reset again.
- Hosted gate: compare migration history, inspect dry run, backup/restore readiness, then apply once through a single migration job. Application deploys use expand → migrate/backfill → contract.
- Destructive changes require evidence that old app versions no longer access the object, a restore/recovery path, and explicit production authorization.
- Rollback normally means application rollback plus forward corrective migration. Down migrations are local/test aids, not the production recovery plan.
- Supabase CLI is pinned by ADR-0002; changelog breaking changes are reviewed before bump.

### External-state rule

This ADR authorizes code/configuration only. It does not authorize creating paid resources, changing live projects, deploying production, or uploading data. Staging provisioning occurs in Phase 6 only when credentials and authority exist. Production remains blocked after Phase 7 until explicit authorization.

## Rejected options

- One Supabase project for preview/staging/production: credential and data crossover.
- Worker endpoint exposed publicly: unnecessary attack surface.
- Automatic production migration on every branch deploy: unsafe concurrency and rollback.
- Mutable `latest` images/actions: unreproducible.

## Consequences

- Hosted preview requires an isolated data resource or is marked unavailable rather than pointed at staging/production.
- Database changes need backward-compatible sequencing.
- Three deployable artifacts increase release coordination but isolate failure domains.

## Rollback

Disable new runs, roll web/API/worker to prior compatible artifact, then apply a reviewed forward database correction or restore under [[../Operations/BACKUP_AND_RESTORE|Backup and Restore]]. Redis loss replays pending/due outbox and invokes ADR-0006's bounded reconciliation for unresolved queued plus expired/no-lease stale `running`/`retrying` runs; active leases remain untouched. Queue contract changes use versioned ARQ names.
