# Active continuation checkpoint

User: "start doing it all now"; original attached brief authorizes implementation,
bounded agents and verified release to existing production targets. Work remains
active. Do not treat this checkpoint as completion or deployment evidence.

## Committed source and hosted gates

- Branch `codex/ux-remediation`, origin kurtgav/Simula; draft PR1.
- `8fd4f91`: broad UX/lifecycle/runtime remediation with prior local root checks.
- `f9842444518679866916da1ea917df5ffefddc2c`: signed source manifest/promotion tool
  and corrected readable browser assertion.
- `585d6334b2e49bf32f321e6c4b6a76e57bb0b7af`: report/runtime/V5 checkpoint.
- `9b52dde`: exact Redis evidence digest false-positive handling; current local
  HEAD, not pushed yet. Backtest and final presentation/testing changes ongoing.
- First signed run33958326577 failed old authored_demo expectation. Failure
  evidence artifact5522364bytes retained. Corrected browser flow passes locally.
- Second signed run33958761514 SUCCESS, including container scans and signing.
  Downloaded artifact independently verified with Cosign and source/config/schema
  checks. It excludes newer uncommitted report/deadline/schema changes.
- PR CI33959426373: all four required gates SUCCESS, independently checked through
  the promotion guard. No application promotion.
- New signed run33960462851 FAILED and CI33960462129 failed Foundation/history:
  application.spec.ts expected health without the new optional releaseSha while
  CI sets SIMULA_RELEASE_SHA. Fixed with explicit fixture SHA and exact response
  assertions;17health/application tests pass with a CI-shaped environment.
  History scanner's18matches are six Redis name digests repeated across3receipts,
  verified against capture hashing code. Exact digest+path+rule recognition passes
 297commit full history and rejects both off-path/same-path-different-value probes;
  see GITLEAKS_DIGEST_REVIEW.md. Final source must rerun hosted gates.

## Verified hosted changes

- Supabase HIBP enabled and advisor cleared.
- GitHub main requires four CI checks and PR, zero approvals for solo owner;
  production environment branches restricted to main.
- Five Railway Git triggers removed, sources/config retained; two Vercel Git
  connections disconnected. Explicit verified-source CLI release remains possible.
  Restoration metadata: git-trigger-restore.json. Both app vercel.json also disable
  Git deployment in pending source.
- Redis backup da2dce84-c47b-4a3b-a78b-c6760521f4b6 created at
  UTC2026-09-05T09:48:16.741Z; verified in RELEASE_TARGETS.md.
- Redis8.2.7 pinned deployment1f7117fe-67cd-4e2d-ac31-b703dfa0fe8d SUCCESS.
  Authenticated PING/version, unauthorized rejection, six structural key
  fingerprints, preserved persistence/noeviction, empty queues and dependent
  readiness verified. Exact old image and backup retained; no live restore claim.

## Pending source and verification

- Promotion tool now handles nested Vercel JSON, exact Railway deployment ID,
  exact-ID status wait, previous public release settings and partial receipts;
  Required GitHub source checks now enforced before execution. Independent review
  caught real Vercel HTTPS response shape; URL normalization and validated ID
  preservation fixed. Ambient Vercel/NOW project IDs stripped because the CLI gives
  them precedence over explicit project arguments. 28 tests and strict mypy pass;
  independent review confirms hosted monorepo roots and cross-target link behavior.
  Installed checksum-verified Cosign3.0.6 at
  C:/Users/MSI/.codex/toolchains/cosign-3.0.6/cosign.exe.
- Worker+private engine use shared killable subprocess boundary;166tests passed,
  including real disconnect handling. Clean full integration30passed186.42s.
  Final fresh schema replay26pgTAPfiles441assertions passed including eight RI
  regressions. Secondary fixture cleaned; main report/browser fixture retained.
- Survey preview/import digest binding + calibration from saved runs implemented.
  Bound report UI/API/worker lifecycle implemented. Actual admitted synthetic
  engineering survey → comparison → report persisted successfully. Independent
  browser approval/export/revocation PASSED at1440/390 with no Axe/overflow/errors;
  author self-review403 and source-rights revocation denies content/export409.
  Receipts live-bound-report-verification.json and live-report-source-rights.json.
  Backtest remains pending.
  Real-path testing fixed retained-run SELECT missing created_by and source-version
  FK checks needing minimal UPDATE(id) grant to postgres (no runtime role grants).
  Independent review additionally fixed parent-source author omission in reviewer
  independence; both parent/version authors now required, including existing
  manifest checks. 37 focused tests pass.
- Added readinessV5 migration20260905095453, preserves V4 oldhead for rollback.
  Actual local API/worker V5newhead true and API V4oldhead true. Two initial role
  failures diagnosed; final invokerV5 delegates catalog presence to minimal
  private definer helper without giving worker api schema USAGE.
- Runtime required head and query calls advanced to V5. Pending report migration
 20260905095036 + readiness migration have NOT been applied to production.
- Contracts regenerated through bound report API routes; database.ts generated and
  independent byte comparison passed.
- Local Nest262tests pass; real Phase2 browser7pass28.7s, public5pass8.2s.
  First local attempt used wrong3100/3000port; corrected before passing rerun.
