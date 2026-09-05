# Runtime and release remediation � 5 September 2026

This is current remediation evidence, not a rewrite of the historical audit. No
production deployment, hosted mutation, credential change, or migration was
performed by this workstream.

## Confirmed fixes

| Finding | Change                                                                                                                                                                                                                                                                                 | Verification / limitation                                                                                                                                                                                                                                                                                          |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F04     | Release failure uploads fixed child logs, readiness state, and Playwright artifacts. Logs remove known sensitive environment values, credential-bearing PostgreSQL URLs and JWTs before upload. Readiness failure identifies each listener and process exit code.                      | Fault tests verify API-not-ready versus web-ready and retained state; redaction regression. Hosted artifact retention requires the next release run.                                                                                                                                                               |
| F22     | Initial progress and cancellation-finalization writes execute inside each Campaign Lab/evidence claim's existing failure boundary. Failure persistence outages return a recoverable disposition; no result is published.                                                               | Six fault cases cover first write, cancellation finalization, and secondary failure persistence for both queues.                                                                                                                                                                                                   |
| F23     | Worker transactions close unusable connections on interrupted entry or cancellation before pool cleanup, preserving cancellation propagation. Worker readiness uses the same transaction boundary.                                                                                     | Entry/body cancellation fault tests assert close precedes pool release. Production rollback attribution, full graceful-drain behavior and hosted recovery remain unproven.                                                                                                                                         |
| F24     | One monotonic simulation budget spans variants, repetitions, methodology and behavioral execution. The behavioral callback checks it before/after provider decisions; deadline exhaustion aborts result return. Runtime clock values are not serialized into reproducibility receipts. | Tests exhaust budget across methodology variants and during the first behavioral decision. Cooperative checks do not preempt a synchronous blocked provider; process isolation/hard execution deadlines and hosted maximum-load admission proof remain open. The current evaluator admits deterministic providers. |
| F25     | Python and Nest unknown-key refresh use a global ten-second cooldown, including upstream failures; existing single-flight protection remains.                                                                                                                                          | Python concurrent distinct-key flood and rotated-key acceptance tests pass. Known keys remain usable; rotation after an unknown-key burst may wait at most the cooldown before the next attempt. Nest verifier Jest suite passes 8/8, including concurrent distinct-key and rotation proof.                        |
| F27     | Missing `venv` import now reaches the frozen-export audit fallback. Exact workstation PATH selects existing pinned Node/uv binaries rather than ambient versions.                                                                                                                      | Full Python suite collects without excluding the audit test. Fresh Python dependency scan reports no known vulnerabilities.                                                                                                                                                                                        |

## Verification

- PASSED: `.venv/Scripts/python.exe -m scripts.check_toolchain` with documented
  pinned PATH: Node 24.18.1, pnpm 11.13.1, Supabase 2.109.1, uv 0.11.19, Python
  3.14.7. The initial environment uses the embedded Python distribution.
- PASSED before the subsequent deadline additions:
  `.venv/Scripts/python.exe -m pytest -m 'not integration' -q`: 612 passed, 3
  explicit Windows platform skips, 29 integration tests deselected. No test
  files were excluded. One first aggregate run failed because the existing
  release test required provenance verification before any artifact upload;
  moving the failure-only diagnostic step after signed evidence preserved that
  assertion, then the full suite passed.
- PASSED: initial Ruff check and format scope, 171 files; initial mypy scope,
  171 source files. Final reruns follow the deadline additions.
- PASSED: `.venv/Scripts/python.exe -m scripts.audit_python_dependencies`, with
  `UV` pointing to 0.11.19. Exact locked all-packages/all-groups export scanned
  through full Python 3.12 with locked pip-audit; no known vulnerabilities
  found.
- PASSED: deadline-focused core suite, 17 tests in `test_campaign_lab.py`.
- BLOCKED: Docker daemon missing at `npipe:////./pipe/dockerDesktopLinuxEngine`.
  No local database reset, release runtime or container scan is claimed.
- Re-read GitHub run 32759206723 with `gh run view --log-failed`: the available
  log still gives only the browser readiness timeout; the child logs were never
  uploaded. Retrieved evidence is in ignored
  `tmp/release-failed-32759206723.log`. F01's exact hosted root cause remains
  unknown; F02 immutable promotion and coordinated rollback verification remain
  open.

## Complete Python installation

Pinned uv reports no downloadable `cpython-3.14.7-windows-x86_64-none` build.
Downloaded the exact Windows installer from
`https://www.python.org/ftp/python/3.14.7/python-3.14.7-amd64.exe` and verified
Authenticode `Valid`, publisher Python Software Foundation. Silent isolated
installation to `C:/Users/MSI/.codex/toolchains/python-3.14.7-full` exited 0,
with no PATH, launcher, file association or shortcut changes. A separate
`.venv-runtime-20260905` is being synchronized with frozen workspace
packages/groups. The existing `.venv` remains untouched while other work runs;
full runtime validation and adoption are recorded after synchronization.

## Final workstream verification

- PASSED:
  `.venv-runtime-20260905/Scripts/python.exe -m pytest -m 'not integration' -q`:
  **616 passed, 3 platform skips, 29 integration deselected**, 47.27 seconds.
  These counts include the campaign-history tests being added by the parallel UX
  workstream and must not be summed with focused test counts.
- PASSED: the same latest non-integration suite with existing embedded `.venv`:
  616 passed, 3 skips, 29 integration deselected, 29.88 seconds.
