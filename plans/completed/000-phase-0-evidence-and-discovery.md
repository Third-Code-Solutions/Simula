---
title: Phase 0 — Evidence and Discovery ExecPlan
status: completed
created: 2026-07-17
updated: 2026-07-17
owner: Principal program and engineering lead
classification: PROPOSED
source_of_truth: true
---

# 1. Title and Status

- **Plan:** Phase 0 — Evidence and Discovery
- **Owner:** Principal program and engineering lead
- **Created:** 2026-07-17
- **Last updated:** 2026-07-17
- **Status:** Completed

# 2. Purpose and User Outcome

SIMULA needs a defensible discovery base before product or architecture definition. This phase will turn public evidence, credible research, current public data-source information, and current legal/security guidance into traceable requirements and explicit unknowns.

Observable outcome: a new engineer can open [[../../brain/00_HOME|SIMULA Home]], follow the public evidence to its sources, distinguish fact from vendor claim and inference, understand the independent product opportunity, and begin Phase 1 without relying on chat history.

At initial inspection, the repository contained only operating instructions and no evidence base. Building before discovery would have created scientific, product, legal, and architecture risk. Current synthesized state is documented below and in [[../../brain/PROJECT_STATE|Project State]].

# 3. Current State

## Existing implementation

- `OBSERVED` on initial inspection 2026-07-17: repository contained `AGENT.md`, `.agent/PLANS.md`, and `BOOTSTRAP_PROMPT.md` only.
- `OBSERVED` on 2026-07-17: requested `AGENTS.md` filename is absent; repository provides singular `AGENT.md`. User-supplied `AGENTS.md` instructions and repository `AGENT.md` are both controlling.
- `OBSERVED` on initial inspection 2026-07-17: directory was not initialized as a Git repository.
- `OBSERVED` on milestone re-audit 2026-07-17: workspace is now a Git repository on `main` with no commits; all project files are untracked. Cause of initialization is `UNKNOWN` and is not material to Phase 0 evidence work.
- No application code, tests, services, migrations, or CI exist.
- Current tree also contains the 33 required Obsidian notes, master roadmap, and Phase 0 ExecPlan; see [[../../brain/PROJECT_STATE|Project State]] for current inventory.

## Relevant files

- `BOOTSTRAP_PROMPT.md`: product and phase brief.
- `AGENT.md`: repository operating contract.
- `.agent/PLANS.md`: ExecPlan standard.
- `plans/MASTER_ROADMAP.md`: phase gates.
- This file: active Phase 0 source of truth.

## Known limitations

- Only public, access-compliant sources may be used.
- Vendor-controlled claims cannot establish independent validity.
- No private Predikta or Netopia implementation evidence is available or sought.
- Phase 0 may identify legal questions but cannot issue legal advice or claim compliance.
- Web pages may change; access and publication dates must be recorded.

## Evidence and prior decisions

- Evidence labels are fixed: `OBSERVED`, `REPORTED`, `INFERRED`, `UNKNOWN`, `PROPOSED`.
- Baseline architecture in `BOOTSTRAP_PROMPT.md` remains a constraint, not a discovered competitor fact.
- Primary agent owns all canonical edits. Subagents perform bounded read-only research.

# 4. Scope

## In scope

- Public research on Predikta, Netopia AI, and relevant competitors.
- Behavioral-science, synthetic-audience, computational-social-science, and validation research.
- Philippine public data candidates, licenses/access conditions, privacy/legal context, and data governance.
- Phase 0 architecture/security implications and public technology constraints.
- User segments, jobs-to-be-done, workflows, output patterns, positioning, and differentiation.
- Evidence ledger, public evidence matrix, teardowns, landscape, discovery drafts, risks, glossary, and Phase 1 entry gate.

## Out of scope

- Application scaffolding or implementation.
- Private source code, APIs, datasets, infrastructure, credentials, or protected assets.
- Paywall, authentication, robot-control, or access-control bypass.
- Production datasets, demographic distributions, benchmark results, or accuracy claims.
- Production deployment or external resource changes.

