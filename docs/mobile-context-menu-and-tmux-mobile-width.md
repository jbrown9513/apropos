# Mobile context menu and tmux mobile width

Added mobile-sized rendering behavior for workspace context controls and tmux tile sizing.

## What changed

- On mobile widths, top-right workspace context controls are consolidated behind a single menu icon.
- The mobile context menu contains project switcher, theme toggle, focus toggle, and notifications controls.
- A badge on the mobile menu icon mirrors unread notification count.
- Default tmux tile minimum width is reduced for mobile layouts.

## Why this was implemented

The desktop control strip consumed too much space on smaller screens and fragmented context actions.

Consolidating controls into one menu icon keeps mobile navigation cleaner, while reducing default tmux tile width improves fit and readability on narrow displays.
