# Original-finding remediation tracker — 5 September 2026

All original F01–F28 IDs from [AUDIT.md](AUDIT.md) are retained. Baseline:
`21469e533625fb50da1f7054e42f4efda9da0048`; branch `codex/ux-remediation`. This
includes the production release verified below; historical local-only statements
retain their original scope. LOCAL VERIFIED means only the bounded change and
named checks passed. PARTIAL means acceptance remains open. Only explicitly
named production checks are verified; no row implies exhaustive end-to-end
coverage.

Evidence: [runtime](REMEDIATION_RUNTIME.md), [UX](REMEDIATION_UX.md),
[route/role inventory](REMEDIATION_ROUTES.md). Historical reports remain intact.

| ID  | Severity | Current status / evidence                                                                                                                                                                                                                                                                                                                            | Remaining acceptance gate                                                                                                                                                                                                                               |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 | P1       | PRODUCTION VERIFIED: exacteb0ea931a180f1912f690be5648a6fb4a6557ab0 requiredCI33961708123 and signed33961707670 passed; all7components released,3migrations through20260905104327 applied, V4 preserved.52production smoke assertions pass.                                                                                                           | Keep historical failed runs/receipts. Future source changes require new immutable gates; this is bounded production acceptance.                                                                                                                         |
| F02 | P1       | PRODUCTION VERIFIED: signed-source promotion used exact targets and receipts for5Railway/2Vercel components; both canonicals promoted. Git auto-triggers remain disabled. First frontend failure/recovery retained in receipt.                                                                                                                       | Provider outputs are verified-source derivatives, not asserted byte-identical scanner images; preserve compatible rollback/config inputs.                                                                                                               |
| F03 | P2       | HOSTED CONFIG VERIFIED: main requires four actual GitHub Actions CI checks, strict/admin enforcement, PR with zero approvals; three production environments allow main only. Independent persisted reads pass.                                                                                                                                       | Deliberate failing-check merge/deployment rejection test NOT RUN; external provider CLI/API paths remain subject to F02 procedure.                                                                                                                      |
| F04 | P2       | HOSTED ARTIFACT VERIFIED: failed run33958326577 retained release-gate-failure-8fd4f9127aacf6173ee1c63f48d6767b39541dc4, 5522364 bytes, nonexpired. Redacted diagnostics/local tests recorded.                                                                                                                                                        | Preserve diagnostic uploads on future failures; primary owns final root-cause and artifact-content reconciliation.                                                                                                                                      |
| F05 | P2       | DEPLOYED; LOCAL REGRESSIONS VERIFIED: frozen pnpm install and fresh unsuppressed audit pass with no known vulnerabilities; patched browserslist4.28.7/fast-uri3.1.6/qs6.16.0 installed.                                                                                                                                                              | Exact-source release security gates passed and code promoted; retain ongoing dependency monitoring.                                                                                                                                                     |
| F06 | P2       | DEPLOYED; LOCAL REGRESSIONS VERIFIED: expired advisory suppression removed; fresh audit has no known vulnerabilities.                                                                                                                                                                                                                                | Retain time-bounded reviewed exceptions only when independently justified.                                                                                                                                                                              |
| F07 | P2       | PRODUCTION VERIFIED bounded headers: canonical web/admin and protected candidates return nosniff, DENY, CSP frame-ancestors none and referrer policy; six candidate browser checks pass.                                                                                                                                                             | Scoped CSP does not constitute complete script-src enforcement; other routes/embedded flows not exhaustively checked.                                                                                                                                   |
| F08 | P2       | FIXED LIVE: Pro SIMULA Auth leaked-password protection persisted enabled; independent advisor warning cleared at09:35:42Z. Other Auth settings unchanged.                                                                                                                                                                                            | Real leaked-password signup/reset attempt NOT RUN; no purchase required.                                                                                                                                                                                |
| F09 | P2       | LIVE VERIFIED: pinned Redis8.2.7-alpine deployment1f7117fe-67cd-4e2d-ac31-b703dfa0fe8d SUCCESS; auth enforced, persistence/noeviction preserved, six structural key fingerprints match, queue counts0, dependent readiness200. Unsafe lost+found startup cleanup removed. Backup and exact old-image rollback inputs retained.                       | Actual production restore NOT RUN; later synthetic campaign/behavioral jobs succeeded after the application release. Redis alignment admission remained open. See RELEASE_TARGETS.md and redis-alignment-receipt.json; application release is separate. |
| F10 | P2       | DEPLOYED VERIFIED: API dependency readiness and exact release SHA200; all backend candidates admitted. Campaign Lab atomic emergency-pause guard and migration included in released head104327.                                                                                                                                                      | Production fault-injection/disable-enable drill remains unperformed; preserve fail-closed controls.                                                                                                                                                     |
| F11 | P2       | PARTIAL: isolated disposable Supabase/worker and Redis upgrade/rollback recovery drills now have local evidence. Existing hosted Railway project remains production-only; no hosted staging provisioned.                                                                                                                                             | Local drills do not establish hosted staging or production restore. Complete provider-compatible rehearsal/rollback evidence for each promoted component.                                                                                               |
| F12 | P2       | PARTIAL: captured forms/stable logical retry keys pass regressions; real browser campaign creation and simulation persistence succeed.                                                                                                                                                                                                               | Real upload/import uncertain retries and zero-duplicate persistence proof across all command types.                                                                                                                                                     |
| F13 | P2       | DEPLOYED; LOCAL REGRESSIONS VERIFIED: bounded single-flight polling, cancellation and terminal handling covered by47 API/Lab tests; real worker simulation reaches success.                                                                                                                                                                          | Production campaign/behavioral success verified; timing/auth failures for every durable job type remain untested.                                                                                                                                       |
| F14 | P2       | DEPLOYED; LOCAL REGRESSIONS VERIFIED: keyed campaign sessions, mounted guards and abort handling pass switch/stale-response regressions.                                                                                                                                                                                                             | Real tenant/project switch recovery for every artifact type.                                                                                                                                                                                            |
| F15 | P2       | PRODUCTION VERIFIED bounded history: actual browser-created campaign run succeeds through worker and restores exact simulation URL/result after reload.                                                                                                                                                                                              | Every artifact history/tenant-switch path remains outside this bounded smoke.                                                                                                                                                                           |
| F16 | P2 gap   | DEPLOYED; complex mechanics LOCALLY VERIFIED: preregistration, later independent source, custodian upload, bound backtest/report approval/export/revocation and revoked-source422 checks pass; six local responsive views pass. Guard/review migrations now applied.                                                                                 | Production report/calibration/backtest full lifecycle NOT RUN. Registry approval separate; scoped synthetic comparison is not scientific validation.                                                                                                    |
| F17 | P2       | PARTIAL: structured editors, native response file upload and collapsed advanced JSON; desktop/mobile Axe and keyboard/tab interaction checks pass.                                                                                                                                                                                                   | Live import previews, field-error flows and native response persistence across supported formats.                                                                                                                                                       |
| F18 | P2       | LOCAL LIVE VERIFIED: real Supabase/API/admin login and server pagination across121 synthetic fixture organizations (141 total), Next to100/120, Previous and refresh/filter recovery passed.1440/390 Axe/error/overflow checks pass after containing absolute screen-reader label in table scroll region. Admin23tests/typecheck pass.               | Hosted superadmin large-directory pagination remains NOT RUN; local fixture is synthetic and preserved separately.                                                                                                                                      |
| F19 | P2       | PARTIAL: web30s deadlines include auth waiting, transport and JSON/binary consumption; cancellation/timeout regressions pass. Admin API fetch has30s deadline.                                                                                                                                                                                       | Navigation cancellation and safe retry proof for every caller; hosted timeout/abort observations.                                                                                                                                                       |
| F20 | P2       | PRODUCTION VERIFIED bounded smoke52assertions: owner/editor/viewer/nonmember authentication and selected read/write denials, campaign worker persistence/reload, real behavioral result and idempotent run identity; desktop/mobile checks pass.                                                                                                     | Remaining route/role/artifact matrix, direct private health and hosted recovery/load checks remain explicit gaps.                                                                                                                                       |
| F21 | P3       | PARTIAL: /data-use links explain current operating limits and explicitly are not privacy policy/terms/certification.                                                                                                                                                                                                                                 | Reviewed privacy/terms/contact/account-data and retention destinations using approved facts.                                                                                                                                                            |
| F22 | P2       | DEPLOYED; LOCAL REGRESSIONS VERIFIED: initial/persistence fault containment; actual four-process engine sibling continuity; Redis hard-crash recovery in 11.037s and active SIGTERM-handler recovery in 0.127s each retain one synthetic durable effect across two deliveries. See runtime-fault-acceptance.json.                                    | Production database-interruption lease recovery and cross-queue continuity remain unproven; local Redis effect is not a production database receipt.                                                                                                    |
| F23 | P2       | DEPLOYED; LOCAL REGRESSIONS VERIFIED: interrupted/unusable connection cleanup plus real-driver regressions; active ARQ SIGTERM handler invokes shutdown hook and recovers without a duplicate synthetic effect. Prior hosted deployment logs show rollback/ProgrammingError/bad-connection clusters, with no matching shutdown/cancellation records. | Windows test invokes the signal handler directly; hosted shutdown causation remains unproven. See hosted-worker-log-correlation.json.                                                                                                                   |
| F24 | P2       | DEPLOYED: killable process boundary and atomic Campaign Lab pause admission guard; local deadline/cancellation/capacity/fault tests pass. Actual production behavioral job succeeded in about5s.                                                                                                                                                     | Hosted maximum-load and interrupted-process recovery not exercised; process lifecycle is not an OS sandbox.                                                                                                                                             |
| F25 | P2       | DEPLOYED; LOCAL REGRESSIONS VERIFIED: Python/Nest global 10-second unknown-key refresh cooldown and single-flight protection; flood/rotation regressions pass, Nest 8/8.                                                                                                                                                                             | Live refresh/rotation smoke after release. New rotation after unknown-key burst may wait for cooldown expiry.                                                                                                                                           |
| F26 | P2       | EVALUATED: refreshed72 missing-FK/53 unused-index INFO notices; catalog and seven EXPLAIN plans reviewed. Tiny tables and existing run-led indexes do not establish a current performance defect. See F26_PERFORMANCE.md.                                                                                                                            | No blanket index migration. Revisit secrets run/artifact access paths with realistic growth workload and timings; full load/RLS-plan review NOT RUN.                                                                                                    |
| F27 | P2       | VERIFIED RELEASE: final exact-source requiredCI33961708123 and signed33961707670 passed; frozen toolchain/build/security gates and applied3migration release recorded. Earlier local test snapshots retained.                                                                                                                                        | Future changes need new gates; Windows skips and bounded coverage remain documented.                                                                                                                                                                    |
| F28 | P2       | RECONCILED: README/project/capability/release/runbooks and UX/runtime/route evidence now identify exact deployed source, production smoke, historical failures and unresolved acceptance.                                                                                                                                                            | Approved legal/privacy/terms text remains unanswered; continue updating retained production fixture/rollback and untested coverage evidence.                                                                                                            |

