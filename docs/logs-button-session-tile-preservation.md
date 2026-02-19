# LOGS button session tile preservation

## Overview
Opening the `LOGS` workspace view could make active terminal sessions appear to disappear and get replaced by empty session tiles until a hard refresh.

## Why this was happening
The workspace layout switches between a normal grid and a split grid when logs are shown. During that switch, session tiles were removed from the hidden grid container. The live terminal state stayed in memory, so the app believed each session was still attached and did not reattach terminals to the new tiles.

## What changed
- Session tiles are now moved between grid containers during layout switches instead of being removed.
- This keeps existing terminal mounts intact while toggling `LOGS`.

## Why this fix
Preserving tile DOM nodes across layout modes keeps the tmux terminal connections stable and prevents the blank/replaced session behavior without requiring a page refresh.
