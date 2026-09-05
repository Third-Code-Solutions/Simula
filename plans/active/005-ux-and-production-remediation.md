# UX and production remediation â€” 2026-09-05

## Delivery contract

User outcome: a coherent, understandable SIMULA interface from account entry to
organization, project, campaign and result, with reliable commands and honest
evidence status. The attached remediation brief also authorizes runtime fixes,
verification and release to confirmed existing targets after release gates pass.

Design: warm neutral surfaces, one deep-green action color, readable sans-serif
workspace type, compact headings, contextual navigation, purposeful disclosure.
Keep existing frameworks, authentication, scientific boundaries and data.

## Sequence and acceptance

1. ACTIVE â€” establish source/toolchain baseline, route coverage and defects.
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

## Current verification checkpoint â€” continued implementation

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
