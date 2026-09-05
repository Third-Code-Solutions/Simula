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

## Final hosted release dispatched (10:50 UTC)

Source eb0ea931a180f1912f690be5648a6fb4a6557ab0 is committed/pushed with all49
final changed files. Immutable tag v0.0.0-remediation.20260905.4 dispatched signed
release33961707670. PR CI33961704707 and exact-branch manual CI33961708123 are
running; no success presumed. Final seven-target plan tmp/promotion-final-plan.json
binds this SHA and104327 head. No application deployment or production DDL yet.
Executable tmp/release-smoke.cjs passed46 real local assertions; production mode
requires exact canonical identities before creating fresh confirmed synthetic
accounts, keeps credentials memory-only and performs role/worker/browser checks.
Runtime agent is preparing separate private behavioral/dispatcher verification.

Hosted follow-up: exact-branch CI33961708123 Windows and history gates PASSED;
Foundation root gate and signed release33961707670 still running. No failure
reported. Private SSH probe is BLOCKED by no configured SSH keys; no key/access
change made. Read-only provider fallback collected old image/startup evidence in
tmp/private-provider-evidence.json. Re-run helper after release. Production smoke
now accepts --behavioral; helper keeps owner credentials in memory and persists
partial stimulus/run IDs before later failures. Both syntax checks pass; actual
production behavior NOT RUN. Read tmp/private-runtime-verification-README.md for
outbox confirmation query and limits. Secondary57322 fixture stopped; main/ERP
preserved. Approved legal policy remains pending.

Hosted Foundation33961708123 completed SUCCESS. Its actual log reports27files/
458 pgTAP assertions,720 root Python passed/2skipped/31deselected, all31 integrations
passed,12 browser checks,184web/23admin/262Nest tests. Windows and history also
passed. Images built; container/SBOM checks and final signing remain running.
Seven current rollback targets refreshed and passed availability preflight. Safe
receipt docs/audit/2026-09-05/hosted-final-foundation.json; raw log ignoredtmp only.

## Production rollout started

Signed release33961707670 and allfour latest exact-SHA CI checks PASSED.
Artifact downloaded to tmp/release-remediation-33961707670; independent Cosign,
source hash,84migration checksums and configurations verified. Exact archive
extracted tmp/verified-source-eb0ea93, linked onlyywiwmczccktwzqyhzhiz. CLI dryrun
showedexact3pending; all3applied successfully. Livehead104327/report+guardtrue,
V4oldheadpreserved,V5newheadpresent,nonterminal0; previousAPIstillready4b17ba4.
Receipt docs/audit/2026-09-05/production-migration-receipt.json.

Primary promotion command RUNNING execsession57546; receipt
 tmp/promotion-final-33961707670.json. Engine candidate
f99b6929-32fd-49d6-8468-ae0ed9ddd4cf providerSUCCESS; worker submissionstarted.
It sequentially deploys engine,worker,dispatcher,control-plane,API,web,admin from
verifiedsource; Vercel candidates use skip-domain. Do not double-submit: inspect
receipt and exactproviderstate if commandfails. No canonicalVercelpromotion yet.

## Vercel package-manager mismatch and scoped retry

Primary57546 ended after allfive Railway services reachedSUCCESS. API candidate
41008d68-a16a-423f-a483-e5f725f433ca andCP9a24c030-21c0-4490-ae1d-e42d431caee9
serve ready with exacteb0ea931 SHA. Webattempt dpl_72tJ7Joi1xVn5zyumNmwfm5eG1nq
(simula-8fvvmvlc3-pavi-2e9809a4.vercel.app) ERROR: defaultVercelpnpm11.22.0 rejected
repositorypin11.13.1. Canonicals unchanged. No blindretry: exactfailedID/buildlog
inspected. TemporaryDirectory cleanup thenhitWindowslockedparent; failure receipt
was already persisted. Do not recursivelyremove unknown tempfiles.

OfficialVercelCorepackdocs support ENABLE_EXPERIMENTAL_COREPACK=1. Bothconfirmed
productionprojects lacked this flag. Added onlyplainproductionflag via supported
API: webenvIDmwdb3Nc2U9WG4ePT,admin58V0QgVsrtBCT1bX; oldvalueabsent. No version
validationbypass or sourceedit. RetryonlyVercel uses ignoredhelper
 tmp/promote-vercel-final.py with freshsignedverifiedsource
 tmp/verified-vercel-eb0ea93; preservesoriginalrolloutID and rechecksSigstore/CI.