## Non-goals

- Reproduce competitor branding, UI, copy, or proprietary behavior.
- Decide every Phase 1 architecture detail.
- Claim scientific validity, legal compliance, or population representativeness.
- Select paid vendors or accept licensing terms.

## Assumptions

- Public web sources available on 2026-07-17 provide enough evidence for market framing, but not private implementation reconstruction.
- Phase 1 will validate all proposed product and architecture decisions.
- Current Philippine public-data and legal information requires source-specific review before production use.

# 5. Proposed Design

## Research workflow

1. Capture source metadata and concise evidence excerpts or paraphrases.
2. Assign one evidence classification and confidence level per claim.
3. Separate direct observation from vendor or third-party reporting.
4. Record unresolved questions as `UNKNOWN`; never fill gaps with plausible implementation details.
5. Synthesize an independent SIMULA approach as `PROPOSED`.
6. Audit every external claim for a direct citation and evidence-label fit.

## Canonical artifact model

- `brain/Research/`: competitor and market evidence.
- `brain/Product/`: discovery-level users, jobs, journeys, features, non-goals, and PRD inputs.
- `brain/Methodology/`: defensibility requirements and validation design inputs.
- `brain/Data/`: provenance, governance, and candidate-source research.
- `brain/Architecture/`, `brain/Security/`, `brain/QA/`, `brain/Operations/`: Phase 0 constraints and Phase 1 questions.
- `brain/EVIDENCE_LEDGER.md`: claim-level source registry.
- `brain/RISK_REGISTER.md`: risk ownership and mitigation.

## Security and privacy

- No secrets, credentials, private datasets, personal data, or copied protected assets enter the repository.
- Research stays within public access boundaries.
- Privacy and legal statements cite primary law/regulator sources where possible and remain qualified.

## Error handling

- Unavailable or conflicting evidence becomes `UNKNOWN`, with the attempted source and limitation recorded.
- Weak third-party evidence stays `REPORTED` with low or medium confidence.
- Broken or unstable URLs are replaced with stronger primary or archived-public sources where lawful and available.

## Rollback

- Documentation-only phase. Revert an unsupported claim by removing it from synthesis, logging correction in `brain/CHANGELOG.md`, and retaining the uncertainty in the ledger where useful.

# 6. Milestones

## M0 — Initialize Phase 0 memory and planning

**Work:** Inspect repository; create Obsidian structure, master roadmap, active ExecPlan, home, charter, state, ledger, risks, changelog, and glossary.

**Files:** `brain/**`, `plans/MASTER_ROADMAP.md`, this plan.

**Acceptance:** Required directories exist; core documents have required YAML; plan contains all `.agent/PLANS.md` sections; no application code exists.

**Tests:** File inventory and frontmatter check.

**Verification:** `rg --files -uu`; metadata audit script or equivalent read-only check.

**Recovery:** Repair missing documents from this plan and bootstrap brief.

## M1 — Complete five independent public research streams

**Work:** Read-only subagent research for (1) competitors/products, (2) behavioral science/methodology, (3) data sources/governance, (4) architecture/security, and (5) UX/positioning.

**Files:** No subagent edits. Research summaries return to primary agent.

**Acceptance:** Each stream returns direct public URLs, publisher, publication/access date, evidence labels, confidence, limitations, and unknowns. Competitor research explicitly avoids private-detail speculation.

**Tests:** Primary agent spot-checks cited pages and classification fit.

**Verification:** Live web open/search records and canonical ledger entries.

**Recovery:** Re-run weak or missing stream with narrower questions; record inaccessible claims as `UNKNOWN`.

## M2 — Synthesize canonical discovery artifacts

**Work:** Produce teardowns, landscape, evidence matrix, user/JTBD/workflow analysis, output taxonomy, differentiation, methodology/data requirements, legal/ethical boundaries, and Phase 1 design inputs.

