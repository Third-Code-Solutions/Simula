# Reference behaviors and SIMULA implementation

## Observed reference behavior

1. The header is absolute at the top. A separate rounded navigation pill visually floats over selected cinematic blocks.
2. Two 1550 px sequences pin a centered display statement. Words rise by roughly 22 px while opacity advances with scroll.
3. The desktop product block spans 5000 px. A sticky viewport keeps the explanation left and swaps large product panels right.
4. The mobile product route disables pinning and presents each product panel in reading order.
5. A full-viewport cinematic panel is followed by a large rounded surface that appears to rise over it.
6. Gallery rows use overflow clipping, broad cards, filter pills, and deliberately partial edge cards.

## SIMULA motion contract

- Hero media: slow scale from `1.08` to `1.0` and vertical parallax. Product preview enters independently.
- Statement blocks: sticky only on desktop; word spans reveal with scrubbed opacity and `translateY`.
- Product story: sticky desktop stage with five indexed panels. Progress controls active nav, copy, and panel opacity. Mobile shows five static panels.
- Principle interlude: generated decision-horizon image uses a subtle pinned scale/parallax treatment.
- Context nodes: small transform-only entrance, not continuous wandering motion.
- Use GSAP `useGSAP`, scoped refs, `ScrollTrigger`, and `gsap.matchMedia`. Revert all effects on unmount.
- Animate `transform` and `opacity`; avoid layout properties in scrubbed sequences.
- Reduced motion: final visual states, no pinning, no scrub.

## Interaction states

- Header CTA and primary CTAs: visible hover lift of at most 2 px; high-contrast focus ring.
- Filter chips: real buttons; `aria-pressed` marks the active collection.
- Product step rail: clickable desktop buttons update the active panel; scrolling remains canonical.
- All cards retain readable content when JavaScript is unavailable.

## Verification matrix

| Viewport | Must verify |
| --- | --- |
| 1440 x 1000 | hero composition, sticky statements, all five product states, raised sheet, console clean |
| 768 x 900 | no clipped copy, two-column card behavior, no sticky overlap |
| 390 x 844 | no horizontal document overflow, complete static product stack, accessible floating nav |

The target is the reference’s cinematic rhythm and information hierarchy—not copied branding, assets, claims, or source code.