RUNNINGsession66272; receipt tmp/promotion-vercel-final-33961707670.json. NoVercel
canonicalpromotion yet. Inspect receipt/providerstate iffailure, neverrerunallfive
backenddeployments. Privatecandidate receipt copied production-private-candidate-
evidence.json; exactworkerstartSHA,dispatcherstartready,0samplederrors,imagedigests.

Vercel retry66272 failed before any newprojectdeploymentappeared; originalgeneric
CLIoutputnotretained. CLI sourcefindRepoRoot can traverse ancestorGit metadata,
so next diagnostic retry uses freshverifiedsource outsideworkingrepo at
C:/Users/MSI/.codex/verified-releases/eb0ea93-vercel. No sourcechanges. RUNNING
session54561; receipt tmp/promotion-vercel-final-33961707670-v2.json. Private
failureoutputis retainedonlyifneeded tmp/vercel-deploy-diagnostic-private.log.
Candidate simula-o4zc71pi1-pavi-2e9809a4.vercel.app nowBUILDING. Actualbuildlogs
confirmCorepackselectedpnpm11.13.1, dependenciesinstalled8s. Canonicalsunchanged.
Postreleaseonlytoolfix currentlyuncommitted: TemporaryDirectoryignore_cleanup_errors
preventsWindowscleanupmasking originalfailure;29tests+Ruff+mypyPASS. Donotretagor
mistakepostreleaseworkingtree for deployedsource.

## Canonicals promoted; real production smoke running

Both Vercel candidates READY. AuthenticatedCLIhealth exactSHA forweb/admin;
Vercelcurl must useURL (IDlookupfailed) and processenvproject/org for correct
bypass; --scope mistakenlyforwarded tocurl inCLI54.7.1. Protectedcandidate actual
browser sixviews1440/390 passed200/securityheaders/Axe0/overflow0/errors0 with
memoryonlybypasscookies, no protectionchanges. Receipt copied production-protected-
candidate-verification.json. Web dpl_AzpLsWJmcimpe3HExVv8UbxDni41 andadmin
 dpl_6mZfv3Xi5VbrmssSu5SCFpbtud4f promoted successfully via explicitscopeCLI.

Production smoke RUNNINGsession60513, exactcommand
node tmp/release-smoke.cjs --target production --execute --sha
 eb0ea931a180f1912f690be5648a6fb4a6557ab0 --behavioral.
Receipt tmp/release-smoke-production-48efa060-5e40-42a7-924c-fa3800245e9a.json.
48assertionspassedsofar, last1440pxnooverflow. Fresh4confirmedAuthaccountscreated
(noemails), IDsreceipt, credentialsmemoryonly. Campaignworkerterminal+reload and
rolechecks passed; behavioralstepstillpending. Do notrerun blindly ifuncertain;
inspect partialfixtureIDs, preserve records, no existinguserchanges.

## Production verification complete

Production smoke60513 PASSED52assertions. Behavioralrun
 d6918fe8-423d-4bf6-80ad-21e5b44e63ec succeeded inabout5s, exactidempotentreplay,
persistedexperimentalzero-costdeterministicresult/checksum. Readonlyoutboxquery:
1dispatchedgeneration,1confirmation,1dispatchattempt. Postsmokeexactdispatcherlog
has dispatcher_pass11:29:55.317990718Z claimed1/confirmed1/recovered0/poisoned0.
Allthreecandidateprivate servicesSUCCESS with0classifiedsamplederrors. Updated
production-private-candidate-evidence.json. Allsafe receipts copieddatedaudit.
RootRELEASE_RESULT.md written; publicagent updatingcurrentdocs/tracker toactual
verifiedscope. No pendingapplicationdeployment. Remaining externallegalpolicy,
scientificvalidation, directSSHhealth and unexercisedrollback boundariesexplicit.
Postreleasepromotioncleanup-toolregression29PASS; tooling/docscommitpending,
applicationreleasedSHA remains eb0ea931 regardlesslaterauditcommit.
