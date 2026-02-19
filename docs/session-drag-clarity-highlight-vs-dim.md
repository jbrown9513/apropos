# Session drag clarity: highlight dragged tile, dim others

Drag-and-drop visuals were adjusted to make active tile movement clearer during session reordering.

## What changed
- The tile being dragged is now emphasized (stronger border ring + slight scale-up).
- Non-dragging tiles are dimmed while drag is active.
- Drag-active state applies consistently to whichever terminal grid is currently used.

## Why
Dimming the dragged tile made the interaction ambiguous.
Highlighting the active tile and dimming surrounding tiles makes drag intent and snap target flow easier to follow.
