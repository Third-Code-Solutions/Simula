# UX and production remediation — 2026-09-05

## Delivery contract

User outcome: a coherent, understandable SIMULA interface from account entry to
organization, project, campaign and result, with reliable commands and honest
evidence status. The attached remediation brief also authorizes runtime fixes,
verification and release to confirmed existing targets after release gates pass.

Design: warm neutral surfaces, one deep-green action color, readable sans-serif
workspace type, compact headings, contextual navigation, purposeful disclosure.
Keep existing frameworks, authentication, scientific boundaries and data.

## Sequence and acceptance

1. ACTIVE — establish source/toolchain baseline, route coverage and defects.
2. IMPLEMENTED, verification active — refactor shared workspace navigation/layout, landing/account and admin UI.
   Acceptance: clear entry/return paths, no inaccessible navigation wall on mobile,
   visible focus, loading/error/empty states, no unsupported claims.
3. IMPLEMENTED, regression/browser verification active — repair Campaign Lab command/state lifecycle and structured forms.
   Acceptance: same logical retries retain keys, stale responses cannot replace
   selection, polling is bounded, supported tasks don't require default JSON.
4. Repair confirmed runtime/security/release failures with regression evidence.
5. Run fresh static/unit/build/browser/security checks and reconcile failures.
6. Promote only a verified immutable release with rollback inputs; record actual
   deployed identity and smoke results. Any external blocker remains explicit.

## Ownership

- Primary: shared web styles/navigation, organizations/projects/results, API client,
  integration, ledger and final release decision.
- campaign_ux: Campaign Lab route and tests only.
- public_admin_ux: public landing/account proof styles and admin UI only.
- runtime_release: Python runtime/scripts/tests and workflow diagnostics only.

## Safety and rollback

Initial main HEAD has no tracked modifications; existing untracked audit, design,
output and tool artifacts are user-owned and preserved. Work uses
`codex/ux-remediation`. UI changes require no schema migration. Revert the specific
remediation commits to restore prior UI. Production rollback must reference the
actual preceding provider artifact before promotion; do not infer compatibility.

## Evidence and checkpoint

- Read AGENT.md, brain home/state, active plans, ADR-0011, Sept 5 audit/verification.
- Existing audit reports are hypotheses, not fresh passes.
- Initial runtime: Node 24.16.0 versus required 24.18.1; pnpm 11.13.1.
- Exact isolated toolchains exist and are being checked by runtime workstream.
- No release, hosted mutation, whole-suite pass or scientific validation claimed.
- Next: implement contextual navigation and shared workspace visual hierarchy.

## Checkpoint — resumed after user requested continuation

- Local UX: contextual collapsible navigation; compact shared type/neutral palette;
  searchable organization/project inventories; recent work precedes dashboard
  operations; simplified public/auth/admin; data-use information page.
- Campaign Lab: task sections, structured editors, idempotency keys, abortable
  polling, keyed campaign state, URL recovery and authorized run history endpoint.
- Shared review fixes: removed broad button-color override; project access retry;
  evidence context failures visible with retry; calibration controls remain gated.
- API client: 30s transport deadline, cancellation signal, stable command key option.
- Security: patched browserslist/fast-uri/qs pins, removed obsolete brace exception;
  framing/content-type/referrer headers added. Full frozen JS relink in progress.
- Runtime: full isolated CPython available; Python suite 616 passed,3 platform
  skips,29 integration deselected; no excluded files. See runtime evidence.
- Current verification: focused web API/navigation/evidence 31 passed before added
  evidence retry regression. Initial 4 public browser tests passed; final rerun
  must follow dependency reinstall. No deployment.
- BLOCKER: Docker engine unavailable; no DB replay/full dependency E2E proof.
- Next: finish frozen dependency install, complete visual inspection, static/unit/
  build/security gates, update generated contracts, document exact release blockers.

## Current verification checkpoint — continued implementation

- PASSED: frozen pnpm11.13.1 installation using exact Node24.18.1; final online
  prefer-offline retry completed in6m53s after an offline cache miss. No lockfile
  bypass or weakened supply-chain policy.
- PASSED: fresh `pnpm audit --audit-level=moderate`, no known vulnerabilities.
- PASSED: forbidden-claim policy188 files; working-tree secret baseline1675 files.
- PASSED: synthetic actual-component dashboard and organization visual checks at
  1440px and390px; no overflow, browser errors or Axe violations. This does not
  prove authenticated API/tenant behavior. Evidence:
  `output/playwright/workspace-visual-verification.json`.
- PASSED: admin23 tests and typecheck; API pagination8 tests (agent evidence).
- FAILED then repairing: integrated web lint found3 synchronous state updates in
  Campaign Lab effects. Other8 lint/typecheck tasks passed. Formatting found6
  files; formatting fixes underway. No rules were suppressed.
- One project-suite run during dependency relinking passed18 tests across6 files
  but failed to import Next in Campaign Lab. Final stable-install rerun required.
- Docker is now available. Disposable Supabase on alternate56320-range ports is
  being verified; existing ERP54322 and existing simula data remain untouched.
- No production deployment. Fresh build/contracts/browser and remaining runtime
  release gates are still active.

## Local verification completed

`pnpm check` PASSED after dependency/environment, effect lifecycle and test
expectation repairs. Final independent `pnpm build` PASSED4/4 uncached in29.7s,
without warnings; Turbo build caching disabled because its archive could not
round-trip Windows runtime module links. `pnpm security:sca` PASSED, no known
vulnerabilities. Python624pass/3platform skips, web173, admin23, Nest261,
contracts7 and dev harness3 tests pass. All29 integration cases have passing
results across the full run and corrected restore-fixture rerun; pgTAP404pass.
Real owner create-to-worker-success-to-refresh flow and mobile/desktop Axe pass.

