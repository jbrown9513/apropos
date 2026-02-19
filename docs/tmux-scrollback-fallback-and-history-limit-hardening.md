# Tmux scrollback fallback and history-limit hardening

## Overview

Fixed tmux terminal scrollback staying effectively at only about one historical line in some sessions.

## What changed

- Reinforced tmux `history-limit` with a global apply (`set-window-option -g`) when sessions are created and when terminals attach.
- Kept the existing per-session history apply in place.
- Added deep scrollback preload in fallback terminal mode (when PTY attach is unavailable), so browser scrollback is populated from tmux pane history on connect.

## Why

Some environments can end up with a very low tmux history limit from user config, and fallback mode previously only repainted the current screen without injecting deep history. Together, that made scrolling feel capped to near-zero history even when longer output existed.
