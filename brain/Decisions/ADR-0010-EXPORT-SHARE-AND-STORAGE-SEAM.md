---
title: ADR-0010 Export Share and Storage Seam
status: accepted-deferred
created: 2026-07-17
updated: 2026-07-17
owner: Product security and architecture leads
classification: PROPOSED
source_of_truth: true
---

# ADR-0010 — Export, Share, and Storage Seam

## Context

Exports and share links create durable copies outside ordinary tenant authorization. They are not needed to prove the Phase 2 vertical slice.

## Decision

Phase 2 implements no export button, export endpoint, share link, public bucket, or downloadable report artifact. Result rendering reads the authorized API contract only.

Reserve these Phase 4 seams without creating premature tables:

- `report_artifact`: tenant/run/schema/content hash, private storage path, renderer release, created/expires/deleted timestamps.
- `share_grant`: tenant/artifact, hashed high-entropy token, permissions, expiry, revocation, creator, access count/last access.
- `export_event`: audit link, format, artifact hash, actor, recipient scope, lifecycle.

Future implementation rules:

- Supabase Storage bucket is private. Object path begins with immutable organization ID; path alone never authorizes.
- API checks current tenant/object permission before issuing a short-lived signed URL or streaming content. Browser never receives storage service credentials.
- Signed URL target/expiry is fixed, short, audited, and revocable through artifact/grant state; no indefinite public URL.
- Public/anonymous share is default off and requires separate harm/privacy review. Search indexing and embedding are denied.
- Export embeds experimental status, output kinds, provenance summary, generated-content labels, limitations, run/schema versions, and creation timestamp.
- Deletion/revocation covers metadata and stored object; user-downloaded copies cannot be technically recalled and must be disclosed.
- Exported content is escaped/sanitized; no generated active HTML, script, spreadsheet formula, or remote resource executes.

## Rejected options

- Public bucket with obscure paths: not authorization.
- Phase 2 PDF/CSV: expands security, accessibility, rendering, and retention scope before core proof.
- Permanent signed links: effectively public credentials.
- Export without disclosures: creates portable false confidence.

## Consequences

- Phase 2 users view results only while authenticated.
- Phase 4 must design accessible exports and share-recipient trust states.
- API/result contract keeps enough immutable provenance to render later artifacts.

## Rollback

If future sharing is unsafe, disable issuance, revoke all grants, expire/delete server artifacts, and preserve minimal audit evidence. Existing downloaded copies are handled through incident/customer process, not claimed recalled.

