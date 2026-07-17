---
title: SIMULA Incident Response
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-17
owner: Security and SRE leads
classification: PROPOSED
source_of_truth: true
---

# SIMULA Incident Response

## Incident classes

Tenant/data exposure, credential leakage, provider disclosure, authorization/RLS failure, malicious upload/prompt injection, availability/queue failure, denial of wallet, corrupted or misleading simulation output, audit failure, dependency compromise, and deletion/backup failure.

## Response lifecycle

1. Detect and create timestamped incident record.
2. Triage severity, affected tenants/data/versions, active threat, and legal/contract escalation needs.
3. Contain using scoped reversible controls: disable feature/provider, revoke share/token, quarantine jobs, rotate credential, or block abusive actor.
4. Preserve access-controlled evidence and correlation IDs.
5. Eradicate cause and validate tenant/data integrity.
6. Recover progressively with monitoring and rollback ready.
7. Notify according to approved legal, contractual, and customer process.
8. Complete blameless review with corrective actions, owners, dates, tests, and documentation updates.

## Readiness needs

Severity matrix, on-call ownership, contact tree, provider/vendor escalation, secure incident channel, evidence-retention rules, notification decision tree, runbooks, tabletop exercises, and recovery drills.

## Severity and authority

- SEV-0 Critical: confirmed/suspected cross-tenant access, secret leak enabling privileged access, unauthorized provider/data egress, destructive integrity loss, or active supply-chain compromise. Release owner immediately disables affected path; security lead owns incident.
- SEV-1 High: major outage, stuck/corrupt queue with user impact, audit gap on high-risk action, or misleading published result. SRE lead contains; security/method owner joins by class.
- SEV-2 Medium: degraded objective, bounded retry spike, non-sensitive observability gap, or failed cleanup without exposure. Owning team tickets and time-bounds repair.

Phase 2 has no formal 24×7 on-call or external user promise. Before staging, named humans/contact paths/tabletop are required. Before production, legal/contract notification decision trees and coverage are blocking.

## Legal boundary

No notification deadline or compliance statement is asserted until current legal/contract review and approved incident policy exist.
