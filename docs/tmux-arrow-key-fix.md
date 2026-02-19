# Fix: Arrow keys not working in agent tmux sessions

## Problem

Inside Claude (and other agent) tmux sessions, pressing Up/Down arrow keys
would dismiss interactive dialogs (like `/skills` picker) instead of navigating
them. The arrow key input was being split by tmux into a standalone Escape
keypress followed by literal `[A`/`[B` text.

## Root cause

Tmux's `escape-time` setting defaults to 500ms. After receiving an escape
character (`\u001b`), tmux waits up to this duration for additional characters
before deciding whether the escape is standalone or part of an escape sequence
(e.g., `\u001b[A` for Up arrow).

When the browser terminal (xterm.js) sends arrow key escape sequences through
the WebSocket -> PTY -> tmux pipeline, subtle buffering at the PTY layer can
cause the escape byte to arrive at the tmux server fractionally before the
remaining bytes. With the default 500ms window this normally resolves, but
under certain timing conditions tmux treats the escape as a standalone Escape
keypress and then processes `[A` as literal text input.

## Fix

Set `escape-time 0` on the tmux server in two places:

- **Session creation** (`src/sessions.js`): Applied when a new tmux session is
  spawned so the setting is active from the start.
- **WebSocket connection** (`src/server.js`): Reinforced when a browser terminal
  connects, in case the tmux server was started with a different escape-time.

With `escape-time 0`, tmux recognizes escape sequences immediately without any
wait window, eliminating the race condition entirely.
