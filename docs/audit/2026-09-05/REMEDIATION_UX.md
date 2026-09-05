# UX remediation evidence — 2026-09-05

## Scope and implementation

Public/admin subtask source scope: web homepage and landing modules, auth
context/proof styling, public data-use page, admin dashboard/sign-in/global
styles, and landing browser tests. Shared web globals, sidebar,
organization/project workspaces, campaign lab, and production deployment remain
owned by the primary/other agent. This document does not claim all routes were
exercised.

The landing route now presents a direct campaign-research task, entry link,
three-step explanation, reader-controlled five-step workflow, and filterable
evidence list. Decorative hero media, cinematic proof, pinned interludes, and
scroll-driven workflow state are no longer rendered. Warm neutral surfaces and
one green accent replace competing colors. Experimental and non-representative
boundaries remain visible.

Auth copy uses saved drafts, visible limits, and run history. `/data-use` is
explicitly product operating information, not a privacy policy, service terms,
or compliance certification. Its limits derive from
`brain/Security/PRIVACY_MODEL.md` (approved-for-prototype, PROPOSED),
`brain/Data/DEMO_DATA_POLICY.md`, and inspection of the organization deletion
controller. It does not assert completed hosted deletion, account deletion,
retention guarantees, legal roles, or processing regions. The landing footer and
auth context link to this page.

Admin inventory now supports name/ID search, status filtering, 20-row local
pages, clear-filter recovery, and explicit loaded-inventory limits. Existing API
fetch caps inventory at 100; the UI discloses when total metric count exceeds
loaded rows rather than implying global search. Auth/API role enforcement is
preserved. No user data was created/deleted by this subtask.

## Verification ledger

| Status               | Command/evidence                                                                          | Result and limit                                                                                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PASSED               | `pnpm --filter @simula/admin test`                                                        | 4 files, 12 tests; includes search/status/no-match/pagination regressions. Later loaded-inventory-limit regression not yet run.                                                                                                 |
| PASSED               | `pnpm --filter @simula/admin typecheck`                                                   | `tsc --noEmit`; before final inventory disclosure text/test                                                                                                                                                                     |
| PASSED               | `pnpm --filter @simula/admin lint`                                                        | `eslint . --max-warnings=0`; before final inventory disclosure text/test                                                                                                                                                        |
| PASSED               | `pnpm --filter @simula/web exec vitest run src/app/landing --pool=forks --maxWorkers=1`   | 2 component tests: evidence filter and workflow selection                                                                                                                                                                       |
| PASSED               | `pnpm --filter @simula/web exec eslint src/app/page.tsx src/app/landing --max-warnings=0` | Landing source lint; before data-use/auth follow-up                                                                                                                                                                             |
| PASSED               | `pnpm exec playwright test tests/e2e/landing.spec.ts --workers=1`                         | 4 tests in 20.9s: desktop/mobile landing axe + overflow + workflow interaction, skip focus, sign-in shell axe. Before final auth changes and data-use.                                                                          |
| PASSED               | Direct Node Prettier CLI                                                                  | Final data-use/auth/homepage/landing test formatting; later admin inventory-disclosure edits pending format                                                                                                                     |
| FAILED / INTERRUPTED | `node node_modules/@playwright/test/cli.js test tests/e2e/landing.spec.ts --workers=1`    | Expanded 5-test suite: first 3 failed against HTTP 500, remaining interrupted. Browser console directly reported `Cannot find module '@sentry/nextjs'` during dependency relinking. Requires install/server recovery and rerun. |
| NOT RUN              | Real authenticated owner/editor/viewer/superadmin journeys                                | Component fixtures do not prove authenticated runtime behavior                                                                                                                                                                  |
| NOT RUN              | Production deployment/smoke tests                                                         | No deployment performed by this subtask                                                                                                                                                                                         |

## Screenshots

- `output/playwright/landing-desktop.png`: 1440×1000 viewport, visually
  inspected. Shows updated hero and workflow beginning. Valid before later
  footer/auth work.
