# Micro live behavior benchmark

Observed 2026-07-18 at `https://www.micro.so/`. Used as a quality benchmark, not
a content or asset source.

## Interaction model

- Header: static, transparent, 68px. No scroll-state transformation observed.
- Navigation/buttons: 8-10px radii; most feedback uses 150-200ms transitions.
- Hero: static composition over a large sky asset; product UI carries the proof.
- Automation categories: click-driven pills. Active state uses ink text over a
  5% black fill; inactive state uses stone text and transparent fill.
- Ambient motion: restrained repeating loops. Observed 2s pulses, 7s progress
  expansion, and 24-30s marquees. No smooth-scroll library detected.
- Media: two autoplaying looping videos lower on the page.

## Responsive behavior

- Desktop 1425px content width: hero display text 72px / 68.4px.
- Tablet 753px content width: hero display text 60px.
- Mobile 375px content width: hero display text 36px / 34.2px.
- No horizontal overflow at desktop, tablet, or mobile.
- Mobile retains product demonstrations but stacks dense structures.

## SIMULA adaptation

- Keep SIMULA shorter and decision-focused. No copied media or wording.
- Preserve the sunrise gradient and product-first proof from the supplied
  layout.
- Add restrained 180-240ms hover feedback and slow ambient UI loops.
- Disable all non-essential motion under `prefers-reduced-motion`.
- Keep authored-demo and estimates-nobody boundaries visible at every trust
  point.

## Second-pass audit

- Micro's strongest product-story section is a 1056px by 544px asymmetric grid:
  477.7px narrative controls beside a 578.3px product surface.
- Large section headings use 48px / 48px editorial type on desktop.
- Click-state pills use an 8px radius, 200ms transitions, ink `#221f1c`, stone
  `#797267`, and a 5% black active fill.
- The page remains static-header/native-scroll. Product demonstrations provide
  the interaction; the document does not depend on scroll choreography.
- Responsive display scale: 72px desktop, 60px tablet, 36px mobile. Dense grids
  stay two-column at 753px and collapse by 375px without horizontal overflow.

### Second-pass SIMULA decision

- Add one click-driven rehearsal story: Frame, Rehearse, Decide.
- Keep the control surface keyboard-operable with true tabs and panels.
- Use a dark product-stage wrapper to create one deliberate contrast event.
- Add a compact proof rail to sign-in so the system chrome carries product
  trust.
- No autoplay, copied integrations, marquees, video, or unbounded page length.
