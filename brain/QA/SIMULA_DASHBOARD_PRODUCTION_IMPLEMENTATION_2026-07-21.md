# SIMULA dashboard and production implementation — 2026-07-21

## Outcome

SIMULA now has a rendered, authenticated organization dashboard backed by the domain API and tenant-scoped Postgres reads. Owner, editor, and viewer capabilities are enforced at the UI, API, database-role, and row-level-policy boundaries. Phase 3 methodology and Phase 4 product/reporting surfaces are integrated with the existing organization, project, run, result, provenance, cancellation, audit, feature-flag, invitation, feedback, sharing, and export flows.

The three new migrations are live on Supabase project `ywiwmczccktwzqyhzhiz`. Local and remote migration histories match through `20260720110000`.

Repository artifacts are ready for a Vercel web deployment plus Railway API, worker, and Redis services. No Vercel or Railway production deployment was performed because this checkout has no linked Vercel project, Railway project, or injected production secrets.

## Implemented product surface

- `/organizations/[organizationId]/dashboard`: live organization identity, role, permission summary, project/audience/run/report/feedback metrics, recent projects, recent runs, and recent reports.
- Owner-only dashboard controls: invitations, one-time invitation tokens, feature flags with reasons, and audit history.
- Organization creation and organization lists now enter the dashboard.
- Project and methodology workspaces use the same dashboard permission read model. Viewer controls are read-only; editor/owner creation controls remain available; owner-only calls are not issued by viewer sessions.
- Methodology registry, versioned configurations, previews, reports, comparisons, feedback, sharing, exports, team invitations, admin summary, audit, and feature-flag operations are exposed through typed API contracts.
- Landing and sign-in surfaces render from the production build. Contrast, keyboard-scroller, animation-opacity, and mobile-overflow defects found by real-browser testing were fixed.

## RBAC boundary

| Capability | Owner | Editor | Viewer |
| --- | --- | --- | --- |
| Read dashboard/projects/runs/reports | Yes | Yes | Yes |
| Create and update projects | Yes | Yes | No |
| Create stimuli/configurations/runs | Yes | Yes | No |
| Create methodology previews/reports/feedback | Yes | Yes | No |
| Manage invitations, flags, settings, audit/admin data | Yes | No | No |

Security does not depend on hidden controls. The API resolves a verified Supabase subject, connects as the least-privilege `simula_api` role, and performs tenant reads under forced RLS. Owner-only commands re-check membership role in the API/database transaction. Worker operations use the separate `simula_worker` role. Cross-tenant dashboard access returns `404`; viewer access to owner operations returns `403`.

## Database delivery

Applied to the linked Supabase project:

1. `20260720095228_phase3_methodology_registry.sql`
2. `20260720100002_phase4_mvp_product.sql`
3. `20260720110000_phase4_sharing_and_team_acceptance.sql`

Push procedure: linked history check, dry run, linked push without seed/role files, linked history recheck, remote lint, and security-advisor check. Final linked history is identical to local history through `20260720110000`; remote lint and security advisor returned zero findings.

## Deployment configuration

### Vercel web

- Root Directory: `apps/web`
- Include source files outside the Root Directory so the `packages/contracts` workspace dependency is available.
- Required public environment variables:
  - `NEXT_PUBLIC_SIMULA_API_URL=https://<railway-api-domain>`
  - `NEXT_PUBLIC_SUPABASE_URL=https://ywiwmczccktwzqyhzhiz.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Supabase publishable key>`
- Deploy the same Git SHA used for `SIMULA_RELEASE_SHA` in Railway.

### Railway API

- Config path: `/railway.api.json`
- Dockerfile: `services/api/Dockerfile`
- Public health check: `/health/live`
- The server binds Railway's injected `PORT`; local default is `8000`.
- Required variables: `SIMULA_ENVIRONMENT=production`, exact 40-character `SIMULA_RELEASE_SHA`, `SIMULA_DATABASE_URL` using `simula_api` and `sslmode=verify-full`, `SIMULA_SUPABASE_URL`, matching `SIMULA_SUPABASE_JWKS_URL`, `SIMULA_SUPABASE_PUBLISHABLE_KEY`, `SIMULA_REDIS_URL`, `SIMULA_CURSOR_SECRET`, exact Vercel origin in `SIMULA_CORS_ORIGINS`, and optional safe `SIMULA_RATE_LIMIT_KEY_PREFIX`.

### Railway worker

- Config path: `/railway.worker.json`
- Dockerfile: `services/worker/Dockerfile`
- Required variables: `SIMULA_ENVIRONMENT=production`, the same `SIMULA_RELEASE_SHA`, `SIMULA_WORKER_DATABASE_URL` using `simula_worker` and `sslmode=verify-full`, Railway `REDIS_URL` mapped to `SIMULA_REDIS_URL`, and optional `SIMULA_WORKER_METRICS_PORT=9464`.
- Plain `redis://` is accepted only for a Railway private hostname ending in `.railway.internal`; public non-TLS Redis is rejected.

Provision `simula_api`, `simula_worker`, and operator credentials outside Git. Never use the Supabase service-role key in the browser or API runtime.

## Verification evidence

- Full repository gate: formatting, ESLint, Ruff, TypeScript, mypy, generated-contract drift, claim policy, secret scan, and production Next build passed.
- Unit/component/contract tests: 63 web tests, 2 contract tests, and 257 Python tests passed; 2 platform-specific POSIX tests skipped on Windows.
- Full integration suite: 24/24 passed against clean local Supabase and Redis, including dashboard RBAC, cross-tenant isolation, worker dispatch, recovery, cancellation, rate limits, and restore drill.
- Database: clean reset passed; lint returned zero; pgTAP passed 68/68; generated database types match.
- Browser: 11/11 Playwright scenarios passed against production-built web/API/worker processes. Includes signed-out fail-closed behavior, owner dashboard mutation, terminal result, safe error, polling, failure, cancellation, desktop/mobile layout, and Axe checks.
- Containers: API and worker production Docker images built successfully and run as non-root user `simula`; Railway JSON files parse successfully.
- Supabase: linked local/remote histories match through `20260720110000`.

## Rollback

- Web presentation: redeploy the previous Vercel commit. `SIMULA_RESULT_EXPERIENCE_ENABLED=false` hides the result presentation without deleting API data.
- API/worker: redeploy the previous Railway image SHA. Keep API and worker on the same `SIMULA_RELEASE_SHA`.
- Run creation: use the existing operator run-control procedure to disable admissions before a risky rollback.
- Database: migrations are forward-only. Do not delete live tables or rewrite migration history. Restore from a verified backup/PITR target, or ship a reviewed compensating migration.

## External release gates still open

- Vercel and Railway projects/domains/secrets are not linked in this checkout, so hosted application behavior is not claimed.
- Production database-role passwords and Railway Redis are not provisioned here.
- Independent human screen-reader evidence and enforceable required-check governance remain formal phase-exit evidence gaps. Automated Axe/keyboard checks do not replace that human evidence.
- Production authorization, DNS/CORS final values, alert routing, and post-deploy browser/console verification must be completed by the deployment owner.

Implementation and repository readiness are complete. Formal production promotion remains blocked until these external controls and human evidence exist.
