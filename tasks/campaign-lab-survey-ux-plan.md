# Implementation Plan: Campaign Lab Survey Workflow UX

## Overview

Replace the JSON-first survey flow in the Message Test route with a guided,
aggregate-only workflow while retaining the existing API contracts.

## Tasks

### Task 1: Structured survey payload state

**Acceptance criteria:** Existing import, native-form, response, and calibration
payloads are composed from typed, human-readable inputs.

**Verification:** Focused unit coverage exercises the composition helpers.

**Dependencies:** None.

### Task 2: Guided route experience

**Acceptance criteria:** Default survey and calibration screens expose no JSON
editor; prerequisites, privacy, progress, and results are understandable.

**Verification:** Component render tests and manual browser inspection.

**Dependencies:** Task 1.

### Task 3: Accessibility and responsive assurance

**Acceptance criteria:** Controls are labeled, keyboard-native, and readable at
desktop and mobile breakpoints.

**Verification:** Web test, typecheck, lint, build, browser console, Axe, and
screenshots where the environment permits.

**Dependencies:** Tasks 1-2.
