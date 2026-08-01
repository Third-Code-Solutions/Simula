---
title: SIMULA open-source license register
status: active
updated: 2026-08-01
classification: OBSERVED
---

| Dependency/reference | Revision | License | SIMULA use | Notice action |
| --- | --- | --- | --- | --- |
| `l2dnjsrud/PhantomCrowd` | `4f197a8df0de5183f2376a210f42aaf948bd9b0a` | MIT | Reference implementation and concept decomposition for the campaign-simulation bounded context. | Preserve upstream copyright and MIT permission text if substantial code is ever copied; current code is independently rewritten. |

## Review boundary

The audit inspected the upstream backend/frontend manifests and source. SIMULA
does not import PhantomCrowd's Vue, SQLite, SQLAlchemy, LightRAG, camel-ai, or
dependency graph. Predikta code, prompts, datasets, branding, private APIs, and
methodology are not used.

## Open-source admission rule

Any future third-party code must be recorded here before merge with its exact
version, license, source URL, copied/adapted files, notice obligations, and
security review. GPL/AGPL code is not admitted to SIMULA's proprietary core
without explicit license approval.
