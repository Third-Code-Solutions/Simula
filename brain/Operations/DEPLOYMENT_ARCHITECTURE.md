---
title: SIMULA Deployment Architecture
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-17
owner: Platform lead
classification: PROPOSED
source_of_truth: true
---

# SIMULA Deployment Architecture

> Phase 1 approved code/deployment design. No external resources are provisioned.

## Baseline

- Vercel: Next.js web.
- Railway: FastAPI API, ARQ workers/dispatcher, private Redis queue/supporting runtime services.
- Supabase: PostgreSQL, Auth, Storage, RLS, migrations; pgvector only with proven need.

## Environments

Local, test, preview, staging, and production need separate secrets, tenant/data boundaries, URLs, provider policies, and destructive-operation controls. Preview environments must not receive production data or unrestricted production credentials.

## Promotion requirements

- Reproducible builds and pinned dependencies.
- Migration compatibility and rollback/recovery review.
- Contract/client compatibility.
- Model/prompt/method/data configuration manifest.
- Green tests and security scans.
- Health/readiness checks and observability.
- Progressive rollout or feature flags for risky behavior.
- Explicit rollback target and owner.

## External-state rule

No production deployment or external production resource modification without explicit authorization.

## Decisions and remaining production gates

[[../Decisions/ADR-0008-ENVIRONMENTS-DEPLOYMENT-AND-MIGRATIONS|ADR-0008]] defines topology, environment isolation, secrets, builds, migrations, promotion, and rollback. Railway Redis/ARQ plus Supabase transactional outbox is selected by ADR-0006. Export storage is deferred by ADR-0010. Regions, final residency/contracts, production secret authority, provider processing, and production RPO/RTO remain blocking production decisions.

## Public platform constraints

- Vercel Functions remain duration-bounded; durable simulation work belongs on the queue/worker path (E-4002).
- Railway API and worker are independent services; internal traffic can use runtime private networking (E-4003, E-4004).
- Supabase application schemas remain outside Data API exposure; Railway uses separate least-privilege TLS Postgres roles while browser credentials reach Auth only (E-4005, E-4006, E-4025).
- Railway Redis/ARQ is the selected queue transport with Supabase transactional outbox and Postgres-authoritative state (E-4023, E-4024); exactly-once execution is not assumed.

Living docs/changelog and registry pins were rechecked on 2026-07-17 in ADR-0002. No external resources have been provisioned.
