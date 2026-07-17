---
title: SIMULA Privacy Model
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-17
owner: Privacy and security leads
classification: PROPOSED
source_of_truth: true
---

# SIMULA Privacy Model

> Discovery requirements, not legal advice or compliance certification.

## Privacy principles

- Purpose limitation and data minimization.
- Lawful, transparent, and documented use.
- Access limited by tenant, role, task, and environment.
- Retention tied to purpose and contract.
- Rights, correction, deletion, and export workflows designed end to end.
- Sensitive attributes avoided unless necessary, lawful, ethically reviewed, and controlled.
- Generated/synthetic data assessed for linkage and disclosure risk.

## Phase 2 data inventory

| Data | Subject/source | Purpose | Location/processor | Phase 2 rule |
|---|---|---|---|---|
| Auth email, user ID, session/security metadata | Prototype user | Account/session/security | Supabase Auth; local by default | Minimum fields; token never logged; account deletion path required before hosted user tests |
| Organization/project metadata | Prototype user/team | Organize experimental work | Supabase Postgres | Tenant-private; avoid personal data in free text |
| Stimulus text | User/client | Experimental pipeline input | Supabase Postgres | Treat confidential; Phase 2 warns not to enter personal/sensitive/client-secret content |
| Authored audience/result fixture | Repository authors | Test pipeline/rendering | Git/Postgres | Fictional, non-personal, non-representative |
| Run/audit/telemetry metadata | User/system | Reliability/security/accountability | Postgres/stdout | Allowlisted; no raw stimulus/result/token; environment retention applies |

Human research participants, client contacts, real population records, uploaded outcomes, official/microdata-derived cells, and external provider copies are not admitted in Phase 2.

For hosted use, final controller/processor roles, lawful/contractual basis, notices, regions, subprocessors, data-subject request owner, breach duties, and production retention remain `UNKNOWN`; they block production and any personal-data research import.

## Data-flow inventory required for new fields/providers

For each field: source, purpose, lawful/contractual basis, notice/consent where applicable, tenant/owner, storage region, processor/provider, access roles, transformations, model use, logs, exports, retention, deletion, and downstream dependency.

## High-risk areas

- Confidential pre-release campaigns sent to external model providers.
- Combining public aggregates, licensed microdata, client data, and generated profiles.
- Sensitive or inferred demographic/psychographic attributes.
- Small geographic or intersectional segments.
- Re-identification through synthetic or qualitative output.
- Cross-border processing and provider retention/training.
- Ground-truth imports collected under another purpose.

## Product requirements

- Clear provenance/validation disclosure without exposing confidential source data.
- User-visible provider/data handling disclosures where relevant.
- Tenant-scoped access, private-by-default assets, audited exports/shares.
- Configurable retention where contractually required, with enforceable minima/maxima.
- Verified deletion across primary store, storage, queue artifacts, cache, logs, providers where possible, exports, and backup lifecycle.
- Privacy impact review before new sensitive dimensions or providers.

## Legal and regulatory evidence

- E-3007 OBSERVED: Philippine DPA implementing rules define profiling, lawful processing, rights, security, data sharing, and controller accountability for processors including cross-border transfers.
- E-3008 OBSERVED: NPC Advisory 2024-04 applies these duties to AI development/deployment using personal data and calls for transparency, governance, PIA, minimization, fairness, accuracy, rights mechanisms, and human intervention for significant-risk automation.
- E-3009 OBSERVED: NPC Advisory 2026-01 says publicly available personal data remain protected and scraping requires a specific purpose, lawful basis, minimization, PIA, security, and respect for terms/technical measures.
- E-3010 OBSERVED: NPC’s current security summary covers PIA, access controls, continuity, backup, and restoration expectations.

These sources justify engineering/privacy gates; they do not certify SIMULA compliance. Phase 2 local/CI admission is limited by [[../Data/DEMO_DATA_POLICY|Demo Data Policy]]. A documented privacy review and account deletion test are required before hosted human testing. A fact-specific PIA/legal review is required before personal research data, scraping, sensitive traits, real providers, or production.