- `output/playwright/landing-mobile.png`: 390×844 viewport. Captured; route also
  passed mobile overflow/axe test.
- `output/playwright/sign-in-mobile.png`: earlier auth styling, stale after
  follow-up changes; not final visual acceptance.
- `output/playwright/sign-in-desktop.png`: later capture was overwritten with
  the dependency-error screen; do not present as a successful final screenshot.
  Refresh after recovery.

Initial browser console contained React DevTools/HMR messages only. The later
500 was directly linked to missing Sentry module; this document does not infer
all browser failures are environmental without that evidence.

## Independent source review of shared/unchanged UX

Reviewed current `globals.css`, `workspace-sidebar.tsx`, organization directory,
project workspace initial/error paths, methodology workflow/permissions,
evidence workspace, and run-workspace permission/error state references. This is
partial code coverage, not a whole-product runtime audit.

1. **P2 — new global primary-button selector overrides destructive visual
   intent.** `globals.css` sets a green background for nearly all
   `.workspace-main button:not(...)` controls. Its specificity exceeds module
   `.dangerButton`, including the organization deletion button in
   `organizations/[organizationId]/dashboard/owner-controls.tsx`. Reported to
   primary for explicit destructive exclusion/semantic selector. Runtime color
   verification pending.
2. **P2 — evidence project-context failures are silently ignored
   (pre-existing).** `projects/[projectId]/evidence/workspace.tsx` catches
   failed `getProject` without error/retry state, then renders lab content with
   missing organization navigation. A permission/network failure is
   indistinguishable from successful initialization. Reported to primary; not
   edited by this subtask.
3. **P2 — project initial network errors are framed as access failures
   (pre-existing).** `projects/[projectId]/project-workspace.tsx` renders
   “unavailable to the current account” for all initial failures and offers only
   directory navigation. Transient service errors deserve retry and distinct
   copy. Reported to primary; not edited here.
4. **P2 — capped admin inventory could imply global search.** Read
   `loadPlatformAdminDashboard`: request uses `organization_limit=100`. Fixed
   locally by marking counts loaded and displaying total-versus-loaded
   disclosure. New regression awaits test tooling recovery.

Positive source observations: mobile sidebar uses button/expanded state and
removes closed menu from layout; organization search explicitly says loaded
organizations and preserves Load more; methodology gates mutation controls by
API permission and provides initial-load retry; run workspace separates
result/refinement errors and retains API-derived permission checks. These
observations do not prove keyboard/role behavior until corresponding runtime
checks pass.

## Remaining acceptance work

Recover dependencies and restart local server; rerun admin suite/type/lint and
all 5 landing/data-use browser tests; refresh final sign-in desktop/mobile
screenshots. Verify authenticated route/role states described in
`REMEDIATION_ROUTES.md`, resolve primary-owned P2 findings, and record actual
results rather than inferring from component fixtures.

## Follow-up: real server inventory pagination

The earlier local-only paging limitation has now been replaced. Python
platform-admin accepts bounded `organization_offset` (0–1,000,000) alongside
limit and uses parameterized `LIMIT/OFFSET` after the existing superadmin check.
Admin URL `?offset=120` loads that server page in 20-row increments, with
total-count-based Next/Previous links. Search/status filtering is explicitly
page-local. A 30-second fetch abort deadline and actionable retry error text
prevent an unbounded inventory wait. No migration or response schema change is
needed; primary must regenerate the query contract.

- PASSED:
  `.venv/Scripts/python.exe -m pytest services/api/tests/test_platform_admin_routes.py -q`
  — 8 tests, including offset beyond100, invalid bounds and non-admin denial
  without read.
- PASSED: direct admin Vitest — 22 tests, including URL page links beyond100,
  local filtering retaining server navigation, offset normalization, deadline
  attachment, and rejected timeout.
- PASSED: direct admin TypeScript `--noEmit` and ESLint `--max-warnings=0`.
- PASSED: Python Ruff formatting/check for touched route and test.
- NOT RUN: populated database offset integration, live authenticated admin
  pagination, hosted endpoint deployment, regenerated contract checks
  (primary-owned).

