# Delivery Plan: Phase 2 Exit and Phase 3–7 Entry

## Evidence baseline

- Phase 0 and Phase 1 are complete; their reviewed ExecPlans live in `plans/completed/`.
- P2-01 through P2-04 are complete with recorded local evidence E-5008 through E-5013.
- Hosted schema migrations through `20260718070000` match the repository. The `api` schema contains the application tables; `private` holds worker/audit internals.
- P2-05 is complete and evidenced by E-5014. The disposable local browser result/error/poll/accessibility gate and repository quality gate pass.
- P2-06 cancellation, timeout retry/exhaustion, stale lease/Redis-loss dispatch recovery, poison terminalization, and user-facing failure proof are locally and hosted-schema proven in E-5015–E-5020; additional safe retry classes remain active. P2-07 is not implemented. Phases 3–7 have roadmap gates but no authorized active ExecPlans.

## Delivery order

### P2-05 — Trustworthy accessible result experience

**Outcome:** A signed-in strategist sees queued-to-terminal state, deterministic result, limitations, and frozen provenance without false claims.

**Acceptance criteria:**

- `E2E-RESULT-001`, `E2E-ERROR-001`, `E2E-POLL-001`, `A11Y-AXE-001`, result enum/XSS/forbidden-claim proof pass.
- Polling has one shared in-flight request, bounded backoff, and stops on terminal/auth/not-found/timeout states.
- The browser harness owns only disposable local processes and never targets hosted Supabase.

**Verification:** focused web unit/type/lint/build; local Supabase reset/lint/pgTAP; disposable browser gate; contract drift; relevant security scans.

**Dependencies:** P2-04; current hosted migration history is clean.

### P2-06 — Cancellation, retry, and durable recovery

**Outcome:** Authorized cancellation and bounded transient/permanent failure recovery preserve one authoritative terminal outcome.

**Acceptance criteria:**

- Exact cancel `202 cancel_requested` and terminal-race `200` API contract.
- Cancel/result and poison/cancel races, retry timing/exhaustion, lease supersession, crash/ack, and failure E2E pass.
- No partial result, duplicate terminal effect, provider fallback, or cross-tenant cancellation.

**Verification:** forward migration reset/lint/pgTAP, API/worker/integration race tests, browser cancel/failure E2E, generated-contract drift.

**Dependencies:** P2-05 browser gate green.

**Current verified increment:** owner/editor `POST /runs/{id}/cancel` with explicit empty JSON, `202 cancel_requested` or terminal-race `200`, cancellation-aware dispatcher/worker terminalization, atomic timeout retry/exhaustion, worker-only stale-dispatch supersession with bounded generation recovery, worker-only terminal poison handling for expired tenth claims, and a browser-proven safe failed state that never substitutes/fetches a result. Additional safe retry classes remain required before P2-06 can close.

### P2-07 — Integrated quality and independent exit gate

**Outcome:** The walking skeleton has a repeatable, evidence-backed release gate.

**Acceptance criteria:**

- Every Phase 2 traceability row has executable evidence.
- CI executes local migration/contract/E2E/security/load/backpressure/telemetry checks.
- No unresolved Critical or High finding; Obsidian evidence, risks, changelog, operations, and ExecPlan reflect verified truth.

**Verification:** clean exact install; full local gate; independent review; clean generated artifacts; no secret-bearing evidence.

**Dependencies:** P2-01 through P2-06 green.

### Phases 3–7

Do not implement ahead of the Phase 2 exit. After P2 passes, create one reviewed ExecPlan per roadmap phase, beginning with Phase 3 methodology prototype. Phase 5 requires the ARQ exit-plan decision before Phase 6; Phase 6 needs human-comprehension/staging authority; Phase 7 is a readiness package, not production deployment.

## Risks and controls

| Risk | Control |
|---|---|
| Browser polling is flaky or false-positive | Reproduce against real local runtime; retain unit and browser proof; never weaken timeout/assertions. |
| Hosted schema drift | Reset and lint locally; compare `supabase migration list --linked`; forward-only corrections only. |
| Claims exceed experimental scope | Run forbidden-claim checks; render limitations/provenance in browser tests. |
| Cross-service race regression | Test cancel/result/lease/duplicate interleavings before UI claims success. |

## Commit rule

Commit and push only the focused files of a verified green vertical slice. Preserve unrelated in-progress files in the worktree.
