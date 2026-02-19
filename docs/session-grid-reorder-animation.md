# Session grid reorder animation polish

Session tile reordering now uses motion to make grid snapping behavior easier to track visually.

## What changed
- Added FLIP-style tile reflow animation during drag-and-drop reorder.
- Neighboring tiles animate from previous position to new grid position instead of jumping instantly.
- Dragged tile remains direct-manipulation while non-dragging tiles animate.

## Why
When many sessions are open, instant jumps make it hard to understand where tiles moved.
Short reflow animation improves spatial continuity and makes the snap result more obvious.
- Added snap-target highlight and a short snap-lock animation on drop to make tile locking feel clearer and more tactile.
- Tightened reflow timing to a faster, snappier lock-in motion.
- Reorder interaction now uses strict swap-on-hover behavior instead of insert-before placement.
- Added a more dramatic shuffle animation profile (larger overshoot/tilt) for clearer tile movement.
- Reflow now uses explicit FLIP transitions (`transform` tween) with a short swap cooldown to avoid abrupt rapid-fire reorders during drag.
- Tuned interaction feel: increased dragged-tile scale emphasis and reduced reflow duration/cooldown for a snappier shuffle.
- Drop release responsiveness was tightened by clearing drag state immediately on drop and shortening lock pulse duration.
