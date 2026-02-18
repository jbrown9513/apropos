# Terminal Arrow History Vs Scroll

## Overview
Terminal keyboard arrows now map cleanly to tmux key navigation in fallback terminal mode.

## Why This Was Implemented
Users need `Up`/`Down` to navigate shell history in tmux sessions. Mouse wheel behavior is separate and should remain about scrolling.

## What Changed
- Fallback terminal input parsing now detects arrow-key escape sequences.
- Arrow keys are forwarded to tmux as key events (`Up`, `Down`, `Left`, `Right`) instead of generic literal text.
- This keeps keyboard history navigation reliable while preserving mouse scroll behavior.
