# Light mode dropdown and terminal theme fix

## Overview
In light mode, unselected dropdown entries appeared too dark, and tmux terminals kept a dark-blue appearance.

## What changed
- Added explicit light-mode styling for native select menu entries (`option` and `optgroup`).
- Set `color-scheme: light` for the light theme.
- Added light-mode overrides for terminal-kind tile gradients.
- Updated terminal theme wiring so xterm uses a light palette in light mode and updates live when theme is toggled.

## Why this was implemented
Some controls were still using darker default/system rendering paths, and terminal colors were hardcoded to a dark palette. Applying explicit light-mode styles and dynamic terminal theme selection keeps the workspace visually consistent.
