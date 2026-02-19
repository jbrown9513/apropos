# Tmux Wheel DOM Handler Fallback

## Overview
Replaced terminal wheel interception with a direct DOM wheel listener on each terminal mount.

## Why this was needed
Wheel behavior became inconsistent across browser/xterm combinations, including reversed direction and cases with no scroll response.

## What changed
- Added a mount-level `wheel` listener (`passive: false`) that maps wheel movement to `term.scrollLines(...)`.
- Added cleanup on terminal teardown to remove the listener.

## Result
Scroll wheel behavior is restored and deterministic in embedded tmux terminal panes.
