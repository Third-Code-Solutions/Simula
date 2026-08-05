---
title: Campaign Simulation Lab decisions
status: active
updated: 2026-08-03
classification: PROPOSED
---

# Decisions

1. Keep Campaign Simulation Lab as a bounded SIMULA vertical. Do not rename or
   replace SIMULA.
2. Use SIMULA's PostgreSQL/Supabase, Next.js, NestJS, FastAPI, Python-core,
   Redis, worker, storage, auth, RLS, and contract architecture. No Vue, SQLite,
   second queue, or parallel provider abstraction.
3. Treat PhantomCrowd as an MIT-licensed reference. Adapt concepts natively;
   copy no code in the first slice.
4. Reject the `viral_score` concept as the numerical product output. Expose
   named component metrics and their formulas, provenance, stability, survey
   calibration, and backtest status.
5. Population weights must come from an admitted aggregate population frame or
   explicitly marked authored demo fixture. LLMs cannot invent populations or
   weights.
6. Repeated seeds measure run stability only. Their intervals are not sampling
   error or population uncertainty unless a separately approved statistical
   design supports that claim.
7. Survey calibration consumes consented, rights-cleared aggregate observations
   kept separate from synthetic runs. Calibration never mutates the source
   survey or silently overwrites a synthetic result.
8. Historical backtests are blind replay/evaluation artifacts against named
   held-out outcomes. They do not establish universal accuracy or causal lift.
9. Political use is aggregate research only. No individual voter profiles,
   persuadability scores, vulnerability targeting, or autonomous publishing.
10. Production admission remains blocked until the existing SIMULA release gates
    plus rights-cleared data, held-out evaluation, subgroup/language checks, and
    live hosted evidence pass.
11. The first Campaign Lab deployable provider is deterministic and seeded.
    Provider-neutral configuration remains typed and allowlisted, but an
    external LLM provider cannot be selected until its adapter, privacy,
    timeout, cost, and replay tests exist.
12. Campaign Lab progress and cancellation authority live in Supabase lease
    functions. Process memory is never the source of truth.
13. Raw survey imports and held-out outcomes are worker-only secrets. Public
    artifacts contain aggregate summaries, provenance, checksums, and evidence
    status only.
14. Campaign update and cancellation commands use the existing tenant-scoped
    idempotency table and command-owner boundary. The explicit header is
    optional only for backward compatibility; the API derives a stable request
    key when omitted, so every mutation still receives a durable receipt.
