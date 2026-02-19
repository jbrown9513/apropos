# Project Switcher: Hide on Dashboard & Light Mode Contrast

## Problem

1. The project switcher dropdown was visible on the default dashboard/home view. It should only appear when a workspace is open.
2. In light mode (parchment theme), the project switcher had poor contrast — the warm tan tones for background, border, and text all blended together, making the selector hard to read and distinguish from the surrounding page.

## Changes

### Dashboard visibility

Added a `workspace-open` class check to the `renderProjectSwitcher()` enabled condition. The switcher now requires all three conditions to be visible:
- An active project ID is set
- More than one project exists
- The workspace is actually open (`body.workspace-open`)

### Light mode contrast

Broke the project switcher out of the shared parchment color rule and gave it distinct, higher-contrast styling:
- **Trigger & menu background**: Lifted to a near-white parchment (`#faf6ef`) instead of the mid-tone `#efdec1`
- **Border**: Darkened to `#8a7454` for a clear visible edge against the page
- **Text**: Deepened to `#2c2418` for strong readability
- **Hover/active states**: Adjusted to maintain visible differentiation against the lighter base
- **Count badge**: Stronger border and text contrast; notification badge uses deeper red tones