- Synthetic Redis8.2.1→8.2.7→8.2.1 RDB drill passed13.483s; isolated fixture removed.
- Additional runtime42faulttests and5realqueue cases pass; four real child slots
  enforce429/reap/reuse. Local real Prometheus→Alertmanager→fake sink alert/recovery
  passed. Historical hosted rollback clusters confirmed, shutdown cause unproven.
- Production smoke preparation confirmed Auth admin read access with secret
  captured only in memory. Planned fresh email_confirm:true synthetic users plus
  supported app invitation acceptance avoids mail and existing user mutation.
  Secret-free plan: tmp/release-585d633-smoke-plan.md; no production users created.
- Latest root invocation passed format/lint/typecheck, web180/admin23/Nest262/
  contracts7/dev3 tests, then Python705passed/3Windows-platformskips/1failure.
  Failure identified final RESET ROLE in new report migration; removed to preserve
  hosted postgres history writer, and all27deployment tests passed. Independent
  fresh build4/4 passed31.4s. This is a successful scoped rerun, not a single green
  root invocation; final hosted gate will execute the complete immutable source.

## Local resources and next actions

Main disposable Supabase config tmp/runtime-remediation-20260905/supabase/config.toml,
ports56321/56322, Redis6387, API8017. API/worker PIDs recorded by agent in
tmp/runtime-remediation-owned.json; Next dev3100 launched through ignored
tmp/remediation-next.cjs (exec session55134). Public test values in ignored
.env.remediation; never print them. Existing ERP54322 must remain untouched.

Finish agent slices, fresh schema replay/types, regenerate any later contracts,
full root checks/browser/independent review, commit exact files, final signed
release and compatible verified promotion. Preserve untracked user audit/design/
tmp/output assets. Only add known task files. Prepare/current rollback targets in
RELEASE_TARGETS.md; provider builds explicitly derivatives of signed source.

User has a pending question for approved legal/privacy/terms/retention/account
deletion policy. Do not invent commitments or treat elapsed time as an answer.

## Latest active verification (10:36 UTC)

- Root `pnpm check` session87590 PASSED: format/lint/typecheck186files; web184,
  admin23, Nest262, contracts7, dev3 and Python718 passed. Three Windows platform
  skips,31integration deselected (separate integration evidence above). Fresh build
 4/4 builds and generated contracts/claims/secrets passed. This invocation
  deliberately uses valid-shaped synthetic release
  metadata to exercise CI health behavior; its outputs are not deployment inputs.
- Backtest API/core/worker/UI now connected without additional DDL. Six endpoints
  have regenerated contracts and expanded exact golden inventory; all lists page.
  Independent review fixed swallowed insufficiency and legacy missing observations.
  Campaign agent completing actual local flow and final report/backtest screenshots.
- Main fixture API/worker latest PIDs30580/32708, both ready200. No data reset.
- Public/admin agent updating eight docs and checking bounded real admin pagination
  on disposable data; real141-row pagination beyond100 and refresh/filter behavior
  pass. Found390px viewport overflow; agent authorized narrow root-cause fix and
  actual recheck. No production smoke accounts or application deployments yet.
- Next: finish actual flow, collect full root result, stage only known team changes,
  final commit/push and new tag. Required history gate must include9b52dde config;
 585d633 cannot be promoted because its required checks failed. Then verify signed
  archive, apply exact two additive migrations from verified source using linked
  Supabase CLI (dry-run already confirms target and only those two), deploy explicit
  existing services with receipt and rollback, and perform production smoke.

## Admission closure and final local UI evidence (10:47 UTC)

Backtest final real API/worker/custodian upload and refresh verification passed;
report/backtest/calibration desktop and mobile views had zero recorded Axe,
overflow or page errors. Revoked-source reads were denied. Admin real141-row
pagination and390px layout verification passed after a positioned table wrapper.
The final full root check passed718 Python tests plus184 web,23 admin,262 Nest,
7 contracts and3 developer-tool tests, with four successful production builds.
Three Windows-specific skips and31 separately scoped integrations remain explicit.
Subsequent focused backtest47 tests and final admin build also passed.

A release-blocking discovery: Campaign Lab inserts did not consult the existing
operator admission latch. New migration20260905104327 adds atomic global bounded
admission with paused idempotent replay preserved. The published earlier migrations
remain unchanged. V5 advances to the new head and checks an enabled exact trigger;
V4 retains the old rollback contract. Disposable concurrency and full pgTAP checks
are in progress. No production application deployment or new database migration
has been applied. Root57 restore/deployment/promotion tests and formatting passed
after the head change. An initial test invocation named a nonexistent file and ran
no tests; the corrected actual file invocation passed.

Main fixture last restarted by runtime agent: API31228,worker2748. Its data remains.
Final signed release must include9b52dde and all staged backtest/admin/guard fixes;
585d633 failed hosted gates and cannot be promoted. The new linked database dry-run
must show all three pending additive migrations. Production smoke harness is being
prepared without creating production accounts yet. Approved legal policy remains
an unanswered user dependency; no commitments will be invented.

Final admission verification: fresh replay and all27 pgTAP files/458 assertions
PASSED; exact pressure/idempotency errors, concurrent cross-tenant final-slot
admission and operator-pause serialization passed. Independent generated database
types byte-check passed. Independent source review found no blocker. Linked
Supabase dry-run PASSED and lists exactly the three new migrations; no DDL applied.
Root57 deployment/restore/promotion and11 Nest admission tests passed, along with
formatting, generated contracts, claims and859-file tracked secret checks.
