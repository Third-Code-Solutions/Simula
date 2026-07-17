# SIMULA Execution Plan Standard

An ExecPlan is the self-contained implementation specification for a major
milestone. A new engineer should be able to continue work using the repository
and the ExecPlan without relying on previous chat history.

Every ExecPlan must contain the following sections.

## 1. Title and Status

- Plan name.
- Owner.
- Created date.
- Last updated date.
- Status: draft, active, blocked, completed, or superseded.

## 2. Purpose and User Outcome

Explain:

- The user or business problem.
- The intended observable result.
- Why the work is necessary now.

## 3. Current State

Document:

- Existing implementation.
- Relevant files and services.
- Known limitations.
- Evidence and prior decisions.

## 4. Scope

Clearly list:

- In scope.
- Out of scope.
- Non-goals.
- Assumptions.

## 5. Proposed Design

Cover as applicable:

- User experience.
- System architecture.
- Data model.
- API contracts.
- Asynchronous workflows.
- Security and privacy.
- Observability.
- Error handling.
- Migration and compatibility.
- Rollback strategy.

## 6. Milestones

Each milestone must include:

- Concrete work.
- Files or modules expected to change.
- Acceptance criteria.
- Tests.
- Verification commands.
- Rollback or recovery procedure.

## 7. Risks

Record:

- Technical risks.
- Product risks.
- Data and methodology risks.
- Security risks.
- Operational risks.
- Mitigation.

## 8. Decisions

Maintain a dated decision log explaining material changes to the plan.

## 9. Progress

Maintain a checklist with completed, active, blocked, and remaining items.

## 10. Validation Evidence

Record:

- Commands run.
- Test results.
- Screenshots or artifacts where relevant.
- Performance measurements.
- Evaluation results.
- Known failures or warnings.

## 11. Final Outcome

When completed, document:

- What was delivered.
- What changed from the original plan.
- Remaining debt.
- Follow-up work.
- Links to relevant Obsidian notes and ADRs.
