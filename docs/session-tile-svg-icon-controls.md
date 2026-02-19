# Session tile controls switched to SVG icons

Session tile chrome now uses icon buttons instead of text shortcuts for close and resize controls.

## What changed
- Replaced text labels (`+W`, `-W`, `+H`, `-H`, `X`) with inline SVG icons.
- Kept existing behavior and bindings for width/height resize and close actions.
- Preserved accessibility with `aria-label` and tooltip text for each control.

## Why
Icon controls are faster to scan visually and align with common window-control patterns.
This reduces UI noise and makes session actions easier to recognize at a glance.
