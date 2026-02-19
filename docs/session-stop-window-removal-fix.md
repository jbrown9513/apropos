# Session Stop Window Removal Fix

## Overview

Stopping a session could terminate the tmux process but leave the session tile visible in the workspace.

## Why

The workspace refresh path hit a frontend runtime error in `renderWorkspace` caused by redeclaring `activeSessionIds`.
When that error occurred after stop, UI reconciliation did not complete, so stale session tiles remained on screen.

This fix removes the duplicate declaration so stopped sessions are removed from the window grid on refresh.
