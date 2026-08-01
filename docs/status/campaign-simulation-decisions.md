---
title: Campaign Simulation Lab decisions
status: active
updated: 2026-08-01
classification: PROPOSED
---

# Decisions

1. Keep Campaign Simulation Lab as a bounded SIMULA vertical. Do not rename or
   replace SIMULA.
2. Use SIMULA's PostgreSQL/Supabase, Next.js, NestJS, FastAPI, Python-core,
   Redis, worker, storage, auth, RLS, and contract architecture. No Vue,
   SQLite, second queue, or parallel provider abstraction.
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
10. Production admission remains blocked until the existing SIMULA release
    gates plus rights-cleared data, held-out evaluation, subgroup/language
    checks, and live hosted evidence pass.
