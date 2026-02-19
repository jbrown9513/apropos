# Session launch modal contrast and copy cleanup

Adjusted the session launch modal to use consistent theme-based contrast and simpler wording.

## What changed

- Added explicit dark/light theme styling for the app modal container and form controls.
- Normalized modal description/field text contrast for readability.
- Simplified launch modal copy:
  - `Start <kind> session` -> `Start <kind>`
  - `Choose where to launch this session.` -> `Choose launch location.`
  - `main` -> `Main workspace`
  - `Create new worktree` -> `New worktree`
  - `Base branch / tag` -> `Base ref (branch/tag)`

## Why this was implemented

Mixed contrast and inconsistent copy made the launch flow feel visually noisy and harder to parse quickly. The updated modal keeps language tighter and color contrast coherent per theme.