**Files:** Required documents under `brain/Research`, `brain/Product`, `brain/Methodology`, `brain/Data`, `brain/Architecture`, `brain/Security`, `brain/QA`, and `brain/Operations`.

**Acceptance:** External and competitor claims carry evidence labels and direct citations; public evidence is distinguishable from independent proposals; no unsupported accuracy or implementation claim exists.

**Tests:** Citation/classification audit; cross-document contradiction review; forbidden-claim search.

**Verification:** Record commands and findings in Section 10.

**Recovery:** Demote unsupported claims to `UNKNOWN`; remove premature decisions; add Phase 1 research questions.

## M3 — Final evidence-quality review

**Work:** Independent read-only review of citations, classifications, source quality, missing counterevidence, high-risk assumptions, and exit criteria.

**Files:** Primary agent updates canonical documents only.

**Acceptance:** All material findings resolved or recorded as explicit unknown/risk; core state documents are current and linked.

**Tests:** Exit checklist below; link sampling; YAML/frontmatter audit; no-code inventory.

**Verification:** Reviewer summary and primary resolution log in Section 10.

**Recovery:** Keep plan active and document failed criteria until corrected.

# 7. Risks

- Vendor marketing may overstate validation. Mitigation: classify as `REPORTED`; seek independent evidence; prohibit accuracy claims.
- Sparse public competitor detail may tempt architecture speculation. Mitigation: private internals remain `UNKNOWN`.
- Search results and snippets may distort source content. Mitigation: cite opened source pages, not search snippets.
- Legal and licensing status may change. Mitigation: favor primary sources, record dates, require Phase 1 legal review.
- Public demographic tables may not permit needed intersections. Mitigation: document coverage and sparse-cell constraints; never invent distributions.
- Over-broad discovery may blur Phase 0/1 boundary. Mitigation: record design items as `PROPOSED` inputs, not finalized implementation.
- No committed Git history weakens change traceability. Mitigation: use changelog and validation evidence during Phase 0; define initial commit policy before implementation.

# 8. Decisions

- **2026-07-17 — PROPOSED:** Use `plans/MASTER_ROADMAP.md` as phase-level source of truth and this file as active Phase 0 source of truth.
- **2026-07-17 — OBSERVED:** Requested plural `AGENTS.md` is absent; supplied user instructions and singular repository `AGENT.md` exist.
- **2026-07-17 — PROPOSED:** Treat both supplied user instructions and repository `AGENT.md` as controlling.
- **2026-07-17 — PROPOSED:** Subagents perform research only; primary agent owns all repository edits.
- **2026-07-17 — PROPOSED:** Phase 0 completion requires every exit criterion below, not merely creation of documents.

# 9. Progress

- [x] Read supplied `AGENTS.md` instructions, repository `AGENT.md`, `.agent/PLANS.md`, and `BOOTSTRAP_PROMPT.md` completely.
- [x] Inspect initial repository and record missing Git/`AGENTS.md` state.
- [x] Create directory structure.
- [x] Create master roadmap and active ExecPlan.
- [x] Create initial Obsidian core documents.
- [x] Create all 33 required Obsidian artifact files with minimum YAML frontmatter.
- [x] Complete competitor/product research and canonical synthesis.
- [x] Complete behavioral-science/methodology research and canonical synthesis.
- [x] Complete data-source/data-governance research and canonical synthesis.
- [x] Complete architecture/security research.
- [x] Complete UX/market-positioning research and canonical synthesis.
- [x] Synthesize all Phase 0 canonical artifacts.
- [x] Run final evidence-quality review and resolve findings.
- [x] Satisfy every Phase 0 exit criterion.

## Phase 0 exit criteria

