---
title: SIMULA Security Control and Test Matrix
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-17
owner: Security lead
classification: PROPOSED
source_of_truth: true
---

# SIMULA Security Control and Test Matrix

No control is implemented merely because it is specified here. Evidence column names the proof required before the relevant phase gate.

| ID | Threat | Prevention | Detection | Response | Required evidence | Owner/phase |
|---|---|---|---|---|---|---|
| T-01 | Cross-tenant/object or API-bypass access | JWT/JWKS validation; application schemas absent from browser Data API; dedicated `simula_api`; transaction-local verified claims; API object checks; no direct runtime DML; complete atomic command helpers; self-only membership read; default-deny RLS; composite FKs | auth/bypass-denial anomaly metrics; RLS/grant metadata audit | disable endpoint, revoke role/function grants, rotate DB credential, incident | `SEC-RLS-001` table×operation×role; `SEC-DATA-API-001`; `SEC-ROLE-001`; `SEC-CLAIMS-001`; `SEC-API-001` foreign UUID tests | Backend+DB / P2, independent review P5 |
| T-02 | Service/secret leakage | publishable-only browser Auth config; separate least-privilege API/worker DB credentials; no service-role key; `.env` ignore; non-root images | secret scan source/build/logs/bundle; canary invalid-credential alert | revoke/rotate role password, disable service, purge logs, incident | `SEC-SECRET-001` git/build scan; `SEC-BUNDLE-001` browser bundle scan; runtime role/grant inventory | Platform / P2+P5 |
| T-03 | Prompt injection/output handling | stimulus delimited as data; no tools/retrieval; structured schema; escaped rendering | invalid schema/content metrics; adversarial corpus | fail run; disable provider/config; preserve safe evidence | `SEC-LLM-001` injection corpus; `SEC-XSS-001` output render tests | Method+Security / P2 mock, P3 real |
| T-04 | Malicious upload | no upload endpoint in P2/P3; future size/signature/quarantine/scan | rejected-content metrics; malware alerts | quarantine/delete, revoke access, incident | `SEC-ROUTE-001` route inventory proves absent; future upload suite | API / P2; future P4 |
| T-05 | Provider/confidential egress | deterministic no-network mock; admission/data-minimization gate; worker egress allowlist later | external-call count/egress monitor; provider audit | kill switch, rotate key, cancel jobs, provider deletion request | `SEC-EGRESS-001` network-deny test; provider conformance before enable | Worker+Privacy / P2+P3 |
| T-06 | Queue replay/forgery/deserialization/lost or duplicate side effects | atomic run+outbox; API cannot claim/confirm; exact typed/ranged ARQ-v0.28 envelope + canonical JSON/no pickle; service-only confirmation requires atomic exact job plus target-queue score—never queue-agnostic in-progress-only state; worker binds context job ID/payload run/generation before manifest work and transport-defers only exact-current-unconfirmed or organization-capacity-full intent; bounded queued/stale-processing recovery; DB-global attempt/generation caps; state-aware poison CAS; lease token; unique result | unsafe-code canary, envelope-field denial/worker liveness, consumer/confirm interleavings, wrong/missing queue-membership denial, forged job/context/current-outbox denial, unresolved age/state/lease/attempt/generation, poison, duplicate, invalid-transition metrics | pause consumer, isolate raw key, replay clean outbox, recover pre/post-claim/retry loss, reconcile state/cost | `SEC-QUEUE-CODEC-001` every missing/extra/wrong-type/range field plus pickle/exact `f=''→None` failure/no-side-effect/liveness; `INT-OUTBOX-001` consumer-before/after-confirm, matching key without/wrong ZSET/in-progress-only, Redis loss before/after claim/during retry, active lease, caps, mismatch/forgery/poison; `INT-CANCEL-RACE-001`; `INT-QUEUE-001` missing/malformed/cross-run job ID, guessed run, wrong/stale/future generation, bounded unconfirmed/capacity handshake; `API-IDEM-001` | Backend / P2 |
| T-07 | Denial of wallet/resource exhaustion | exact [[../Architecture/RESOURCE_LIMITS|body/rate/quota/concurrency/backpressure/deadline limits]]; org-row-serialized active-slot cap including cancel-requested live leases; no-attempt capacity defer; provider cost reservation | rate/quota/cost/queue-age/memory/capacity alerts | throttle, disable run creation/provider, preserve outbox/cancel queued work | `SEC-LIMIT-001`, `LOAD-RATE-001`, `INT-BACKPRESSURE-001`, `INT-WORKER-LIMIT-001` same-org/cancel-active/different-org concurrency; mock external cost=0 | API+SRE / P2, harden P5 |
| T-08 | Export/share leakage | no export/share P2; later private storage, object auth, short expiry, revoke/audit | share/download anomalies | stop issuance, revoke grants, delete artifacts, incident | `SEC-ROUTE-002` absence in P2; future `SEC-SHARE-*` | Product+Security / P2 deferred, P4 |
| T-09 | Audit tampering/gaps | restricted append-only store; atomic high-risk audit; no user U/D grant | audit-write failures/gaps; periodic sequence check | block risky mutation, preserve external evidence, incident | `SEC-AUDIT-001` grant/tamper/atomicity tests | Security+DB / P2+P5 |
| T-10 | Supply-chain/build compromise | exact pins/locks/actions; minimal deps; SBOM; reviews; non-root images | npm/pip audit, dependency review, artifact provenance | block build, revoke tokens, revert lock/artifact | `SEC-SCA-001`; lock drift; image scan; SBOM | Platform / P2+P5 |
| T-11 | Secrets/content in logs | allowlisted structured fields; redaction; no payload/query/token logging | forbidden-key/content canaries; log tests | stop exporter, rotate secret, purge where possible, incident | `SEC-LOG-001` property/canary tests across errors | All services / P2 |
| T-12 | Deletion/retention failure | data inventory; lifecycle jobs; tombstones; no content in queue/log; provider gate | overdue-retention/deletion reconciliation | disable affected data path; repair/purge; notify owner | `PRIV-DEL-001` seeded object graph deletion; restore+tombstone drill P5 | Data+Privacy / P2 spec, P5 proof |
| T-13 | Method/config/result tampering | append-only versions; hashes; registry/admission; frozen manifest; result unique | hash/version mismatch and unauthorized-write alerts | disable version, retire results/config, rerun evaluation | `INT-PROV-001`; `SEC-CONFIG-001`; DB immutability tests | Method+DB / P2+P3 |

## API baseline

Also required by E-4013: object/function authorization, bounded input/page/work, SSRF-safe outbound allowlists, exact CORS, endpoint inventory, safe third-party timeout/schema handling, and no debug/admin surface in public production.

## Severity gate

- Any successful T-01/T-02/T-05 secret or cross-tenant test is Critical and blocks phase exit.
- Any forbidden external provider call in Phase 2 is Critical.
- Any raw credential or confidential stimulus in logs/build artifact is Critical.
- High findings need an owner, deadline, disabled feature or compensating control; no silent acceptance.
