# Tmux terminal paste reliability

## Request

Copy and paste was not working reliably inside embedded `tmux` terminals.

## Change

Paste handling now uses the terminal textarea `paste` event and forwards clipboard text into xterm directly.

This replaces the previous key-based clipboard read path.

## Why

The prior approach depended on `navigator.clipboard.readText()` during key events, which can fail due to browser permission/gesture constraints and cause paste to appear broken.

Using the browser's native paste event is the most reliable path for Cmd/Ctrl+V and menu paste.
