# Rich Worktree Selector Popup

## What changed

The "Start session" popup for git projects was crowded and used a basic native `<select>` dropdown for choosing a workspace. This made it hard to scan options and felt low-quality.

## Why

The worktree selector is a key decision point when launching a session. Users need to quickly identify whether to use the main workspace, an existing worktree, or create a new one. A richer UI with visual hierarchy makes that decision faster and less error-prone.

## Improvements

- **Larger modal** — widened from 640px to 720px with more internal padding and spacing so fields don't feel jammed together.
- **Rich option cards** replace the native `<select>` — each workspace option is a clickable card with an icon (home, git-branch, plus-circle), a name, a detail line, and a radio-style check indicator.
- **Conditional create fields** — the "Worktree name" and "Base branch / tag" inputs only appear when "Create new worktree" is selected, reducing visual noise for the common case.
- **Theme-aware** — cards respect light, dark, and default theme palettes.
