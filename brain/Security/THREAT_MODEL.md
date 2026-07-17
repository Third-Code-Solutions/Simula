---
title: SIMULA Threat Model
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-17
owner: Security lead
classification: PROPOSED
source_of_truth: true
---

# SIMULA Threat Model

> Phase 1 threat inventory. Exact prevention, detection, response, evidence, owner, and phase mapping: [[CONTROL_TEST_MATRIX|Security Control and Test Matrix]].

## Assets

Confidential stimuli, research objectives, organization membership, audience definitions, licensed/source data, provider credentials, API/worker database credentials, simulation artifacts, ground truth, exports/share links, audit logs, cost quota, method/prompt/model configuration, and backups.

## Actors

Authorized users, tenant administrators, internal operators, service identities, model/data providers, accidental insiders, malicious tenant users, external attackers, compromised dependencies, and unauthorized share recipients.

## Threats and required control direction

| Threat | Example path | Impact | Phase 1 control requirements |
|---|---|---|---|
| Cross-tenant/API bypass | Browser-reachable Data API grant, stale claim context, missing API check, or RLS predicate | Critical confidentiality/integrity breach | No application Data API exposure, dedicated server role, transaction-local verified claims, complete command helpers, deny-by-default RLS, adversarial bypass/tenant tests |
| Runtime database credential leakage | Browser bundle, logs, preview config | API-command or worker-helper abuse | Separate least-privilege server-only roles, no service-role key, scanning, rotation, grant inventory |
| Prompt injection | Stimulus instructs model/system or extracts context | Integrity/confidentiality loss | Treat content as data, isolated prompts, no unnecessary tools/secrets, adversarial tests |
| Malicious upload | Polyglot/oversize/malware/content bomb | Execution, cost, storage abuse | Type/signature/size checks, quarantine/scan, safe transforms, private storage |
| Provider exposure | Confidential stimulus sent or retained unexpectedly | Client data disclosure | Minimization, provider policy/config review, approved regions/retention, consent/notice |
| Queue/job abuse | Replay, forged confirmation/job, duplicate attempts | Cost/data corruption | API-gated create, service-only dispatcher confirmation, idempotency, claim/lease tokens, state transition checks |
| Denial of wallet | Automated expensive runs/tokens | Financial/availability loss | Rate/resource quotas, budgets, preflight, cancellation, anomaly alerts |
| Insecure exports/shares | Guessable or long-lived link | Data leakage | Signed scoped short-lived access, revocation, audit, watermark/metadata policy |
| Audit tampering | Delete or alter security events | Lost accountability | Append-oriented controls, restricted writes, external/immutable retention where justified |
| Supply-chain compromise | Malicious dependency/build action | Broad compromise | Pinning, review, scanning, provenance, least-privileged CI |
| Secrets in logs | Error payload includes tokens/data | Credential/data leak | Structured allowlist logging, redaction, retention/access tests |
| Deletion failure | Copies remain in cache/export/provider/backup | Privacy/contract breach | Data map, deletion workflow, tombstone/backup expiry, verification evidence |
| Method/config tampering | Silent prompt/model/frame change | Invalid results | Version immutability, approvals, audit, signed release references |

## Abuse and misuse

- Targeting or profiling vulnerable groups.
- Political persuasion or public-interest simulations presented as actual opinion.
- Discriminatory segmentation or sensitive-trait inference.
- Fabricated quotations, evidence, or population claims.
- Surveillance or automated high-stakes individual decisions.

Current boundary: these uses are prohibited and no product path is provided. Discovery or attempted enablement requires product, security, privacy, and methodology review. User-visible copy must not normalize prohibited use.

## Phase 2 decisions and remaining gates

- Auth account data is confidential/personal; tenant content is confidential; secrets are restricted; authored fixtures are non-personal.
- Deterministic mock only; no provider/network egress.
- Export/share and file upload do not exist.
- Private append-only audit, exact retention, and organization owner/editor/viewer model are specified.
- Hosted regions, final legal roles, contracts, incident notice duties, production retention, and real-provider terms remain `UNKNOWN` and block production—not local prototype implementation.

## Evidence base

- E-4005/E-4006/E-4025: RLS, schema exposure, dedicated Postgres roles/connections, grants, and server authorization are distinct controls.
- E-4008: prompt injection, improper output handling, excessive agency, sensitive disclosure, supply chain, and unbounded consumption need separate mitigations.
- E-4009: lifecycle governance, TEVV, provider/data lineage, human oversight, and incident/rollback paths are required risk treatments.
- E-3008: AI using personal data requires transparent purpose/inputs/risks/outputs, PIA, privacy by design/default, monitoring, fairness, minimization, rights, and meaningful intervention where risk warrants.
- E-3009: public personal data and scraping remain governed by purpose, lawful basis, terms, minimization, PIA, and access-control boundaries.

No control is marked implemented by this design. Phase 2–5 must attach test/runtime evidence to [[CONTROL_TEST_MATRIX|T-01–T-13]].
