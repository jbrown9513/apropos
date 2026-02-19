# Tmux session close button placement and icon update

Session tile controls were updated so the close action follows a traditional terminal-style top-right placement.

## What changed
- The session close control now renders as an `X` icon-style button instead of the text label `Stop`.
- Resize controls (`+W`, `-W`, `+H`, `-H`) are rendered immediately to the left of the close button.
- The close button remains wired to the existing session-stop behavior, but the UI now communicates it as a close action.

## Why
This aligns the tile chrome with expected window-control patterns where close is the far-right action and uses an `X` affordance.
That makes the action faster to locate and reduces ambiguity from the prior `Stop` text label.
