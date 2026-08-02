# Authentication Proof Rail Specification

## Overview

- Target: `apps/web/src/app/sign-in/page.tsx`
- Styles: `apps/web/src/app/auth-proof.module.css`
- Screenshot: `docs/design-references/simula-pass2-before-signin.png`
- Interaction model: static proof rail; link hover only

## Current computed structure

- Main: 1440px by 900px grid, columns 576px / 864px.
- Context: mint `rgb(203,251,241)`, 80px padding.
- Form card: white, 128px padding.
- Context H2: Playfair Display, 80px / 80px.
- Form H1: Public Sans, 80px / 76px.
- Button: 480px by 42px, 8px radius, ink fill.

## Target proof rail

- Insert after context description inside the mint panel.
- Three compact cards: Versioned, Bounded, Traceable.
- Desktop grid: three columns, 8px gap.
- Card: white 48% fill, 1px white 60% border, 12px radius, 12px padding.
- Number: IBM Plex Mono, 10px, teal text.
- Label: Public Sans, 12px, 700 weight, ink.
- Supporting line above rail: “Built for rehearsal, not prediction.”
- Preserve all existing authentication copy and behavior.

## Responsive

- At 900px and below: context and form stack as current implementation.
- At 390px: proof cards stay three columns with concise labels; no body
  overflow.

## Accessibility

- Use a list with a visible heading or `aria-label`.
- Decorative numbers remain visible text; no redundant ARIA.
- Contrast remains AA.

## Assets

- No external assets.
