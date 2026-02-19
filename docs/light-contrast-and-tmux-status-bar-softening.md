# Light Contrast And Tmux Status Bar Softening

## Overview
Adjusted theme and terminal styling to improve readability in light mode and remove overly bright tmux visuals.

## Why this was needed
Light mode text and controls were too low-contrast in several areas, and tmux sessions still showed a bright bottom status bar that felt visually harsh.

## What changed
- Increased light-mode text contrast for project metadata, notification text, dropdown labels, and mono content.
- Strengthened light-mode button and badge contrast while keeping the soft paper palette.
- Disabled tmux status bars for embedded sessions to remove the giant bright bottom bar.
- Softened terminal ANSI color palette so green and other accents are less neon.

## Result
Light mode remains soft but readable, and terminal panes feel calmer without bright status-bar artifacts.
