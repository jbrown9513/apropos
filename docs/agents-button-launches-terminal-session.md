# AGENTS button launches terminal session tile

The workspace `AGENTS` action now opens as a terminal session tile instead of opening the AGENTS markdown editor panel above the session grid.

## What changed
- `AGENTS` now launches a `tmux` session using an editor command for `AGENTS.md`.
- The launched session remains in the terminal after editor exit (`exec $SHELL`) so the tile stays active.
- New AGENTS sessions follow normal session grid behavior and ordering, so they appear as a regular session tile.

## Why
Users expect workspace actions that start active work to appear in the same terminal tile flow as other sessions.
Launching AGENTS as a session tile avoids layout interruption and keeps the workspace interaction model consistent.
