# Active continuation checkpoint

User: "start doing it all now"; original attached brief authorizes implementation,
bounded agents and verified release to existing production targets. Work remains
active. Do not treat this checkpoint as completion or deployment evidence.

## Committed source and hosted gates

- Branch `codex/ux-remediation`, origin kurtgav/Simula; draft PR1.
- `8fd4f91`: broad UX/lifecycle/runtime remediation with prior local root checks.
- `f9842444518679866916da1ea917df5ffefddc2c`: signed source manifest/promotion tool
  and corrected readable browser assertion. Current branch HEAD.
- First signed run33958326577 failed old authored_demo expectation. Failure
  evidence artifact5522364bytes retained. Corrected browser flow passes locally.
- Second signed run33958761514 SUCCESS, including container scans and signing.
  Downloaded artifact independently verified with Cosign and source/config/schema
  checks. It excludes newer uncommitted report/deadline/schema changes.
- PR CI33959426373: all four required gates SUCCESS, independently checked through
  the promotion guard. No application promotion.

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
