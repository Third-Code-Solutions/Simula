# SIMULA Dashboard Production Audit — 2026-07-22

## Result

**Local release candidate: PASS.**

The authenticated dashboard is implemented as a real API-backed product surface. The landing header and authenticated workspace no longer expose direct `Context map`, `Method`, or `Boundaries` navigation. No static dashboard metrics or mock administrative records were introduced.

**Hosted technical release: PASS at `960e2db23d80dadedaf7d125253dfa6b5e227be8`.**

- Vercel web deployment: `dpl_63FDK9qsakxqd3AXWY6qqXTysELo`, status `Ready`.
- Railway API deployment: `57821c7e-ae65-43c2-8ce9-33b5fd179b43`, status `SUCCESS`.
- Canonical URL: `https://simula-iota.vercel.app`.
- Web and API health metadata report the same exact release SHA.

## Delivered surface

- Professional responsive organization directory with loading, empty, failure, retry, create, and paginated states.
- Organization dashboard backed by the existing organization dashboard API: project, run, report, feedback, run-health, workflow-coverage, and recent-activity data.
- Real owner controls for invitations and feature flags, plus audit-event visibility.
- Role-aware owner/editor/viewer presentation. Owner-only APIs are requested only for owners.
- Direct navigation removed from both the public header and authenticated workspace sidebar.
- Accessible landmarks, semantic progress values, keyboard-visible controls, reduced-motion handling, responsive cards, and long-name wrapping.
- Experimental/non-representative product boundary remains visible.

## Changed dashboard files

- `apps/web/src/app/landing/site-header.tsx`
- `apps/web/src/app/landing/hero.module.css`
- `apps/web/src/app/workspace-sidebar.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/organizations/organizations-workspace.tsx`
- `apps/web/src/app/organizations/organizations.module.css`
- `apps/web/src/app/organizations/[organizationId]/dashboard/organization-dashboard.tsx`
- `apps/web/src/app/organizations/[organizationId]/dashboard/dashboard-overview.tsx`
- `apps/web/src/app/organizations/[organizationId]/dashboard/owner-controls.tsx`
- `apps/web/src/app/organizations/[organizationId]/dashboard/dashboard.module.css`

## Production hardening

- Declared production web build metadata as Turbo inputs to keep cached artifacts release-correct.
- Fixed API structured logging so redacted foreign HTTP logs retain formatter metadata until rendering; the regression test reproduced the production `KeyError: '_record'` before the fix and passed afterward.
- Accepted the project-scoped `simula_api.<project-ref>` Supavisor role while retaining the least-privilege role prefix check.
- Added the publishable API key to the Supabase Auth readiness probe.
- Installed the pinned Supabase production CA in the non-root API image.
- Corrected Railway rollout-window values to the numeric config schema and added configuration tests.

## Automated verification

Executed from `D:\thirdcode\simula` with repository-pinned pnpm `11.13.1` and isolated verified uv `0.11.19`.

| Gate | Result |
| --- | --- |
| Full `pnpm verify` | PASS, exit 0 |
| Supabase schema lint | PASS, no schema errors |
| pgTAP database suite | PASS, 68/68 |
| API suite in original release gate | PASS, 71/71 |
| Post-fix API + deployment regression suite | PASS, 77/77 |
| Database/API boundary subset | PASS, 5/5 |
| Browser E2E | PASS, 11/11 |
| Web unit/component tests | PASS, 72/72 across 23 files |
| Python non-integration suite | PASS, 263 passed; 2 documented Windows/POSIX skips |
| Full integration suite | PASS, 24/24 |
| ESLint + Ruff | PASS |
| TypeScript + mypy | PASS; mypy checked 95 source files |
| Next.js optimized production build | PASS |
| Generated OpenAPI contracts | PASS |
| Forbidden-claim policy | PASS, 117 files scanned |
| Secret baseline | PASS, 547 text files scanned |
| pnpm audit | PASS, no known vulnerabilities |
| pip-audit | PASS, no known vulnerabilities; three editable local packages skipped as configured |
| `git diff --check` | PASS |
| API production Docker image | PASS; pinned base images, non-root runtime, pinned Supabase CA included |

The E2E gate includes desktop/mobile landing accessibility, keyboard skip navigation, protected-route and lost-session fail-closed behavior, secured dashboard workflow, safe error handling, run polling, failed-run handling, and cancellation.

## Live local browser verification

- Authenticated through local Supabase using the disposable E2E fixture.
- Organization directory requested real organization data successfully.
- Dashboard requested real dashboard, invitation, feature-flag, and audit-event endpoints successfully.
- Live fixture showed real project/run counts and workflow activity.
- Desktop and 390 px mobile layouts inspected.
- Browser console: zero errors and zero warnings on the final dashboard checks.
- Mobile document width stayed within the viewport; no horizontal overflow.
- Automated Axe coverage passed in the secured dashboard workflow.

## Hosted production verification

- `GET https://simula-iota.vercel.app/api/health`: 200, `production`, release `960e2db...`.
- Railway `/health/live`: 200, `ok`, release `960e2db...`.
- Railway `/health/ready`: 200, `ready`, release `960e2db...`.
- Exact-origin CORS preflight from `https://simula-iota.vercel.app`: 200 with the expected origin and methods.
- Signed-out domain API request: 401 with the expected CORS origin; no tenant data returned.
- Signed-out `/organizations` navigation redirects to `/sign-in?next=%2Forganizations` before tenant API access.
- Public landing header contains only SIMULA, Sign in, and Open workspace; the removed direct navigation is absent.
- Desktop and 390 px mobile production pages have meaningful content, no framework overlay, and no horizontal overflow.
- Fresh production browser sessions report zero console errors and zero warnings.
- Post-deploy Railway window contains no error-level log, `KeyError`, or HTTP 5xx entry. Vercel reports no error log entry for the final deployment.

## Remaining verification and governance limits

The authenticated production write flow was not executed because no production test credential was provided; the same flow passed locally against disposable Supabase in the 11-test browser gate. No production user or tenant data was fabricated for this audit.

GitHub Actions jobs for the release SHA did not start any step. GitHub reports that recent account payments failed or the spending limit must be increased. This is an external CI-governance blocker, not a failing repository test. Branch protection is also unavailable on the current private-repository plan.

Independent human screen-reader evidence, named production alert ownership, final legal/privacy decisions, and production retention/RPO/RTO approval remain outside this technical deployment audit.
