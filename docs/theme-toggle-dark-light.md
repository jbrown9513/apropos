# Theme Toggle Dark And Light

## Overview
Added a top-right theme switcher with sun/moon indicators so the dashboard can match terminal expectations.

## Why this was added
Most tmux/Codex/Claude sessions use dark visuals, while the dashboard was previously light by default. This mismatch made context switching harder.

## What changed
- Added a slider-style theme toggle in the right-corner toolbar, aligned with existing controls.
- Added persistent theme preference storage in local storage.
- Set dark as the default mode.
- Added a pastel light mode for users who prefer a bright workspace.

## Result
The app now supports explicit, quick theme selection between dark and light pastel modes with consistent behavior across sessions.
