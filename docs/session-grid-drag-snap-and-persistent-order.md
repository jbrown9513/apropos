# Session grid drag snap and persistent order

Session tiles now support drag-and-drop reordering with grid snapping behavior, and the order is preserved across refreshes.

## What changed
- Re-enabled draggable session tiles in normal workspace mode.
- Drag-and-drop ordering now works in both terminal grid layouts (standard and split/logs view).
- Reordering snaps by tile midpoint and updates saved session order immediately on drop.
- Saved order is reused after refresh through existing session-order persistence.

## Why
Users need to quickly arrange active tmux session tiles to match their workflow.
Persisting that order after refresh keeps the workspace stable and avoids repetitive manual rearrangement.
- Session order persistence now uses stable tmux identity keys (`host + tmuxName`) instead of runtime-only session ids, reducing reorder drift after refresh.
- Drop lock animation timing was shortened so dragged tiles return to normal size faster after release.
