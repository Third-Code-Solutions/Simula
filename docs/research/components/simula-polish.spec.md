# SIMULA polish specification

## Overview

- Target files: `apps/web/src/app/page.tsx`, `apps/web/src/app/globals.css`
- Reference screenshots: `docs/design-references/micro-live-desktop.png` and
  `docs/design-references/micro-live-mobile.png`
- Interaction model: static narrative, hover feedback, restrained ambient loops

## Foundation

- Paper: `#f5f5f5`; ink: `#221f1c`; product cards: white.
- Hero: SIMULA blue-to-teal sunrise with meadow horizon.
- Display face: Playfair Display 900; UI face: Public Sans; metadata: IBM Plex
  Mono.
- Controls: 8px radius. Product cards: 14-18px radius with hairline borders.
- Desktop page frame: 1200px. Mobile content width: viewport minus 32px.

## Landing polish

- Preserve one H1 and the exact copy: “Rehearse the decision. Keep the doubt.”
- Product preview remains the hero’s visual proof; no stock imagery.
- Add a quiet animated status/pulse or progress cue inside the product mockup.
- Add 180-240ms hover/focus feedback to buttons, cards, and graph nodes.
- Use transforms no larger than 4px; no elastic motion or excessive glow.
- Add subtle depth layers to the hero and product window without reducing
  contrast.
- Keep visible copy: authored demo, deterministic mock, estimates nobody.

## Responsive behavior

- Desktop 1440: centered hero, 72-88px display range, full product mockup.
- Tablet 768: reduce display scale; keep product UI readable.
- Mobile 390: 44px-class display, hidden secondary nav, one-column product
  preview.
- No horizontal overflow at 1440, 768, or 390.

## Accessibility and motion

- Focus-visible state on every interactive element.
- Text contrast meets WCAG AA.
- All ambient animations stop under `prefers-reduced-motion: reduce`.
- Decorative motion must not alter semantics or product state.

## Out of scope

- No Micro assets, copy, branding, page length, or backend behavior.
- No new dependencies.
