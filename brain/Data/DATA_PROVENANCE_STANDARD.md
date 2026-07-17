---
title: SIMULA Data Provenance Standard
status: active
created: 2026-07-17
updated: 2026-07-17
owner: Data governance lead
classification: PROPOSED
source_of_truth: true
---

# SIMULA Data Provenance Standard

## Required record

Every dataset, frame, derived table, synthetic population, benchmark, and imported ground-truth set records:

- Stable dataset/version ID, title, owner, publisher, URL, retrieval and effective dates.
- File/table/object identifiers, schema version, row/unit definition, geography, time coverage, checksum, and immutable artifact reference.
- Collection mode, target population, sampling frame, sample size, weights, nonresponse, missingness, known biases, and source limitations.
- License/contract, allowed purpose, commercial/model/training/redistribution rights, attribution, expiry, and reviewer.
- Personal/sensitive classification, lawful basis or authority, notice/consent, controller/processor roles, region, subprocessors, retention/deletion, and data-subject-rights path when applicable.
- Transformation lineage: input versions, code release, parameters, seed, exclusions, imputations, joins, aggregation, suppression, output checksum, and actor/time.
- Validation status, approved uses, prohibited uses, supported slices, minimum cells, review date, owner, and rollback target.

Unknown metadata is written as UNKNOWN and blocks production admission where material.

## Status model

- Candidate: discovered; no use authorization.
- Reviewed: metadata/terms assessed; no production implication.
- Approved-demo: authored or rights-cleared only for demo/test.
- Approved-evaluation: approved benchmark use, isolated from training/tuning.
- Approved-production: approved use, scope, controls, monitoring, and expiry.
- Suspended or retired: unavailable to new runs; historical references remain resolvable.

## Lineage invariants

- A simulation binds immutable population-frame and dataset-version IDs.
- Ground truth stays physically/logically separate from predictions.
- A later data update creates a new version; it never rewrites historical provenance.
- Missing source, rights, checksum, or transformation lineage blocks release.
- Geographic joins bind a PSGC release (E-3005); no “latest” join without version.
- Derived joint distributions show source evidence and fidelity checks; margins alone do not prove joints (E-2001, E-2002).

## Evidence and legal boundary

E-3002 shows PSA public-use files carry client terms and confidentiality conditions. E-3007–E-3010 require fact-specific privacy, AI, security, and data-use review. This standard is an engineering control, not legal approval.