## Production release verified - 5 September 2026, 11:30 UTC

This section supersedes earlier application-release-pending statements while
preserving their historical evidence. All seven application components now run
source eb0ea931a180f1912f690be5648a6fb4a6557ab0: web, admin, API, control plane,
dispatcher, worker and private engine. Required CI33961708123 and signed
release33961707670 passed. Three release migrations are applied
through20260905104327; V4 readiness remains available for rollback
compatibility. Both canonical Vercel domains were promoted after
protected-candidate checks.

The production smoke receipt passes52 assertions: exact public service
SHA/health and frontend security headers; fresh synthetic
owner/editor/viewer/nonmember sessions; application invitation acceptance;
editor/viewer reads; viewer mutation, editor owner-only action, nonmember and
platform-admin denials; signed-out API/browser boundaries; actual browser
campaign submission, worker success, exact run restoration and visible
Synthetic-only limits. A separate real behavioral run completed in about5
seconds with same-command durable ID replay, saved experimental deterministic
result and artifact checksum. Six protected-candidate desktop/mobile checks and
production result1440/390 checks had zero Axe violations, document overflow and
page errors.

This is bounded production verification, not every route/role or scientific
validity. Report/calibration/backtest complex lifecycle evidence remains local
synthetic engineering proof; registry approval remains a separate administrator
process. Hosted superadmin pagination beyond100, production
recovery/load/retention and approved legal/privacy/terms text remain unverified
or unresolved. Direct private SSH health checks were blocked by unavailable
authorized keys; startup/config/image identities and an actual behavioral job
provide fallback evidence, not direct private-endpoint coverage. Immediate
publication means that job alone does not attribute dispatch to the dispatcher.

Evidence: production-smoke-verification.json, production-backend-promotion.json
and production-frontend-promotion.json in docs/audit/2026-09-05, plus the
release result and protected-candidate receipt. Promotion receipts retain the
initial frontend failure and subsequent recovery; they are not a claim of an
uninterrupted first attempt. Synthetic fixture records are retained by UUID, not
existing-user replacements.

## Historical F01 source and hosted evidence � superseded by current table

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

Historical initial decision: no standalone signature-only script was added at
that point. Superseded: `scripts/promote_release.py` now verifies the signed
source archive before invoking exact provider targets, records deployment
receipts and distinguishes provider-built derivatives from signed binary
identity. Promotion and application verification remain separate pending steps.

## Concrete remaining release gates

1. Complete frozen dependencies and every configured quality/security/build
   gate.
2. Docker/disposable execution is restored and local replay/recovery evidence
   exists. Complete final checks against the newest source/migration head;
   earlier passing snapshots do not certify subsequent changes.
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

## Historical rollout blocker - resolved by released guard migration

The existing emergency pause latch does not cover Campaign Lab admission.
Runtime remediation is implementing an atomic guard and new migration; final
tests, migration replay and signed release are still required. The completed
local backtest flow does not waive this operational gate. No new application
promotion has occurred.