- [x] Five required research streams completed from live public sources.
- [x] Predikta and Netopia teardowns distinguish OBSERVED, REPORTED, INFERRED, and UNKNOWN claims.
- [x] Competitive landscape and public evidence matrix cite sources and expose evidence gaps.
- [x] Users, jobs-to-be-done, workflows, outputs, and differentiation are documented.
- [x] Data, methodology, validation, provenance, legal, ethical, privacy, security, and operational requirements are documented at discovery depth.
- [x] Every material external claim has a direct citation, classification, confidence, date, and limitation in its note or evidence ledger.
- [x] Private competitor database, methodology, model, accuracy, and internal architecture remain UNKNOWN absent credible public proof.
- [x] High-risk assumptions and unresolved questions have owners and Phase 1 treatment.
- [x] All required Obsidian artifacts exist, have minimum YAML frontmatter, are linked from brain/00_HOME.md, and accurately state draft/active status.
- [x] brain/PROJECT_STATE.md, brain/CHANGELOG.md, brain/RISK_REGISTER.md, and brain/EVIDENCE_LEDGER.md reflect current Phase 0 state.
- [x] Final evidence-quality review has no unresolved critical finding.
- [x] No application code or product scaffold was created.
- [x] Exact Phase 1 entry criteria are documented and all are met.

## Phase 1 entry criteria

Phase 1 may start only when:

1. Every Phase 0 exit criterion is checked with recorded evidence.
2. Independent evidence review has no unresolved Critical finding; High findings have an owner and Phase 1 treatment.
3. Evidence Ledger, Public Evidence Matrix, Project State, Changelog, and Risk Register agree on claims, unknowns, and current phase.
4. Required Obsidian files/frontmatter/Home links pass automated inventory checks.
5. Forbidden-claim and no-application-code audits pass.
6. A Phase 1 ExecPlan exists with outcome, scope, ADR backlog, milestones, acceptance/test traceability, risks, rollback, and exit gate.
7. Phase 1 remains definition work: no Phase 2 product scaffold until PRD, methodology, data, architecture, threat, test/evaluation, MVP, and implementation backlog pass review.

Entry evidence:

- Criteria 1–2: all Phase 0 checks pass; two independent reviews found zero Critical. All High and Medium findings were resolved in canonical files.
- Criterion 3: state, changelog, risk, ledger, teardowns, landscape, and matrix use consistent labels and explicit unknowns.
- Criterion 4: 33/33 required notes and YAML fields, 36/36 Home targets, and 49/49 vault wikilinks pass.
- Criterion 5: forbidden-claim scan found only qualified/vendor-reported uses; no application directories, manifests, code, tests, migrations, or CI exist.
- Criterion 6: [[001-phase-1-product-and-architecture-definition|Phase 1 ExecPlan]] exists with 11/11 required sections and the named design/test/rollback gates.
- Criterion 7: Phase 1 plan explicitly blocks Phase 2 scaffold until its exit gate.

# 10. Validation Evidence

## Commands and results

