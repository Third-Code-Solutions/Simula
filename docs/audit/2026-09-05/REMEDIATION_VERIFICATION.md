# UX and runtime remediation verification — 5 September 2026

Scope: local changes on `codex/ux-remediation`, based on
`21469e533625fb50da1f7054e42f4efda9da0048`. Production has not been deployed.
The original28-finding audit remains partially open; see REMEDIATION_TRACKER.md.

## Verified checks

| Check                          | Status                     | Evidence and limits                                                                                                                                                                                                                                             |
| ------------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact toolchain                | PASSED                     | Node24.18.1, pnpm11.13.1, uv0.11.19, Python3.14.7, Supabase2.109.1. Default `.venv` recreated with full PSF Python; incomplete environment preserved as an ignored backup.                                                                                      |
| Frozen dependencies            | PASSED                     | pnpm frozen install; uv frozen all-packages/all-groups95 packages. Offline JS miss recovered through online frozen install; no resolution bypass.                                                                                                               |
| `pnpm check`                   | PASSED                     | Formatting, ESLint/Ruff, TypeScript/mypy172 files, tests, builds, generated contracts, claim policy and tracked secret baseline. Cached steps reused same-session evidence; fresh individual gates also ran.                                                    |
| Web                            | PASSED                     | 173 tests across44 files; includes17 Campaign Lab regressions and30 API-client tests.                                                                                                                                                                           |
| Admin / Nest / contracts       | PASSED                     | 23 admin tests;261 Nest tests across42 suites;7 contract tests;3 local-dev environment tests.                                                                                                                                                                   |
| Python unit suite              | PASSED with platform skips | 624passed,3skipped,29integration deselected. Two POSIX-only semantics and unavailable symlink privilege explain skips; no test-file exclusions.                                                                                                                 |
| `pnpm security:sca`            | PASSED                     | Both audits report no known vulnerabilities. Four editable workspace distributions are not published-package advisory targets; their source remains tested.                                                                                                     |
| Public browser                 | PASSED                     | 5 Playwright tests;10 desktop/mobile landing/account-shell combinations return200 with zero Axe violations or horizontal overflow. Password email delivery/reset completion not established by shell checks.                                                    |
| Authenticated campaign journey | PASSED                     | Real disposable Auth/DB/API/Redis/worker: login, create organization/project/campaign, queue simulation, persisted succeeded result, refresh restore. Desktop1440/mobile390: no page errors, Axe violations or overflow. Synthetic-only output labels retained. |
| PostgreSQL                     | PASSED                     | 23 pgTAP files404 assertions; database lint exit0 with10 unused-parameter notices. Exact disposable target mapping/initial harness failures recorded in runtime evidence.                                                                                       |
| Integration suite              | PASSED across reruns       | All29 tests covered without skips:28 passed in the full run; restore passed after completing the external fixture migration copy. No claim of a single green invocation. All owned disposable infrastructure cleaned up; unrelated ERP preserved.               |

## Failures diagnosed during verification

- Dependency relinking caused a transient missing Next module. Stable-install
  reruns passed; no application import workaround was added.
- Three synchronous effect state updates failed lint. State ownership and URL
  subscription were corrected without suppressions.
- Homepage/contract assertions still described replaced copy or omitted the new
  run-history route. Updated explicit expected behavior, retaining assertions.
- Real browser refresh hit429 after redundant initialization/history requests.
  Shared initialization and URL hydration gating reduced requests; bounded read
  retries honor Retry-After. Regression and real-browser reruns pass.
- Initial Python environment had missing console scripts. Full default
  environment recreated from frozen dependencies; mypy and root check passed.
- A Windows standalone rebuild hit EPERM on generated links. Outputs were
  preserved under root `.next/remediation-build-backups`; clean regeneration
  passed. Turbo also failed to archive long runtime link targets. Build caching
  is now disabled rather than permit incomplete artifact restoration; final
  uncached build passed all4 tasks in29.7s without warnings.

## Deployment boundary

NOT DEPLOYED. Signed release reproduction, enforced provider artifact identity,
compatible rollback, remaining route/role coverage and open
governance/operational findings still require closure before production
promotion. Local mechanical success does not validate population predictions or
unblock quarantined evidence workflows. Existing unrelated files and
infrastructure were preserved.
