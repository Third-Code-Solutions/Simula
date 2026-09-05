# Original-finding remediation tracker — 5 September 2026

All original F01–F28 IDs from [AUDIT.md](AUDIT.md) are retained. Baseline:
`21469e533625fb50da1f7054e42f4efda9da0048`; branch `codex/ux-remediation`. This
is unreleased local work unless explicitly stated. LOCAL VERIFIED means only the
bounded change and named checks passed. PARTIAL means acceptance remains open.
No row implies production promotion or full end-to-end verification.

Evidence: [runtime](REMEDIATION_RUNTIME.md), [UX](REMEDIATION_UX.md),
[route/role inventory](REMEDIATION_ROUTES.md). Historical reports remain intact.

| ID  | Severity | Current status / evidence                                                                                                                                                                                                                 | Remaining acceptance gate                                                                                                                                             |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 | P1       | PARTIAL: latest three signed runs still failed, latest 32759206723 has zero artifacts. Docker restored; fresh alternate-port Supabase and actual API readiness pass with every dependency ready. Full hosted release gate not rerun.      | Reproduce actual release environment, identify failed dependency from new diagnostics, fix root cause and complete immutable signed release.                          |
| F02 | P1       | OPEN: runtime provenance still validates string formats. No actual provider promotion boundary changed.                                                                                                                                   | Bind signature, workflow/run/source/artifact identities, schema/config compatibility and rollback to every provider promotion, then verify live identities.           |
| F03 | P2       | OPEN, revalidated read-only: main returns Branch not protected; no rulesets; five environments have empty protection_rules.                                                                                                               | Configure supported required checks/deployment controls and prove failing checks prevent merge/promotion. No hosted setting changed.                                  |
| F04 | P2       | LOCAL VERIFIED: failure-only upload retains redacted child logs, per-process/listener state and Playwright artifacts. Allowlisted API dependency gauges added. Diagnostic/redaction tests pass.                                           | Execute workflow and confirm failed-run artifacts upload with enough evidence to isolate the fault.                                                                   |
| F05 | P2       | LOCAL VERIFIED: frozen pnpm install and fresh unsuppressed audit pass with no known vulnerabilities; patched browserslist4.28.7/fast-uri3.1.6/qs6.16.0 installed.                                                                         | Verify dependencies in the promoted artifact; production unchanged.                                                                                                   |
| F06 | P2       | LOCAL VERIFIED: expired advisory suppression removed; fresh audit has no known vulnerabilities.                                                                                                                                           | Retain time-bounded reviewed exceptions only when independently justified.                                                                                            |
| F07 | P2       | PARTIAL: both Next configs add frame-ancestors/object-src/base-uri/form-action CSP, DENY, nosniff and referrer policy.                                                                                                                    | Actual build/browser response compatibility and deployed headers. Scoped CSP is not complete script-src enforcement.                                                  |
| F08 | P2       | OPEN: historical advisor reports disabled leaked-password protection. Current plan/config not revalidated here.                                                                                                                           | Confirm plan capability; enable within existing authority or record exact unsupported prerequisite/accepted alternative. No purchases.                                |
| F09 | P2       | OPEN: historical mutable production Redis 8.2.1 differs from digest-pinned tested 8.2.7-alpine.                                                                                                                                           | Confirm current target, align immutable image, verify persistence/queue recovery and rollback compatibility.                                                          |
| F10 | P2       | LOCAL VERIFIED: railway.api.json now uses /health/ready; deployment configuration suite 27 passed.                                                                                                                                        | Verified release and observed dependency-aware admission on confirmed Railway target.                                                                                 |
| F11 | P2       | OPEN: historical inspected Railway project had only production; no staging target created.                                                                                                                                                | Confirm authorized isolated resources and rehearse compatible deployment/recovery without inventing staging evidence.                                                 |
| F12 | P2       | PARTIAL: captured forms/stable logical retry keys pass regressions; real browser campaign creation and simulation persistence succeed.                                                                                                    | Real upload/import uncertain retries and zero-duplicate persistence proof across all command types.                                                                   |
| F13 | P2       | LOCAL VERIFIED: bounded single-flight polling, cancellation and terminal handling covered by47 API/Lab tests; real worker simulation reaches success.                                                                                     | Live timing/auth failure coverage for every durable job type and hosted verification.                                                                                 |
| F14 | P2       | LOCAL VERIFIED: keyed campaign sessions, mounted guards and abort handling pass switch/stale-response regressions.                                                                                                                        | Real tenant/project switch recovery for every artifact type.                                                                                                          |
| F15 | P2       | PARTIAL: authorized run history and URL recovery implemented; real persisted simulation restores after reload. Duplicate initialization429 defect reproduced and fixed with reduced reads and Retry-After handling.                       | Live permissions/history reopening for every supported artifact type.                                                                                                 |
| F16 | P2 gap   | OPEN: calibration/backtest/evidence-report creation remains honestly unavailable; quarantine/approval preserved.                                                                                                                          | Immutable raw/transform/aggregate/source/run binding, held-out protocol/outcomes, leakage controls, authorized report lifecycle and independent approval.             |
| F17 | P2       | PARTIAL: structured editors, native response file upload and collapsed advanced JSON; desktop/mobile Axe and keyboard/tab interaction checks pass.                                                                                        | Live import previews, field-error flows and native response persistence across supported formats.                                                                     |
| F18 | P2       | LOCAL VERIFIED: real admin server offset pagination, page-local search labels and out-of-range recovery pass23 admin and8 API tests. Campaign selected details load beyond first50.                                                       | Real superadmin pagination beyond100 and live large-directory tests.                                                                                                  |
| F19 | P2       | PARTIAL: web30s deadlines include auth waiting, transport and JSON/binary consumption; cancellation/timeout regressions pass. Admin API fetch has30s deadline.                                                                            | Navigation cancellation and safe retry proof for every caller; hosted timeout/abort observations.                                                                     |
| F20 | P2       | PARTIAL:47 focused API/Lab tests,173 full web tests and real create-to-worker-success-to-refresh browser proof pass; no fixture substitution for that flow.                                                                               | Remaining role/artifact route matrix and hosted critical journeys.                                                                                                    |
| F21 | P3       | PARTIAL: /data-use links explain current operating limits and explicitly are not privacy policy/terms/certification.                                                                                                                      | Reviewed privacy/terms/contact/account-data and retention destinations using approved facts.                                                                          |
| F22 | P2       | LOCAL VERIFIED: first-write/cancellation-finalization and secondary persistence failures contained in both queues; six fault cases pass.                                                                                                  | Live lease recovery, sibling-queue continuity and zero duplicate durable work under DB interruption.                                                                  |
| F23 | P2       | PARTIAL: worker closes interrupted/unusable transaction connections before pool cleanup, including readiness; entry/body fault tests pass.                                                                                                | Real-driver entry/body cancellation and replacement-backend recovery now pass. Bounded graceful drain and hosted shutdown attribution remain open.                    |
| F24 | P2       | PARTIAL: shared monotonic simulation budget spans variants/repetitions/methodology/behavioral decisions; phase fault tests pass.                                                                                                          | Cooperative checks cannot preempt blocked synchronous code. Hard isolation, complete worker deadline, resource/queue admission and maximum-load recovery remain open. |
| F25 | P2       | LOCAL VERIFIED: Python/Nest global 10-second unknown-key refresh cooldown and single-flight protection; flood/rotation regressions pass, Nest 8/8.                                                                                        | Live refresh/rotation smoke after release. New rotation after unknown-key burst may wait for cooldown expiry.                                                         |
| F26 | P3       | OPEN: no indexes added/removed on advisor counts alone; historical 72 missing-covering / 53 unused notices not refreshed here.                                                                                                            | Representative join/delete/retention plans and load evidence, justified safe indexes and migration replay.                                                            |
| F27 | P2       | LOCAL VERIFIED: exact PATH gate passed; audit fallback fixed. Full PSF Python 3.14.7 adopted into default .venv from frozen95 packages; original embedded environment retained. Prior full suite616 passed plus3 skips; fresh SCA passed. | Complete final whole-repo gates; real boundary/Redis7 and API M2 tests pass; fresh pgTAP404 passes. Container/image/release gates remain pending.                     |
| F28 | P2       | PARTIAL: README setup, complete tracker and dated runtime/UX/route evidence distinguish local/hosted/unverified.                                                                                                                          | Reconcile PROJECT_STATE, active plans and capability/release/operational docs with final verified state; retain superseded historical reports.                        |

