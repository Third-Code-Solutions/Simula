---
title: SIMULA Phase 2 Audit 2026-07-18
status: final
created: 2026-07-18
updated: 2026-07-18
owner: Principal program and engineering lead
classification: OBSERVED
source_of_truth: true
---

# SIMULA Phase 2 Audit — 2026-07-18

## Decision

Implementation gate: **PASS**. Formal Phase 2 exit: **OPEN**. Phase 3 is not authorized.

The working product passes the complete local database/API/worker/web journey and the checked-in migration set is applied to hosted Supabase project `ywiwmczccktwzqyhzhiz` through `20260719040000`. No customer data, `seed.sql`, real-provider egress, hosted application deployment, or production-readiness claim is included.

## Verified evidence

| Gate | Result |
|---|---|
| Root `pnpm verify` | PASS, exit 0 |
| Database replay | two clean resets; lint clean; pgTAP 58/58 |
| API/database focused gate | API 60/60; Auth/API/Redis/database integration 5/5 |
| Browser gate | Playwright 9/9; desktop/mobile Axe, keyboard focus, result/error/poll/failure/cancel flows |
| Repository unit gate | Python 198 passed, 2 expected Windows skips; web 43/43; contracts 2/2 |
| Complete integration | 22/22, including replay/concurrency, queue recovery, deterministic golden, load, deletion, and isolated restore |
| Build/contracts/security | Next and TypeScript builds, generated DB/OpenAPI drift, forbidden claims, secret baseline, npm/Python SCA all pass |
| Hosted Supabase | dry-run named only `20260719040000`; push succeeded; local/remote histories match; linked lint clean in `api`, `extensions`, `private`, and `public` |
| Governance integrity | 58/58 frontmatter; 151/151 wikilinks; 104 unique evidence definitions; zero undefined references |

The Supabase Table Editor's `public` schema remains empty by design. Application relations live in non-exposed `api` and `private` schemas behind dedicated runtime roles, forced RLS, and function allowlists.

## Remediation closed in this increment

- General rate admission now occurs before sign-in audit database work; a rejection test proves zero audit writes.
- API and worker metrics now cover bounded database query count/duration, pool use, migration head, forced-RLS status, durable run-state counts, stuck leases, cancellation age, visibility extensions, duplicate delivery, invalid transitions, retries, terminal failures, provider failure classes, and cancellation-finalization duration.
- Aggregate observability is exposed only through a fixed security-definer snapshot for `simula_api` and `simula_worker`; browser roles are denied and no tenant/content/row identifier becomes a metric label.
- The run-disable alert contract has a checked runbook, release owner, severity, and `recovery_verified` silence rule.
- The isolated restore drill now asserts migration head `20260719040000` and passes.

## Open findings

No known Critical code finding remains. No known High code finding remains from the latest API/auth/observability review. These exit items remain:

| Severity | Finding | Required closure |
|---|---|---|
| High — governance | GitHub required-check enforcement is unavailable on the current private-repository plan; protection/ruleset APIs returned `403`. | Authorized plan/visibility change or equivalent enforceable merge control. |
| Exit evidence | Human keyboard/screen-reader smoke is not recorded. Automated keyboard, accessibility-tree, responsive, and Axe proofs pass but are not a substitute. | Human assistive-technology pass on the current build. |
| Medium | Audience version 1 was historically updated in place; full policy-manifest checksum governance is incomplete. | Add immutable version 2 for any future change and checksum the complete policy manifest. |
| Medium | Deletion is proven as privileged PostgreSQL cascade, not as a user-facing API plus Redis/storage/cache cleanup workflow. | Add authorized deletion orchestration before user-facing retention/deletion claims. |
| Medium | Restore proves PostgreSQL rows and migration history, not runtime owners/grants, Auth, API/worker, queue/storage, or tombstone compatibility. | Run the full application-compatible staging restore drill. |
| Medium | A rejected idempotent request can retain its rate marker and bypass later general-rate consumption for that key. | Bind marker lifetime to an accepted attempt or explicitly consume/refund on rejection. |
| Medium | Generated OpenAPI drift is checked, but breaking-diff policy and the stable error inventory are incomplete. | Add breaking-change classification and include `request_deadline_exceeded` in the governed error inventory. |

## Stop condition

Code/build/database deployment for the requested Phase 2 working skeleton is green. Implementation stops here pending the human accessibility proof, independent exit re-review, and governance decision. Those are not silently converted into code completion.
