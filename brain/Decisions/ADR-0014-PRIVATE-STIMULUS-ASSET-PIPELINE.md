---
title: ADR-0014 Private Stimulus Asset Pipeline
status: accepted
created: 2026-07-29
updated: 2026-07-29
owner: Product security, platform, and methodology leads
classification: PROPOSED
source_of_truth: true
---

# ADR-0014 - Private Stimulus Asset Pipeline

## Context

Predikta-category campaign research requires governed visual-concept inputs.
PhantomCrowd provides useful simulation architecture, but it does not prove that
SIMULA can interpret an uploaded image or predict real consumer response.
SIMULA previously stored only private asset metadata; no supported byte
ingestion, verification, retrieval, or deletion path existed.

Supabase Storage S3 access keys are server credentials with Storage-wide
authority. They bypass browser RLS and cannot be treated as tenant-scoped
capabilities.

## Decision

- Keep `simula-private-assets` private. Browser roles receive no
  `storage.objects` policy, S3 key, object path, or signed URL.
- Proxy reserve, upload, download, and deletion through authenticated NestJS v2
  routes. The API rechecks current organization membership through the database
  boundary for every operation.
- Reserve immutable filename, media type, exact byte size, SHA-256, retention,
  bucket, and object path before bytes are accepted.
- Derive the object key as
  `{organization}/{stimulus}/{asset}/{content_sha256}`. PostgreSQL and the S3
  adapter both reject any other bucket/key namespace.
- Accept only PDF, JPEG, PNG, WebP, and MP4, with a 16 MiB maximum and an exact
  media type. Verify size and SHA-256 before upload, after S3 metadata lookup,
  and again on download.
- Use durable database command receipts for reservation and deletion. Upload
  confirmation is state-idempotent. Deletion is a two-phase request, object
  removal, absence check, and durable tombstone.
- Fail readiness when asset storage is enabled but unavailable. Keep the whole
  capability disabled unless an exact environment configuration is admitted.
- Place S3 operations behind `AssetObjectStore`. A future R2 adapter may replace
  Supabase Storage without changing database or HTTP contracts, but must meet
  the same private-path, integrity, retention, and deletion proofs.
- Treat this as governed stimulus ingestion only. No OCR, computer vision,
  multimodal model, aesthetic scoring, behavioral interpretation, or campaign
  prediction is implemented or implied.

## Rejected options

- Browser-direct S3 uploads: the available S3 credentials are too broad, and a
  browser policy would create a second authorization surface.
- Public or obscure object URLs: paths are identifiers, not authorization.
- Mutable object keys: retries could silently replace campaign evidence.
- Database `bytea`: expands database backup, memory, and retention risk.
- Claim visual analysis from successful upload: transport integrity is not
  methodology validity.

## Consequences

- The API buffers at most 16 MiB per upload and download. Streaming/chunked
  media requires a separate design and denial-of-service budget.
- The server credential still has Storage-wide provider authority. Strict
  bucket/key validation, secret isolation, rotation, monitoring, and a staging
  cross-bucket denial exercise are release gates.
- Live Supabase S3, PostgreSQL/RLS, retention, and recovery evidence remains
  mandatory before enabling the feature outside local test environments.
- Web upload/preview UX and any visual-analysis methodology remain separate
  milestones.

## Rollback

Set `SIMULA_ASSET_STORAGE_ENABLED=false`. Preserve lifecycle metadata and private
objects for reconciliation. Do not issue direct bucket access as a fallback.
Complete or repair deletion sagas with the same attested API/storage boundary.
