# Tmux Wheel Direction Normalized

## Overview
Adjusted browser terminal wheel handling so scrolling direction is consistent and predictable.

## Why this was needed
After scrollback fixes, wheel direction could feel reversed on some trackpad/browser combinations.

## What changed
- Reintroduced explicit xterm wheel handling with normalized direction mapping.
- Kept history injection updates intact.

## Result
Wheel movement now matches expected viewport direction during tmux scrollback navigation.
