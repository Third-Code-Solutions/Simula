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

The working product passes the complete local database/API/worker/web journey and the checked-in migration set is applied to hosted Supabase project `ywiwmczccktwzqyhzhiz` through `20260719050000`. No customer data, `seed.sql`, real-provider egress, hosted application deployment, or production-readiness claim is included.

## Verified evidence

| Gate | Result |
|---|---|
| Root `pnpm verify` | PASS, exit 0 |
| Database replay | two clean resets; lint clean; pgTAP 59/59 |
| API/database focused gate | API 61/61; Auth/API/Redis/database integration 5/5 |
| Browser gate | Playwright 9/9; desktop/mobile Axe, keyboard focus, result/error/poll/failure/cancel flows |
| Repository unit gate | Python 204 passed, 2 expected Windows skips; web 43/43; contracts 2/2 |
| Complete integration | 22/22, including replay/concurrency, queue recovery, deterministic golden, load, deletion, and isolated restore |
| Build/contracts/security | Next and TypeScript builds, generated DB/OpenAPI drift, forbidden claims, secret baseline, npm/Python SCA all pass |
| Hosted Supabase | dry-run named only `20260719050000`; push succeeded; local/remote histories match; linked lint and security advisors clean; v1 retained/revoked and v2 solely active with exact checksum |
| Governance integrity | 58/58 frontmatter; 151/151 wikilinks; 105 unique evidence definitions; zero undefined references; active plan sections 1–11 intact |

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

## Open findings

No known Critical or High code finding remains from the focused remediation reviews. These exit items remain:

| Severity | Finding | Required closure |
|---|---|---|
| High — governance | GitHub required-check enforcement is unavailable on the current private-repository plan; protection/ruleset APIs returned `403`. | Authorized plan/visibility change or equivalent enforceable merge control. |
| Exit evidence | Human keyboard/screen-reader smoke is not recorded. Automated keyboard, accessibility-tree, responsive, and Axe proofs pass but are not a substitute. | Human assistive-technology pass on the current build. |
| Exit evidence | A full independent cross-domain Phase 2 exit re-review has not passed after E-5032. The focused rate-state review passed but is not a substitute for the complete exit review. | Repeat the independent Phase 2 exit review against the current tree and record a pass. |
| Medium | Deletion is proven as privileged PostgreSQL cascade, not as a user-facing API plus Redis/storage/cache cleanup workflow. | Add authorized deletion orchestration before user-facing retention/deletion claims. |
| Medium | Restore proves PostgreSQL rows and migration history, not runtime owners/grants, Auth, API/worker, queue/storage, or tombstone compatibility. | Run the full application-compatible staging restore drill. |

## Stop condition

Code/build/database deployment for the requested Phase 2 working skeleton is green. Implementation stops here pending the human accessibility proof, independent exit re-review, and governance decision. Those are not silently converted into code completion.
