---
title: Philippines political campaign readiness checklist
status: active
updated: 2026-08-01
classification: PROPOSED
---

# Readiness boundary

SIMULA is a research and message-testing system. It is not an election
prediction service, voter file, political-affiliation inference system, or
autonomous publishing system. Synthetic output must be labeled synthetic;
calibration and backtesting results must retain their evidence status and
limitations.

## Engineering controls

- Require organization authentication, role authorization, tenant/project RLS,
  immutable audit events, and source-rights admission.
- Accept only aggregate survey observations in the calibration contract.
- Reject individual identity, political affiliation, ideology, and
  persuadability fields in external import adapters.
- Keep held-out outcomes private until blind evaluation and delete them after
  terminal processing.
- Show sample size, population weights, repetitions, uncertainty, model,
  methodology, dataset, scoring, and calibration provenance in reports.
- Block autonomous political publishing and export of unapproved compliance
  content.

## Human review required

Before using Philippine campaign data in production, obtain current advice from
qualified counsel and the data controller on applicable privacy, election,
political advertising, consent, retention, cross-border transfer, and platform
requirements. Verify current Philippine laws and Commission on Elections rules
at deployment time; this checklist is not legal advice and does not certify
compliance.
