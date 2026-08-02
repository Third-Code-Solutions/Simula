---
title: ADR-0013 Governed pgvector Retrieval
status: accepted
created: 2026-07-29
updated: 2026-07-29
owner: Data, methodology, and security leads
classification: PROPOSED
source_of_truth: true
---

# ADR-0013 - Governed pgvector Retrieval

## Context

ADR-0012 adopts PhantomCrowd's provenance-aware knowledge layer but rejects
unmeasured retrieval and inherited accuracy claims. SIMULA context graphs are
immutable, tenant-bound, and capped at 500 nodes. No rights-cleared embedding
model or retrieval benchmark is currently admitted.

## Decision

- Store embeddings only in `private.context_node_embeddings`.
- Bind every vector to organization, immutable context-graph version, node ID,
  node content SHA-256, embedding-model version, and embedding SHA-256.
- Register model artifact, dimensions, normalization, rights review, prohibited
  uses, benchmark identity/checksum, query count, semantic relevance, exact
  recall, and lifecycle in `private.embedding_model_versions`.
- Admit no model in the schema migration. Runtime ingestion and search fail
  closed unless the exact model version is `admitted`.
- Require at least 100 benchmark queries, semantic relevance at 10 of at least
  0.8, and exact recall at 10 of 1.0 before admission. These are retrieval gates,
  not behavioral-validity evidence.
- Use exact cosine search within one graph. The 500-node graph limit bounds
  cost and makes retrieval recall deterministic. Do not add ANN/HNSW until a
  larger admitted corpus demonstrates need, measured recall, and a query-plan
  budget.
- Permit vector ingestion only through a worker-owned, RLS-on,
  empty-search-path definer. Retries are idempotent; changed content or vector
  bytes for the same model/node binding fail.
- Permit search only through a command-owned, RLS-on, empty-search-path
  authority requiring the `simula_api` session and live organization membership.
  Browser roles receive no table or function authority.
- Keep the low-level vector boundary internal. Do not publish a natural-language
  product search route until a rights-cleared embedding provider, worker adapter,
  cost control, and end-to-end benchmark are admitted.

## Rejected options

- Seed an arbitrary third-party model: rights, artifact, quality, and operating
  cost are unproved.
- Use deterministic hash vectors as semantic evidence: reproducible but
  misleading.
- Add HNSW immediately: the admitted retrieval scope is too small to justify
  approximate recall or version-dependent tuning.
- Expose vector tables through Supabase Data API: bypasses the intended service
  authorization and contract boundary.
- Trust only an organization filter in SQL: forced RLS and explicit membership
  verification remain mandatory defense in depth.

## Consequences

- pgvector is now an implemented storage/search seam, not an active product
  capability.
- Model admission, vector backfill, query generation, HTTP/OpenAPI product
  contracts, and query-plan evidence remain separate release work.
- SIMULA still cannot claim Predikta equivalence, semantic quality, behavioral
  validity, or production readiness.

## Rollback

Revoke function execution and retire the admitted model version. Preserve
immutable registry and embedding rows for audit until the source graph retention
policy deletes them. Never silently substitute a different model or lexical
heuristic.