- PASSED: full PSF environment mypy, **172 source files**.
- PASSED: direct Nest verifier Jest invocation from `apps/api`, using pinned
  Node:
  `node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/auth/supabase-token-verifier.spec.ts`:
  **8 passed**, 29.015 seconds.
- PASSED: pinned Node
  `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit` from
  `apps/api`.
- PASSED:
  `.venv-runtime-20260905/Scripts/python.exe -m scripts.audit_python_dependencies`:
  **no known vulnerabilities**. The four editable workspace packages are
  explicitly skipped by the established third-party scanner; their frozen
  third-party dependencies remain scanned. Invalid old HTTP cache entries were
  ignored and refetched (warnings retained in tool output).
- PASSED: complete PSF interpreter imports `venv`, `ensurepip` and `ssl`;
  CPython 3.14.7, OpenSSL 3.5.7.
- PASSED: `UV_PROJECT_ENVIRONMENT=D:/thirdcode/simula/.venv-runtime-20260905`
  with pinned uv
  `sync --frozen --all-packages --all-groups --python C:/Users/MSI/.codex/toolchains/python-3.14.7-full/python.exe --offline`:
  95 packages checked. Initial online sync was interrupted after several minutes
  without further output; this independent offline frozen check then passed.
- NOT ADOPTED: existing `.venv` remains intact while parallel tests run. The new
  full environment is ready for coordinated adoption. Recreate `.venv` using the
  full interpreter after preserving the old directory; do not simply relocate
  Windows console-script launchers with embedded environment paths.
- NOT COMPLETED: a second full-environment toolchain check was interrupted while
  repository pnpm dependency updates were in progress. The prior exact toolchain
  gate passed; this is not a new pass over the evolving JavaScript lockfile.

Whole-job checking is cooperative. It prevents starting subsequent work or
returning a successful simulation result after the budget expires, and preserves
lease ownership while a submitted thread exits. It does not forcibly terminate
an already-blocked synchronous function. Hard process isolation, generalized
provider timeout enforcement, graceful shutdown drain policy, and maximum-load
hosted acceptance remain separate open work.

## Follow-up: deployment admission and release diagnosis

- F10 (not F28) is the original legacy API readiness finding. Changed
  `railway.api.json` from `/health/live` to `/health/ready`. Local manifest
  verification passed; no hosted change or deployment performed.
- Browser failure diagnostics now capture only the API's allowlisted readiness
  gauges for auth/database/queue/rate_limit/run_admission from its loopback-only
  metrics endpoint. Arbitrary metric labels/content are not retained.
- PASSED after these additions: foundation/deployment suites **34 tests**, Ruff
  lint/format and mypy on the three touched Python files. Tracker coverage check
  confirms every original F01–F28 appears exactly once.
- Read-only GitHub inspection found the last successful signed release 4b17ba4
  still has one nonexpired artifact. The browser/Python/schema source is
  unchanged between that success and failed 21469e5; only Nest DB helpers and
  later cache cleanup changed. No unsupported environmental root cause is
  asserted. See [the tracker](REMEDIATION_TRACKER.md) for remaining gates and
  exact statuses.

## Fresh isolated database verification

A second disposable project `simula-baseline-20260905` replayed all migrations
with the repository role bootstrap and seed. The privileged pgTAP invocation
matched `scripts/run_supabase_tests.mjs`: generated short-lived supabase_admin
password in memory and no credential output. **23 files / 404 assertions passed
in 6 seconds**. Raw redacted local output: `tmp/runtime-baseline-pgtap.log`.

Harness failures were corrected before this pass: missing copied roles.sql
failed closed at the migration precondition; sharing a Docker network gave two
containers the alias db, causing intermittent authentication failures. A
separate network with only the baseline database and test runner removed that
ambiguity. Neither failure was counted as a passing test. The second fixture was
then stopped with its explicit project ID and no backup, and its test network
removed.

The existing API M2 integration test also passed in 6.26 seconds on the released
browser fixture with only test endpoint/container substitutions. The full Python
environment had a missing mypy console launcher despite an importable package;
frozen offline reinstall of mypy restored the executable, version 2.3.0. The
primary subsequently recreated default .venv from full Python with a frozen
95-package install, retaining the former embedded environment as a backup.

### Complete integration directory run

All 11 current integration test modules were collected in an external snapshot
of the current tests, with only fixture container/loopback port strings and the
CLI status command replaced to target the isolated project. Subprocess worker
helpers received the same target substitution. Production files and behavioral
assertions were unchanged. This preserves the existing fixed local defaults in
the checked-in harness while avoiding the unrelated ERP database on 54322.

The first full run produced **28 passed, 1 failed in 167.02 seconds**. The only
failure was the restore drill's final migration-head comparison because the
external snapshot initially lacked the repository migrations directory. The
actual backup/restore had executed; that attempt is not a passing restore gate.
After copying the exact migrations into the snapshot, only that test was rerun.
The initial collection-only attempt also lacked the scripts module import root;
PYTHONPATH was corrected before executing tests.

Final restore rerun: **PASSED, 1 test in 50.20 seconds**. Thus all 29 current
integration tests have passing results, with the corrected restore rerun
reported separately rather than claiming a single green full invocation. There
were no integration skips. The restore drill verified application row counts,
schema migration identity and isolated restored database recovery.

Cleanup completed: owned API and worker stopped; both explicitly named Supabase
projects stopped without backups; both owned networks and Redis removed; Redis
anonymous data volume identified by Docker unmount/container-name events and
removed explicitly. No owned fixture listeners remain. Unrelated running
supabase_db_erp and older volumes were preserved. Toolchain installs and
external scratch evidence remain intentionally available; no hosted
infrastructure changed.
