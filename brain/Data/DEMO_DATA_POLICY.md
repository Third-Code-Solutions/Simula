---
title: SIMULA Demo Data and Admission Policy
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-17
owner: Data and privacy leads
classification: PROPOSED
source_of_truth: true
---

# SIMULA Demo Data and Admission Policy

## Phase 2 admitted data

Only repository-authored, fictional, non-personal fixtures are admitted:

- one audience version labeled `authored_demo` and `non_representative`;
- abstract demo segments with deliberately authored equal weights;
- one neutral fictional text stimulus for seeds and tests;
- deterministic expected outputs used to test contracts and rendering.

No fixture is sampled from, calibrated to, or named after a real population. No public profile, licensed microdata, client content, contact information, sensitive trait, or ground truth is included.

## Fixture manifest

Every fixture set records:

- stable ID and semantic version;
- purpose and prohibited uses;
- authoring date and owner;
- source type `internal_authored` and external dependencies `none`;
- schema version and canonical SHA-256 checksum;
- records/cells, deliberately authored weights, and transformation code version;
- language/category scope;
- non-representative and estimates-nobody disclosure;
- retention and retirement state.

Changing content creates a new version and checksum. Tests pin both.

## Admission gates for later data

| Gate | Required evidence | Failure behavior |
|---|---|---|
| Purpose | Named user decision and allowed/prohibited uses | Reject |
| Rights | Source terms, license, commercial/model/derivative/redistribution rights | Reject or legal review |
| Privacy | Field-level data map, lawful-basis/role analysis, PIA trigger, notices/consent where applicable | Reject |
| Quality | Population/frame, dates, mode, missingness, weights, coverage, joint dependencies, checksums | Quarantine |
| Transformation | Versioned code/config, lineage, deterministic seed where applicable | Quarantine |
| Validation | Prespecified fidelity, disclosure, construct, slice, and failure tests | Experimental only or reject |
| Release | Independent method/data/security approval and registry state | Block new runs |
| Monitoring | Expiry, drift, source update, incident, and retirement owner | Retire on lapse |

Public accessibility is not a rights grant. Scraping personal data for audience construction is prohibited by current scope (E-3007–E-3009).

## Environment and retention policy

| Environment/data | Rule |
|---|---|
| Git fixtures | Retain immutable versions; contain no personal or client data |
| Local database | Synthetic only; resettable and disposable |
| CI | Synthetic only; destroy database/artifacts after the run except non-sensitive test reports |
| Preview | Synthetic only; delete tenant/run data within 7 days; no production secrets |
| Staging | Synthetic or separately approved research fixtures; default delete after 30 days |
| Production | Not approved; retention schedule, contracts, regions, and legal roles are blocking decisions |
| Queue messages | Run identifier and schema version only; archive for at most 7 days outside production |
| Application logs | Allowlisted metadata only; 14-day non-production target; no raw stimulus/result by default |

User-triggered deletion removes tenant content, derived results, queue artifacts where addressable, private storage, and caches. Audit keeps only minimal non-content tombstone fields when legally/contractually justified: object class, opaque identifier hash, actor, timestamp, reason, and correlation ID. Backup copies expire through the provider lifecycle and are not restored into active service after deletion without reapplying tombstones.

## Provider gate

Phase 2 provider is a deterministic in-process mock with no network egress. Any real model provider requires:

- approved data-flow and minimum field set;
- contract/terms, region, retention/training, subprocessors, and deletion review;
- confidential-content policy and user disclosure;
- timeout, cost, abuse, incident, and off-switch controls;
- provider conformance and prompt-injection tests;
- an accepted ADR amendment and feature flag defaulted off.

## Decision

`APPROVED FOR PHASE 2`: authored fixtures and deterministic mock only. All personal, client, scraped, official-statistics-derived, microdata, and real-provider data paths remain blocked.

