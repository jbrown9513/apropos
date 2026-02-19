# Lucide icon standardization

UI iconography was standardized on the Lucide icon style to replace mixed emoji, text, and ad-hoc icon shapes.

## What changed
- Session tile actions now use Lucide-style SVGs for horizontal/vertical resize and close.
- Vertical resize icons now use distinct add/remove badge variants so height controls are visually different.
- Session tile controls now show explicit hover labels (`Add width`, `Remove width`, `Add height`, `Remove height`, `Close session`).
- Notification dismiss now uses a Lucide `x` icon.
- Project switcher caret now uses a Lucide chevron icon.
- Theme toggle (sun/moon), roulette toggle (dice), notification bell, and add-project FAB now use Lucide SVGs.

## Why
Using one icon pack gives the app a more coherent visual language and makes controls easier to scan.
It also removes ambiguity from text-based symbols and emoji-based controls in dense workspace UI surfaces.
- Resize controls now use semantic color coding: green for expand/add and red for contract/remove, with close using a stronger red state.
- Resize glyphs were simplified to plain bidirectional arrows for width and height controls to reduce visual noise.