## F01 source and hosted evidence

Read-only GitHub rechecks on 5 September:

- Successful signed run
  [32748764203](https://github.com/kurtgav/Simula/actions/runs/32748764203),
  source 4b17ba4a85a010ff6ae0575de227b3672eaf6b1a, passed Run release gates; one
  nonexpired signed artifact, 11886412 bytes.
- Failed
  [32759206723](https://github.com/kurtgav/Simula/actions/runs/32759206723),
  source 21469e533625fb50da1f7054e42f4efda9da0048, still has zero artifacts.
- `git diff 4b17ba4..21469e5 --stat` contains two Nest PostgreSQL helper
  implementations/tests and Docker cache reclamation steps occurring after the
  gate. Browser harness, Python API/database configuration and migrations did
  not change. A newly introduced Python/browser source regression is not
  supported by this comparison. Runner/dependency/resource instability is
  possible, unproven.
- The harness overrides routing/Supabase origins to loopback, sets local
  database credentials, resets disposable data and owns child processes. API
  readiness checks auth/database/queue/rate-limit/run-admission. Final failure
  now records only allowlisted boolean dependency gauges, without retaining
  arbitrary metrics.
- No longer timeout, readiness bypass or speculative environment mutation was
  presented as a fix. The failed dependency still must be identified from a real
  runtime/release reproduction. Docker 29.7.2 is now available; see current
  disposable evidence below.

Commands: `gh run list --workflow release.yml`, `gh run view --json jobs`,
`gh api .../actions/runs/{id}/artifacts`, `gh api .../branches/main/protection`,
`gh api .../rulesets`, `gh api .../environments`; all repository kurtgav/Simula.
Retrieved failed log remains ignored at tmp/release-failed-32759206723.log. No
hosted mutation or deployment was performed by this workstream.

No signature-only promotion script was added: providers currently build source
rather than consume the signed archive. A disconnected local verification script
would not enforce actual artifact promotion. Bind verification to the real
provider deployment boundary and compatible artifact/config/schema inputs.

## Concrete remaining release gates

1. Complete frozen dependencies and every configured quality/security/build
   gate.
2. Restore approved Docker execution or use an authorized isolated runner; run
   DB reset/replay/pgTAP/RLS, migration/type drift, Redis and container scans.
3. Complete route/role and supported authenticated journeys, including errors,
   timeouts/retries, tenant isolation, refresh/history and honest unavailable
   states.
4. Verify worker load/shutdown/recovery, retention/deletion propagation,
   backup/restore measurements and delivered alerts in approved isolated drills.
5. Enforce signed promotion with compatible rollback and exact source/build,
   image, schema and configuration identity for every component.
6. Promote only verified components to confirmed targets; verify live
   identities, readiness, critical journeys, queue state and errors. No
   production-green claim before this evidence exists.

## Resumed disposable runtime evidence

Docker Desktop was started successfully by the primary. Unrelated ERP PostgreSQL
already occupies 54322; old simula-local volumes also exist and were preserved.
A unique Supabase project `simula-remediation-20260905` uses 56321/56322, with
Redis 6387 and API 8017. Fresh schema/migrations/startup completed. CLI
publishes its ports on wildcard host interfaces despite a bridge
default-host-binding setting; only synthetic fixture data was admitted and
requests use loopback. Resources remain temporarily available for the primary
browser smoke and must be cleaned using their explicit ownership record
afterward.

- [runtime-disposable.json](runtime-disposable.json): actual API live/readiness
  200; all five dependency gauges ready; owner/viewer/other-tenant-owner Auth
  login and scoped organizations reads 200. This is a modified working tree with
  HEAD supplied as baseline metadata, not immutable release identity.
- Existing database-boundary and Redis-rate suites: **7 passed in 8.05s**.
  Invocation maps only fixed test container/port constants and CLI status
  workdir to the unique fixture; assertions, roles and validations were
  unchanged.
- Local DB lint exited 0 with 10 warning-extra unused-parameter notices.
- [worker-cancellation-disposable.json](worker-cancellation-disposable.json):
  real psycopg transaction body cancellation propagated, closed/discarded its
  connection and obtained a replacement backend; injected cancellation after
  advancing the actual BEGIN generator also closed the connection and recovered.
  An initial probe injected into pool cleanup too early and failed; the
  corrected probe targets transaction entry, then passes. Hosted shutdown
  attribution remains open.
- First direct pgTAP invocation failed DNS because the test runner did not join
  the custom network. After mapping the network, 23 files/376 executed
  assertions still failed because plain CLI uses nonsuperuser postgres and the
  live API had already set an application password. The repository wrapper
  explicitly uses superuser supabase_admin and expects a fresh pre-runtime
  baseline. A correct baseline/admin rerun remains pending after the browser
  fixture is released.

No failed harness attempt is reported as a passed release gate. The packaged
same-version `supabase-go.exe` was used after the Bun shim stalled and exhibited
Windows telemetry-file contention; this workaround is disclosed rather than
attributed to the Linux hosted failure. No unrelated Docker resources were
reset.

### Updated baseline results

- Fresh second fixture: migration replay and privileged pgTAP **PASSED, 23 files
  / 404 assertions / 6 seconds**. Missing bootstrap and duplicate Docker db
  aliases caused earlier harness failures; corrected before the passing run. The
  isolated baseline and its test network have been removed.
- Existing API M2 integration: **PASSED, 1 test / 6.26 seconds**,
  endpoint/container mapping only. Full integration directory verification
  continues separately.
- Primary reports the authenticated browser journey now passes through real
  worker completion, reload restoration, and desktop/mobile accessibility
  checks. The transient reload failure was traced to duplicate initialization
  causing HTTP 429 and fixed without disabling rate limiting; consult UX
  evidence for exact browser acceptance and regression results.
- Primary recreated default .venv using full Python and frozen 95-package
  install; exact toolchain gate passed. Old embedded environment retained as
  backup.

Final integration acceptance: 28 tests passed in the full run; the restore test
then passed independently in 50.20 seconds after copying missing migrations into
the test snapshot. All 29 current integration tests now have passing results,
with no skips. This is not represented as a single green full invocation. All
owned temporary containers, networks, data volumes, API/worker processes and
listeners were removed; unrelated ERP resources were preserved.