- 2026-07-17: `rg --files -uu` before initialization returned only `AGENT.md`, `.agent/PLANS.md`, and `BOOTSTRAP_PROMPT.md`.
- 2026-07-17: `git status --short --branch` returned `fatal: not a git repository (or any of the parent directories): .git`.
- 2026-07-17: Created required Phase 0 directory structure and initialized core planning/memory documents with minimum YAML frontmatter.
- 2026-07-17: Required-artifact audit passed: 33/33 files exist with `title`, `status`, `created`, `updated`, `owner`, `classification`, and `source_of_truth` frontmatter.
- 2026-07-17: No-code audit passed: no `apps`, `services`, `packages`, `supabase`, `infrastructure`, or `tests` application scaffold directories exist.
- 2026-07-17: Data/governance subagent returned official-source candidate matrix and 32 classified claims; no files edited by subagent. Awaiting all streams before synthesis per bootstrap order.
- 2026-07-17: Methodology subagent returned 26 classified claims and 23 primary/professional/peer-reviewed sources; no files edited by subagent. Findings reject generic survey-replacement framing and require bounded validation, uncertainty, cultural adaptation, suppression, and disclosure.
- 2026-07-17: Competitor subagent returned 35 classified findings covering Predikta, Netopia AI, seven comparator platforms, and independent research context; no files edited by subagent. Private implementations and independently reproduced vendor accuracy remain `UNKNOWN`.
- 2026-07-17: M0 re-audit found current Git state `## No commits yet on main` with all project files untracked; initial no-Git observation retained as historical evidence and current-state wording corrected.
- 2026-07-17: Corrected M0 audit passed: 33/33 required artifacts and minimum YAML fields, 11/11 required ExecPlan sections, 35/35 links from `brain/00_HOME.md`, and no application scaffold directories.
- 2026-07-17: UX/positioning subagent returned 25 classified findings, prioritized JTBD hypotheses, exact positioning, and trust/uncertainty/accessibility requirements; no files edited by subagent.
- 2026-07-17: Ten bounded subagents were launched in concurrency-limited waves: phase/spec, architecture, verification, Predikta, Netopia/landscape, methodology, data/privacy, platform/security, UX/product, and final reviewer. Runtime permitted three subagents beside root, so ten simultaneous workers were impossible.
- 2026-07-17: Data/privacy and UX workers timed out before handoff. Primary agent recovered those streams from live official PSA, NPC, W3C, AAPOR, and NIST sources and recorded direct URLs, dates, classifications, confidence, and limitations.
- 2026-07-17: First independent final review found 0 Critical, 4 High, and 3 Medium. Resolved under-cited matrix cells, unsupported demand wording, mixed classifications, teardown atomicity, negative-search scope, stale plan state, and missing Phase 1 plan.
- 2026-07-17: Independent re-audit found 0 Critical, 2 High, and 1 Medium. Resolved final matrix classification consistency, current-state/changelog evidence, and stale audit counts.
- 2026-07-17: Current inventory audit passed: 33/33 required notes and minimum YAML fields; 36/36 Home links; 49/49 vault wikilinks; 53 evidence IDs defined, 49 referenced, 0 undefined; 11/11 Phase 1 ExecPlan sections.
- 2026-07-17: Placeholder and mixed-classification searches returned no matches.
- 2026-07-17: No-code boundary passed: no apps, services, packages, supabase, infrastructure, tests, or .github scaffold; no application manifests or source files.
- 2026-07-17: Git remains No commits yet on main with all files untracked; no external resources were provisioned or changed.

## Known failures or warnings

- Requested `AGENTS.md` path does not exist; singular `AGENT.md` exists and was read completely.
- Repository has no commits; change history currently relies on project documentation.
- First M0 audit script used PowerShell's read-only `$HOME` variable accidentally and reported an invalid 0/0 link result; corrected audit now passes 36/36 Home targets.
- Vendor claims remain REPORTED; competitor internals, independent replication, SIMULA validity, broad data rights, and final legal/provider terms remain UNKNOWN.

# 11. Final Outcome

Completed.

Delivered: classified/cited competitor teardowns, market matrix, product/JTBD direction, methodology and validation requirements, Philippine data/provenance/privacy constraints, architecture/security/operations inputs, risk ownership, and exact Phase 1 gate.

Changed from original plan: repeated current live research because prior subagent summaries were absent from the worktree; added current NPC 2026 scraping guidance; used ten-agent waves because runtime concurrency is four including root.

Remaining debt belongs to Phase 1: validate customer demand; approve constructs/thresholds; review data/provider legal terms; pin versions; accept ADRs/contracts/RLS/job model; create implementation-ready backlog. These are explicit next-phase work, not failed Phase 0 exit criteria.

Follow-up completed: [[001-phase-1-product-and-architecture-definition|Phase 1 ExecPlan]] was activated, reviewed, and completed before application code.

Canonical links: [[../../brain/00_HOME|Project Home]], [[../../brain/EVIDENCE_LEDGER|Evidence Ledger]], [[../../brain/RISK_REGISTER|Risk Register]], [[../../brain/PROJECT_STATE|Project State]].
