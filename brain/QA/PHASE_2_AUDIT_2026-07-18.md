---
title: SIMULA Phase 2 Audit 2026-07-18
status: final
created: 2026-07-18
updated: 2026-07-20
owner: Principal program and engineering lead
classification: OBSERVED
source_of_truth: true
---

# SIMULA Phase 2 Audit — 2026-07-18

## Decision

Implementation gate: **PASS**. Formal Phase 2 exit: **OPEN**. Phase 3 is not authorized.

The working product passes the complete local database/API/worker/web journey and the checked-in migration set is applied to hosted Supabase project `ywiwmczccktwzqyhzhiz` through `20260720083000`. All Phase 2 code remediation and independent code review are complete. No customer data, `seed.sql`, real-provider egress, hosted application deployment, or production-readiness claim is included.

## Verified evidence

| Gate | Result |
|---|---|
| Root `pnpm verify` | PASS, exit 0 |
| GitHub Actions | Run `29728979248` PASS on exact head `72f1a66cf1a0be8e589f9ef5f88a84eb5cfcb10d`; Foundation, Windows, history-secret, and hardened three-image container jobs green |
| Database replay | two clean resets; lint clean; pgTAP 68/68 |
| API/database focused gate | API 64/64; Auth/API/Redis/database integration 5/5 |
| Browser gate | Playwright 11/11; desktop/mobile Axe, keyboard focus, result/error/poll/failure/cancel/provenance flows |
| Repository unit gate | Python 231 passed, 2 expected Windows skips; web 57/57; contracts 2/2 |
| Complete integration | 23/23, including replay/concurrency, queue recovery, deterministic golden, load, deletion, audited operator control, and isolated restore |
| Build/contracts/security | Next and TypeScript builds, generated DB/OpenAPI drift, forbidden claims, secret baseline, npm/Python SCA all pass |
| Hosted Supabase | dry-run named only `20260720083000`; seed-free push succeeded; local/remote histories match; linked lint and security advisors clean; operator role/function ACLs verified; run creation remains enabled |
| Governance integrity | 58/58 frontmatter; 152/152 wikilinks; 106 unique evidence definitions; zero duplicates or undefined references; active plan sections 1–11 intact |

The Supabase Table Editor's `public` schema remains empty by design. Application relations live in non-exposed `api` and `private` schemas behind dedicated runtime roles, forced RLS, and function allowlists.

## Remediation closed in this increment

- General rate admission now occurs before sign-in audit database work; a rejection test proves zero audit writes.
- API and worker metrics now cover bounded database query count/duration, pool use, migration head, forced-RLS status, durable run-state counts, stuck leases, cancellation age, visibility extensions, duplicate delivery, invalid transitions, retries, terminal failures, provider failure classes, and cancellation-finalization duration.
- Aggregate observability is exposed only through a fixed security-definer snapshot for `simula_api` and `simula_worker`; browser roles are denied and no tenant/content/row identifier becomes a metric label.
- The run-disable alert contract has a checked runbook, release owner, severity, and `recovery_verified` silence rule.
- The isolated restore drill now asserts migration head `20260719050000` and passes.

## 2026-07-19 remediation addendum

- Audience governance now retains revoked v1, admits immutable semantic v2, constrains the full canonical manifest checksum, permits exactly one active version, and resolves runtime selection by the stable audience identity. The seed-free migration is verified locally and on hosted Supabase.
- Redis admission markers now scope the exact actor, organization, resource, command route, and idempotency key; use per-attempt ownership; retain fixed non-sliding TTLs; promote accepted attempts best-effort after durable commit; and acquire the run user/organization buckets atomically. The focused independent final review reports PASS with no High or Medium finding.
- RFC 9457 codes now come from one typed stable inventory including `request_deadline_exceeded`; generated OpenAPI publishes that inventory; and Linux/Windows CI run a fail-closed, base-aware breaking compatibility classifier.
- Root `pnpm verify` passed 59 pgTAP, 61 API, 9 browser, 204 non-integration Python with 2 expected Windows skips, 43 web, 2 contract, and 22 complete integration tests plus build, drift, policy, secret, and SCA gates.
- Hosted migration history matches through `20260719050000`; linked lint and security advisors are clean. Existing performance-advisor recommendations remain monitored under R-031 rather than receiving speculative schema changes.

## 2026-07-20 final implementation addendum

- Forward database invariants now enforce frozen run provenance, provider receipt immutability, and exact successful-provider receipt persistence. The result interface renders the verified provider receipt without inventing historical receipts.
- Restore verification derives the checked-in migration head and preserves the source run-creation control state. Complete integration now includes audited operator disable/status/verified-enable control through a dedicated least-privilege `simula_operator` login and fixed security-definer allowlist.
- Every API and worker log is stamped with trusted service, environment, and release identity; forged values are overwritten while payload redaction remains enforced. Worker liveness now probes the running process and readiness reflects live dependencies.
- Complete-history Gitleaks uses one exact fingerprint suppression for the intentional historical injection canary; pinned Gitleaks 8.30.1 scans the complete reachable history with no leak.
- Root `pnpm verify` passes 68 pgTAP, 64 API, 11 browser, 231 non-integration Python with 2 expected Windows skips, 57 web, 2 contract, and 23 complete integration tests plus build, drift, policy, secret, and SCA gates. Hardened container gates pass in exact-head CI.
- Hosted migration history matches through `20260720083000`; linked lint and security advisors report zero lints. The operator has no password, memberships, elevated attributes, table privileges, or arbitrary schema creation, and exposes only the two audited control functions. Existing performance-advisor recommendations remain monitored under R-031.
- The bounded independent cross-domain code re-review is complete with no unresolved code Critical or High finding. Formal exit remains open because the required-check governance finding is High and human assistive-technology evidence is absent.

## Open findings

No known Critical or High code finding remains from the focused remediation reviews. These exit items remain:

| Severity | Finding | Required closure |
|---|---|---|
| High — governance | GitHub required-check enforcement is unavailable on the current private-repository plan; protection/ruleset APIs returned `403`. | Authorized plan/visibility change or equivalent enforceable merge control. |
| Exit evidence | Human keyboard/screen-reader smoke is not recorded. Automated keyboard, accessibility-tree, responsive, and Axe proofs pass but are not a substitute. | Human assistive-technology pass on the current build. |
| Medium — locally remediated 2026-07-30 | The audit originally found only a privileged PostgreSQL cascade. E-5070 now proves a user-facing, durable owner command with verified local object/BullMQ/Redis cleanup before cascade; E-5072 adds leased local recovery for abandoned requests. | Retain hosted populated-manifest deletion/recovery, killed-process restart, and backup-expiry propagation as Plan 003 release gates. |
| Medium | Restore proves PostgreSQL rows and migration history, not runtime owners/grants, Auth, API/worker, queue/storage, or tombstone compatibility. | Run the full application-compatible staging restore drill. |

## Stop condition

Code/build/database deployment and independent code review for the requested Phase 2 working skeleton are green. Implementation stops here pending the human accessibility proof and governance decision. Those external exit requirements are not silently converted into code completion.
