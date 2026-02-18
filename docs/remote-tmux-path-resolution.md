# Remote Tmux Path Resolution

## Overview
Remote project session launch and attach now resolve `tmux` more reliably when running over SSH.

## Why This Was Implemented
Some remote hosts have `tmux` installed, but non-interactive SSH sessions do not include the same shell `PATH` as interactive terminals. This caused session launch to fail with `command not found: tmux`.

## What Changed
- Added remote `tmux` resolution that checks:
  - `command -v tmux`
  - `TMUX_BIN_REMOTE` (if set)
  - common install paths like `/opt/homebrew/bin/tmux`, `/usr/local/bin/tmux`, and `/usr/bin/tmux`
- Applied this to both:
  - session creation/listing/control flows
  - remote terminal attach flows

## Result
Remote projects like `jfbrown@studio.local` can launch and attach sessions even when `tmux` is not exposed on the default non-interactive shell `PATH`.
