# Product scroll story

- Five steps: Frame, Audience, Rehearse, Inspect, Decide.
- Desktop section height about 500 vh; one sticky viewport; copy left, authored UI panel right.
- Active panel uses opacity and transform transitions. Inactive panels are `aria-hidden` only when JavaScript controls state.
- Step buttons update the visible panel and scroll to the corresponding progress position.
- Tablet/mobile render all steps in document order with no pinning.
