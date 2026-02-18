# Tmux session width regression

## Request

Spawned `tmux` sessions started showing only part of the terminal as usable, with the right side rendering filler dots (`........`) instead of a full-width shell.

This was happening after a change that forced fixed tmux window dimensions at session creation.

## Change

Session creation no longer forces fixed `-x/-y` dimensions by default.

You can still explicitly pin session dimensions with:

- `TMUX_COLS`
- `TMUX_ROWS`

## Why

Fixed width caused tmux to stay narrow even when clients were wider, which made half the terminal unusable.

Returning to client-managed sizing restores normal full-width behavior, while keeping env-var overrides for cases that need a pinned size.
