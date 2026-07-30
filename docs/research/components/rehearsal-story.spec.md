# Rehearsal Story Specification

## Overview

- Target: `apps/web/src/app/rehearsal-story.tsx`
- Styles: `apps/web/src/app/rehearsal-story.module.css`
- Screenshot: `docs/design-references/simula-pass2-before-desktop.png`
- Interaction model: click/keyboard-driven tabs; no auto-rotation

## DOM structure

- `section` with centered eyebrow, H2, and support copy.
- Dark 1152px stage containing a left tablist and right product panel.
- Three tabs: Frame, Rehearse, Decide.
- One active tabpanel at a time, with product-specific mock data.

## Computed benchmark values

- Benchmark demonstration: 1056px by 544px.
- Benchmark columns: 477.7px / 578.3px.
- Benchmark desktop heading: 48px / 48px editorial.
- Benchmark tabs: 8px radius; 200ms cubic-bezier transitions.
- Active tab: `rgba(0,0,0,.05)` on paper, ink `rgb(34,31,28)`.
- Inactive tab: transparent, stone `rgb(121,114,103)`.

## SIMULA target values

- Section max width: 1200px; vertical padding: 128px desktop.
- Stage grid: `minmax(17rem,.78fr) minmax(0,1.22fr)`; gap 48px.
- Stage background: `#1d211e`; radius 18px; padding 48px.
- Tab row: radius 12px; padding 16px; transition 200ms ease.
- Active tab: white 10% fill, white text, one teal indicator.
- Product surface: white; radius 14px; hairline border; layered shadow.
- Motion: panel opacity + translateY(4px), 220ms. Maximum transform 4px.

## Per-state content

### Frame

- Label: Frozen setup
- Show stimulus v3, authored demo v1, deterministic mock v1.
- Boundary: versioned inputs cannot silently change during a run.

### Rehearse

- Label: Run state
- Show four completed checks and one live status pulse.
- Boundary: demo output remains non-representative.

### Decide

- Label: Human next step
- Show three research questions and an “Estimates nobody” marker.
- Boundary: output becomes a question, never a verdict.

## Accessibility

- `role=tablist`, `role=tab`, `role=tabpanel`.
- Arrow Left/Right/Home/End keyboard navigation.
- Selected tab has `aria-selected=true` and controls the panel.
- Visible focus state. Reduced motion disables panel/status animation.

## Responsive

- 1440: two columns, stage minimum height 544px.
- 768: two columns with 24px gap and 28px padding.
- 390: one column; horizontal three-tab row; panel full width.
- No horizontal overflow.

## Assets

- No external assets. CSS and semantic HTML only.
