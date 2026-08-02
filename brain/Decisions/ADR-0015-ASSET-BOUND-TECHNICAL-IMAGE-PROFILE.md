---
title: ADR-0015 Asset-Bound Technical Image Profile
status: accepted
created: 2026-07-30
updated: 2026-07-30
owner: Methodology, product security, and platform leads
classification: OBSERVED
source_of_truth: true
---

# ADR-0015 - Asset-Bound Technical Image Profile

## Context

SIMULA needs a governed first step from verified visual stimulus bytes toward a
future multimodal methodology. Successful upload does not prove that SIMULA can
recognize objects, read text, infer emotion, explain persuasion, predict human
behavior, or estimate campaign performance.

The E-5050/E-5051 asset pipeline already provides immutable asset identity,
private byte retrieval, media type, byte size, and SHA-256 binding. Any derived
profile must remain attached to that authority and must not create a second
upload or ungoverned provider path.

## Decision

- Admit only verified, retained, available JPEG, PNG, or WebP assets. PDF and
  video remain unsupported.
- Fetch bytes through the private asset store and recheck media type, byte size,
  and SHA-256 before analysis.
- Keep decoding and numerical authority in the private Python engine. Use
  Pillow's explicit JPEG/PNG/WebP allowlist, verify-then-reopen flow,
  decompression-bomb rejection, EXIF orientation normalization, 40-megapixel
  decoded limit, 16 MiB input limit, and a maximum 256 by 256 deterministic
  sample.
- Retain only normalized dimensions, sampling receipt, provider/method/version,
  profile checksum, and nine bounded technical signals: alpha coverage, RGB
  means, luminance mean/contrast/entropy, saturation mean, and edge density.
- Label entropy and edge density as heuristic technical signals. Label the
  remaining values as measured technical signals.
- Explicitly set behavioral interpretation, population inference, and embedded
  metadata retention to false. Publish fixed limitations with every result.
- Persist at most one immutable profile per immutable asset under forced RLS.
  Creation uses an idempotent database command; asset retirement or deletion
  request removes the derived profile.
- Expose create/read only through authenticated NestJS v2 routes. Never expose
  source bytes, bucket, object path, EXIF, or storage credentials in the profile
  response.
- Keep the private engine, API, and web capability disabled by default with one
  exact admission flag and readiness dependency.

## Rejected options

- Semantic labels, OCR, object recognition, brand recognition, emotion,
  aesthetic quality, or persuasion scoring: no admitted model, benchmark,
  rights review, or validation supports those claims.
- Behavioral or campaign-performance prediction from image statistics:
  technical pixel measurements are not human evidence.
- Browser-side profiling: it would create a second numerical authority and
  weaken byte/provenance binding.
- Mutable re-analysis in place: it would detach outputs from the frozen method
  and provider version.
- Embedded metadata retention: unnecessary privacy and provenance risk.

## Consequences

- The profile can support deterministic inspection and future prespecified
  multimodal work, but it cannot answer why a concept resonates or how an
  audience will respond.
- E-5053 proves the decision locally through a clean PostgreSQL migration chain,
  forced-RLS/adversarial pgTAP, S3-compatible private bytes, NestJS, and the
  private FastAPI/Pillow engine. E-5054 retains the gateway-level
  create/replay/tenant/audit/retirement proof as an explicit database
  integration. Those proofs do not admit the feature.
- A future semantic or behavioral visual provider requires a separate ADR,
  rights-cleared evaluation data, provider admission, prompt-injection and
  privacy review, held-out validation, uncertainty policy, and full-stack
  release evidence.
- Hosted Supabase Storage retrieval, hosted TLS/CORS, cross-tenant HTTP,
  deletion recovery, human accessibility, and hosted readiness remain
  mandatory before enablement.

## Rollback

Set `SIMULA_TECHNICAL_VISUAL_PROFILE_ENABLED=false` in the AI engine, API, and
web environment. Preserve source assets. Remove or retire derived profiles only
through the governed asset lifecycle; do not bypass RLS or expose object
coordinates as a fallback.
