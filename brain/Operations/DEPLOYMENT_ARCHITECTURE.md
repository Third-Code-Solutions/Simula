---
title: SIMULA Deployment Architecture
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-30
owner: Platform lead
classification: PROPOSED
source_of_truth: true
---

# SIMULA Deployment Architecture

## Baseline

- Vercel: Next.js web.
- Railway: target NestJS control plane/BullMQ dispatcher, Python worker, private
  FastAPI behavioral engine, private Redis, and supporting runtime services.
- Rollback: FastAPI API plus ARQ remains available until the NestJS/BullMQ
  database-backed equivalence and recovery gates pass.
- Supabase: PostgreSQL, Auth, Storage, RLS, migrations; the ADR-0013 pgvector
  seam stays inactive until a rights-cleared model/corpus and executed
  retrieval, RLS, and query-plan gates exist.

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

[[../Decisions/ADR-0008-ENVIRONMENTS-DEPLOYMENT-AND-MIGRATIONS|ADR-0008]] defines topology, environment isolation, secrets, builds, migrations, promotion, and rollback. ADR-0011 selects BullMQ as the target Railway transport and retains ADR-0006's ARQ path as rollback. PostgreSQL transactional outbox state plus the E-5064 durable transport fence remain authoritative during cutover. Export storage is deferred by ADR-0010. Regions, final residency/contracts, production secret authority, provider processing, and production RPO/RTO remain blocking production decisions.

## Public platform constraints

- Vercel Functions remain duration-bounded; durable simulation work belongs on the queue/worker path (E-4002).
- Railway API and worker are independent services; internal traffic can use runtime private networking (E-4003, E-4004).
- Supabase application schemas remain outside Data API exposure; Railway uses separate least-privilege TLS Postgres roles while browser credentials reach Auth only (E-4005, E-4006, E-4025).
- Railway Redis/BullMQ is the target queue transport; ARQ is the rollback
  transport. Supabase transactional outbox state and the singleton durable
  transport authority remain PostgreSQL-authoritative; exactly-once transport
  delivery is not assumed (E-4023, E-4024, E-5064).

Living docs/changelog and registry pins were rechecked on 2026-07-17 in ADR-0002. No external resources have been provisioned.

## Target manifests

- `railway.control-plane.json` builds the non-root NestJS image from
  `apps/api/Dockerfile`, starts telemetry before application imports, and probes
  dependency-aware readiness. Production startup requires the exact database
  migration head, release bundle digest, rollout UUID, verified Sigstore bundle
  digest, and exact signing-workflow run.
- `railway.dispatcher.json` reuses the same immutable image with the dedicated
  dispatcher entry point. It exposes liveness plus pass-staleness readiness,
  uses zero deployment overlap, and must have exactly one active replica only
  while the durable queue fence is `bullmq`.
- `railway.ai-engine.json` builds the non-root private FastAPI behavioral engine
  and probes provider-registry readiness. It uses the same production release
  admission contract.
- `railway.worker.json` retains the Python worker with BullMQ as the target
  transport and ARQ as an explicit rollback mode. BullMQ and the private engine
  are production-admissible only with the same release evidence.
- `railway.api.json` retains the FastAPI rollback API and rejects readiness
  unless the database reports the compiled migration head with forced RLS.
- Vercel remains the target web host. `railway.web.json` and the pinned
  standalone web image are retained as a tested alternate host.

The web image accepts the public environment, release, telemetry-enable, and
Sentry DSN build values. Sentry source-map upload remains disabled unless all
three build-only credentials are present. The standalone runtime copies both
`.next/static` and `apps/web/public`; E-5065 exercises the assembled local
standalone tree and guards the public-asset copy in deployment tests. No
manifest proves provider provisioning, secret injection, runtime connectivity,
or deployment.

## Production admission contract

Every deployed server runtime requires
`SIMULA_DATABASE_MIGRATION_HEAD=20260801150001`. Production also requires:

- `SIMULA_PRODUCTION_ADMISSION_ENABLED=true`;
- one lowercase UUIDv4 `SIMULA_PRODUCTION_ROLLOUT_ID`;
- the verified archive digest in `SIMULA_RELEASE_BUNDLE_SHA256`; and
- the verified Sigstore bundle digest in
  `SIMULA_RELEASE_SIGSTORE_BUNDLE_SHA256`; and
- the exact `github.com/Third-Code-Solutions/Simula/actions/runs/<id>` URL in
  `SIMULA_RELEASE_PROVENANCE_URL`.

The database readiness function independently reports the applied head and
whether every `api` and `private` table has forced RLS. An environment variable
alone cannot make readiness green.
