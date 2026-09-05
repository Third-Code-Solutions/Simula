# Production Deployment Report

> Historical snapshot retained. Local-green/no-mutation statements below
> describe that decision only. Current new application promotion remains
> pending; Auth/Git/Redis changes were separately verified. See
> [current tracker](2026-09-05/REMEDIATION_TRACKER.md) and
> [targets](2026-09-05/RELEASE_TARGETS.md).

Status: **RELEASE WITHHELD — LOCAL GREEN, HOSTED ADMISSION NOT GREEN**

## Decision

No production mutation was performed. The repaired working tree is locally
verified, but the release contract requires one immutable and
rollback-compatible source, image, schema, rollout, and configuration identity.
Current evidence does not satisfy that contract, so deployment correctly failed
closed.

This is not an agent failure or blocker: all five principal agents completed
with `SUCCESS / PASS`.

## Target topology

- Web/admin: Vercel
- NestJS API, dispatcher, Python worker, private AI engine: Railway
- PostgreSQL/Auth/Storage: Supabase
- CI/release provenance: GitHub Actions and Sigstore

## Green local evidence

- Exact toolchain check, root quality gate, JavaScript/Python SCA, tracked and
  working-tree secret scans
- M1 control plane and contracts
- M2 API/database: two clean resets, DB lint, 404 pgTAP assertions, API and DB
  integration suites
- P2 real-browser E2E: 11 tests
- Full Python integration suite: 29 tests
- Web/admin production builds and all generated-contract checks
- Independent final implementation and integration-test semantic signoff

## Hosted admission failures

1. **Release identity is split.** The audited changes are in a dirty working
   tree and have no clean immutable commit; existing Vercel/Railway/source
   labels and rollout IDs do not resolve to one audited revision.
2. **Required origin variables are absent.** Vercel web production lacks
   `NEXT_PUBLIC_SIMULA_API_V1_URL`, `NEXT_PUBLIC_SIMULA_API_V2_URL`, and
   `NEXT_PUBLIC_SIMULA_WEB_URL`; admin lacks the v1/v2 values; required GitHub
   repository variables are not configured.
3. **Schema is not at the repaired head.** Migrations `20260815100000`,
   `20260824010000`, and `20260824020000` pass locally but the repaired
   migration set was not deployed.
4. **Hosted security/governance is open.** Supabase leaked-password protection
   is disabled; hosted advisors reported permissive-policy warnings that the
   local consolidation migration addresses; branch protection is absent; PITR is
   not enabled/proven.
5. **Rollback is not proven.** No compatible whole-system rollback
   bundle/manifest has been demonstrated for the repaired revision.
6. **Authenticated repaired journeys are unverified in production.** Public
   health/browser checks are green, but the repaired code is not live.

## Hosted read-only state

- Supabase: `ACTIVE_HEALTHY`, PostgreSQL 17.6; backups green.
- Railway: no service errors in the inspected 72-hour window.
- Public web/admin: desktop/mobile landing and sign-in health/accessibility
  checks passed.
- Existing governed artifact inventory: no campaign evidence runs, feedback
  records, or current report artifacts; one legacy report run is quarantined.

## Exact release sequence

1. Isolate only the audited changes from unrelated user artifacts and create a
   reviewed immutable release commit.
2. Configure and validate the exact Vercel/GitHub origin variables without
   exposing values.
3. Run required CI and tag-release gates, retaining commit, image digest, SBOM,
   signature, and provenance evidence.
4. Resolve hosted leaked-password, RLS-advisor, branch-protection, PITR, and
   backup/restore admission items.
5. Dry-run migration history against the exact target, then deploy the verified
   forward migrations through the release workflow.
6. Deploy all web/API/worker/dispatcher/AI components from the same signed
   identity.
7. Verify live version, health/readiness, authenticated critical journeys,
   logs/alerts, rollback, and restore. Label production green only after all
   pass.

## Rollback

No rollback was attempted because no deployment occurred. A future release must
identify the last compatible signed application bundle and an approved database
recovery/forward-fix plan before mutation.