This supersedes the earlier statement that admin paging cannot reach beyond the
first100 records. A bounded maximum offset remains a resource safeguard; this is
offset pagination over a live ordered inventory, not snapshot-isolated
navigation.

Final follow-up verification: direct admin Vitest rerun PASSED all 23 tests
across 4 files (99.13s); direct `tsc --noEmit` PASSED after final source
changes. The intermediate22-test rerun failed one stale empty-state fixture
(zero rows with nonzero total); the fixture now models total0, and an additional
test verifies an empty page with a nonzero total offers first-page recovery. No
assertion was suppressed. Final tests cover both states.

## Follow-up: project and run review flow

Added contextual project return links and result/history/refinement shortcuts on
run pages; anchors are shown only when the corresponding result presentation is
enabled and loaded. A failed initial run read now ends the loading/busy
presentation and explains recovery. Before run metadata loads the heading does
not assert that the run is a deterministic demo.

Project settings use native disclosure so drafting is not preceded by a large
edit form. The objective remains visible, and the checksum has a separate
verification disclosure while audience limitations remain visible. Project
section shortcuts point to message drafts, limits, and settings. Viewer
empty-state copy asks an editor to add drafts rather than instructing a viewer
to perform an unavailable action. Existing retry/error recovery from the primary
agent is preserved.

PASSED: direct Vitest focused8 tests across3 files (`project-workspace`,
`run-workspace`, `run-status-panel`), including role-dependent edit/empty state,
disclosure visibility, actionable load failure, contextual navigation, and
removing result links when presentation is disabled. PASSED: focused ESLint.
Browser verification of these authenticated views is NOT RUN. An initial
new-test run exposed retained DOM between tests; explicit cleanup isolates the
project role cases, followed by all8 passing.

## Actual disposable admin pagination beyond100 - final follow-up

PASSED: dedicated synthetic local Auth superadmin,121 new namespace-scoped
fixture organizations and existing20 baseline organizations on main disposable
Supabase56322. Existing campaign fixtures preserved. Real API offset0/100/120
returned distinct20-row pages and honest total141. Real admin3101 normal login
traversed five Next links to offset100, reload retained records, no-match
filtering retained Next to120, and Previous returned100. No network mocking or
production role changes. Evidence:
output/playwright/live-admin-pagination-verification.json and
admin-pagination-1440.png/admin-pagination-390.png.

Mobile390 initially reproduced document scrollWidth921: absolutely positioned
screen-reader table label escaped the unpositioned scroll container.
apps/admin/src/app/globals.css now positions .table-frame relatively, containing
the label while preserving its1056px inner table scroll area. Final1440/390 flow
has zero document overflow, Axe violations and page errors. Direct admin tests23
PASSED; typecheck PASSED. Initial harness used table instead of named region and
implicit browser context unsupported by Axe; corrected those harness assumptions
before the successful real flow. No application test assertion was removed.

Fixture metadata/credentials remain ignored in
tmp/admin-pagination-private.json; do not commit or print it. Dedicated admin
server session32359 uses port3101. Fixture121 organizations and local-only admin
assignment are retained for repeatability; campaign data untouched. Hosted
pagination remains NOT RUN.

## Superseding local backtest and final evidence flow

PASSED actual local API/worker preregistration, later independent source
admission, real custodian file upload, bound result and refresh. Bound and
legacy backtest result reads reject revoked source with422; fixture source
restored afterward. Report/calibration/backtest at1440/390 total six views have
zero Axe violations, document overflow or page errors.47focused Python
and28Campaign Lab tests pass. Evidence:
output/playwright/live-bound-backtest-api-verification.json,
live-final-evidence-verification.json and live-backtest-source-rights.json (also
copied into this audit directory by primary).

This supersedes earlier actual-backtest-flow pending statements only for the
exercised synthetic engineering fixture. Observed result is Scoped historical
comparison with campaignCount1; independent scientific validity is not
established. Registry approval remains a separate administrator process. New
Campaign Lab emergency-pause guard/migration is an open rollout blocker; no new
application production deployment is claimed.