Default `.venv` now uses full Python3.14.7. Old embedded environment and generated
build outputs are preserved in ignored backup directories. Owned disposable
services/data/networks were removed; unrelated ERP and user files preserved.
No production deployment or signed artifact promotion. Current active step is
release/governance closure; open acceptance is tracked explicitly in
REMEDIATION_TRACKER.md and final evidence in REMEDIATION_VERIFICATION.md.

## Release continuation — 2026-09-05

User requested all remaining work immediately. Active step: close release gates
and remaining evidence/runtime workflows before application promotion.

- LIVE VERIFIED: Supabase leaked-password protection enabled; advisor cleared.
- LIVE VERIFIED: main requires four CI checks and a PR (zero approvals for solo
  owner); production GitHub environments restrict deployment branches to main.
- Production inventory: all81 migration versions/head20260824020000 match;
  no nonterminal durable runs at09:42UTC. Exact migration source-byte equivalence
  and Redis persistence recovery remain unverified. See RELEASE_TARGETS.md.
- Signed run33958326577 FAILED browser assertion expecting internal authored_demo
  token after intentional readable-copy refactor. Eleven neighboring browser
  cases passed. Corrected expectation preserves all scientific disclosures.
- Commit f984244 adds signed source/config manifest, verified provider upload
  boundary, partial-attempt receipts and12passing admission unit tests. Diagnostic
  run33958761514 is active; no application deployment.
- Worker killable evaluator/deadline and preview/import binding changes are
  locally tested; broader legacy-provider and calibration binding work continues.
- Next: inspect second signed run, integrate remaining slices, regenerate
  contracts and run gates, then commit/release the final source. Deploy only
  successful signed source with current rollback targets and post-release checks.


## F16/F17 follow-up: survey preflight and immutable import binding

Scope: authorized Campaign Lab preflight uses the same core adapters as the
worker for CSV, generic JSON, Formbricks and ODK. Uniform export budget is
200 KB within the existing 256 KiB queue codec. Preflight returns aggregate
quality counters and fingerprints only; raw input and validation exception
values are never echoed. No raw data is persisted by preview.

Queue admission independently recomputes an immutable binding of raw payload,
validated metadata/mapping/format, aggregate dataset, and optional admitted
source version in the durable run request. Worker execution checks exact binding
and includes it in its result; legacy unbound runs explicitly return null.
No database migration or approval bypass is introduced. Scientific calibration,
held-out backtesting and report approval remain quarantined pending the full
cross-run protocol and independent approval lifecycle.

UI requires review before queue; changing file, format, provenance, mapping or
source invalidates preview. Focused API/worker checks pass 56 tests. Synthetic
actual-component browser verification at 1440 and 390 px passes preview and
invalidation, with no Axe violations, horizontal overflow or page errors;
artifacts: output/playwright/campaign-lab-harness/survey-preview-*.png and
survey-preview-verification.json. This is not authenticated dependency E2E.

### Bound experimental reports (local continuation, 2026-09-05)

Implemented an authenticated campaign-scoped report workflow using persisted simulation and optional matching comparison run IDs. API derives immutable input snapshots, configuration/source/result digests and input authors. Worker recomputes bindings and leaves scientific status Synthetic-only and needs_human_review. Legacy report paths remain quarantined. No historical validation is inferred from a survey comparison or owner approval.

Independent organization owners can approve/reject exact report snapshots; authors of the report, input runs, or registry source cannot self-approve. Append-only revocation immediately blocks full report GET and export. Both content endpoints revalidate source admission and report retention. History exposes metadata only. Frontend supports saved drafts, URL recovery, rationale entry, explicit experimental approval and export with a fresh server authorization check.

Database migration: `20260905095036_campaign_lab_bound_report_review.sql`; parent-managed readiness migration `20260905095453_report_runtime_readiness_v5.sql` preserves v4 for previous-binary rollback. Direct review UPDATE/DELETE is denied; actual disposable transaction test proves deletion through the parent artifact cascades its reviews. The reviewer auth-user foreign key uses RESTRICT, consistent with existing registry authorship references. Future account deletion/anonymization needs an approved policy and corresponding engineering; this change does not invent legal retention requirements.

Verified locally: focused report API14 tests; combined new report/calibration/preview/import34 tests; core/API mypy3files; Ruff; web typecheck and campaign ESLint; report/navigation7 frontend tests. Synthetic actual-component browser at1440/390 passed Axe, overflow, refresh, review and revocation checks; screenshots inspected. Browser fixture is not real dependency E2E or scientific evidence. Runtime agent independently reports clean migration replay,25pgTAP files/433 assertions, adversarial transaction pass and generated database type byte comparison.

Remaining: parent-owned real disposable report API-worker-browser lifecycle, full repository gates/contracts/build, hosted promotion. Historical backtest remains quarantined: existing historical model accepts caller blind flag but has no campaign pre-outcome prediction registration. Existing behavioral protocol registry belongs to another engine contract; do not repurpose it silently. Next slice requires immutable campaign protocol plus prediction commitment before admitted outcomes, independent evidence custodian review, source/transform/outcome checksums and scoped result binding. Native survey saved-form recovery remains pending. No real human/historical dataset or independent scientific approval was invented.
