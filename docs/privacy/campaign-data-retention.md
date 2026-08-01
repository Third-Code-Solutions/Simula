---
title: Campaign Simulation Lab data retention
status: active
updated: 2026-08-01
classification: PROPOSED
---

# Retention policy

Campaign evidence runs receive a `retention_until` timestamp at admission. The
default is 90 days after creation. The retention field is persisted with the
run so a future governance policy can shorten or extend the period without
changing the worker contract.

Held-out historical outcomes are more restricted than ordinary reports:

- the API never returns them;
- the worker deletes the secret payload after completion, terminal failure, or
  cancellation;
- the retention worker deletes expired terminal run, event, request, result,
  and secret artifacts in bounded batches;
- the immutable audit event records that retention deletion occurred without
  recording the payload.

Production operations must schedule `private.expire_campaign_evidence_runs`
through the worker, alert on expired rows older than one polling interval, and
verify the deletion path after backup/restore drills. Audit retention, legal
holds, exports, and subject requests require an organization policy decision and
human review before deployment. This document is not legal advice.
