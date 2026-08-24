# Test and Verification Evidence

Audit baseline: `origin/main` at `46b051ff6ecd2fce6e48a58f18c444f005a993a4`
Final local result: **PASS**
Production deployment: **NOT RUN — RELEASE ADMISSION WITHHELD**

All commands used the repository-pinned toolchain path and
`UV_PYTHON=D:\thirdcode\simula\.venv\Scripts\python.exe`.

## Final gates

| Date       | Command/check                                           | Result | Evidence                                                                                                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-24 | `pnpm toolchain:check`                                  | PASSED | Node 24.18.1, pnpm 11.13.1, Python 3.14.7, uv 0.11.19, Supabase CLI 2.109.1                                                                                                                                                                                                                                                    |
| 2026-08-24 | `pnpm check`                                            | PASSED | Formatting/lint; TypeScript and mypy over 171 source files; Nest 42 suites/258 tests; web 42 files/150 tests; admin 10; contracts 7; Python 599 passed, 3 host-specific skipped, 29 integration deselected; web/admin production builds; generated contracts; policy claims over 184 files; tracked-secret scan over 756 files |
| 2026-08-24 | `pnpm security:secrets:working-tree`                    | PASSED | 1,519 working-tree text files scanned; no credential material reported                                                                                                                                                                                                                                                         |
| 2026-08-24 | `pnpm security:sca`                                     | PASSED | JavaScript and Python dependency audits found no known vulnerabilities; Python tooling emitted non-failing no-deps/hash advisory text                                                                                                                                                                                          |
| 2026-08-24 | `pnpm verify:m1-control-plane`                          | PASSED | Nest 258 unit tests plus 10 integration tests, generated OpenAPI, and contract checks                                                                                                                                                                                                                                          |
| 2026-08-24 | `pnpm verify:m2-api`                                    | PASSED | Two clean database resets; DB lint exit 0 with expected unused-parameter warnings in a fail-closed function; 23 pgTAP files/404 assertions; 134 API tests; 8 database/API integrations; generated DB types/contracts                                                                                                           |
| 2026-08-24 | `pnpm verify:p2:e2e`                                    | PASSED | 11 real-browser desktop/mobile accessibility and critical-flow tests, including skip focus, auth redirect/fail-close, dashboard/result/error/poll/failure/cancel states                                                                                                                                                        |
| 2026-08-24 | `pnpm test:integration`                                 | PASSED | 29 integration tests passed after updating one stale report test to the intended governed 409/410 fail-closed contract; 602 tests deselected by the integration profile                                                                                                                                                        |
| 2026-08-24 | Focused independent matrix                              | PASSED | 147 focused Python, 24 Nest, 29 web, 6 admin, contracts, policy, SCA, and both secret-scan scopes                                                                                                                                                                                                                              |
| 2026-08-24 | Independent semantic review of final integration change | PASSED | Correct `409 version_conflict` report creation/comparison, `410 unsupported_scope` retired reads/exports/sharing, zero dashboard reports, and no stale share-audit expectations                                                                                                                                                |
| 2026-08-24 | `git diff --check`                                      | PASSED | No whitespace errors                                                                                                                                                                                                                                                                                                           |

## Historical baseline events

| Event                                                             | Result              | Resolution                                                                                                                                                          |
| ----------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local branch was 47 commits behind `origin/main`                  | FAILED BASELINE     | Collision-checked fast-forward completed; user material preserved                                                                                                   |
| Default PATH selected Node 24.16.0 and uv 0.12.0                  | FAILED BASELINE     | All verification used the exact repository-provisioned toolchain; the exact check passed                                                                            |
| Early root checks saw concurrent formatting/build-lock contention | FAILED INTERMEDIATE | Contention ended and the full root gate subsequently passed from the final shared tree                                                                              |
| Initial full integration expected legacy report persistence       | FAILED INTERMEDIATE | The stale test was corrected to the intentional governed fail-close; focused and full integration reruns passed; Agent 4 independently approved the semantic change |

## Browser and hosted read-only evidence

- Public production web/admin landing and sign-in passed desktop/mobile
  reachability, Axe, keyboard, console, network, and overflow checks.
- Hosted Supabase reports `ACTIVE_HEALTHY` on PostgreSQL 17.6 and backups are
  present.
- Railway service logs showed no service errors in the inspected 72-hour window.
- Authenticated repaired production flows were not exercised because the
  repaired revision was not deployed.

## Deliberately not run

- Production migration/deployment, authenticated production smoke, production
  log/version verification, rollback, and restore: **NOT RUN** because the
  hosted release-admission contract is not green.
- Human screen-reader and physical-device review: **NOT RUN**; automated
  accessibility and real-browser responsive coverage passed.

No command is recorded as passed unless it completed successfully in the current
environment. Production is not labeled green.
