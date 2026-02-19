# Light mode dropdown backgrounds

## Overview
In light mode, some dropdown controls still looked too dark compared to the rest of the interface.

## What changed
Added explicit light-theme styling for `.toolbar-select` and `.mcp-dropdown-trigger` so they use the same lighter panel tones as other light-mode controls.

## Why this was implemented
These controls had more specific base selectors that kept dark backgrounds, which made dropdown UI feel visually inconsistent in light mode.
