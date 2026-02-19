# Logs Split Ratio And Hide Refresh

## Overview
This updates the workspace logs split behavior so the layout is `2/3` terminal area and `1/3` logs panel on ultra-wide screens, with logs on the right.

## Why this was needed
The previous split used a narrower logs pane (`3/4` + `1/4`) and closing logs could leave terminal tiles in the split container until a hard refresh.

## What changed
- Changed split columns to a `2:1` ratio for terminal grid vs logs pane.
- On logs hide/show, the workspace now re-renders and refits active terminals immediately.

## Why this fix
The layout now matches intended proportions, and toggling logs no longer requires a page refresh to restore terminal sizing and placement.
