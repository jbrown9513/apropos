# Terminal Wheel Scrollback Behavior

## Overview
Wheel scrolling now stays local to xterm scrollback for all session tiles (`tmux`, `codex`, `claude`).

## Why this was needed
Tmux copy-mode scrolling can move the active pane cursor away from the current input line.
That breaks ongoing typing flows for agent and shell sessions.

## What changed
- Frontend wheel-to-`tmux-scroll` bridging is disabled.
- Wheel events are captured in the terminal mount, prevented from propagating to shell/tmux input handling, and applied via `term.scrollLines(...)`.
- Wheel interaction uses xterm local output scrollback only.

## Result
- Scrolling shows conversation/output history with a visual scrollbar.
- Active cursor/input line stays stable and does not jump into prior lines.
