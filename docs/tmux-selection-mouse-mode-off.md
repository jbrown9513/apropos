# Tmux selection and wheel behavior

## Request

Text selection/copy and mouse wheel behavior both need to work correctly in embedded tmux terminals.

## Change

tmux mouse mode is disabled for embedded terminal sessions.

- New sessions are created with tmux `mouse` set to `off`.
- Terminal attach flow also sets tmux `mouse` to `off` so existing sessions behave consistently.
- Frontend terminal wheel handling now explicitly scrolls xterm buffer lines and prevents wheel events from being interpreted as shell history-style input.
- Text-selection reliability continues to be handled by frontend changes (no draggable terminal tiles, native copy/paste events, and buffered redraws during active selection).

## Why

Disabling tmux mouse mode keeps browser text selection reliable.

Explicit frontend wheel scrolling preserves expected mouse-wheel behavior without reintroducing selection breakage.
