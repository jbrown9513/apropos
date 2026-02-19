# Project Card Size Aligned To Default Tmux Tile

## Overview
Adjusted home project cards so their footprint aligns with default tmux tile sizing.

## Why this was changed
Switching between the projects screen and a project workspace caused noticeable size and visual rhythm shifts.

## What changed
- Project grid now uses the same baseline minimum width used by terminal tile sizing.
- Project cards now use tmux-like radius/padding and a fixed minimum height matching default tmux tile body + chrome.

## Result
Project tiles and default tmux tiles now feel much more consistent when moving between home and workspace views.
