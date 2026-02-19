# Tmux Scrollback History Injection Append

## Overview
Adjusted tmux history injection in the browser terminal to ensure previous output remains scrollable.

## Why this was needed
The prior history injection path attempted to save and restore the visible screen around history writes. In practice, that could leave users able to scroll only limited command/input traces instead of full prior pane text.

## What changed
- Switched `history` message handling to append captured history directly into xterm scrollback.
- Removed screen restore logic from history injection.

## Result
Scrolling up now reaches prior pane output more reliably, not just recent input artifacts.
