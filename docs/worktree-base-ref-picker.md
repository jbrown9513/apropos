# Worktree Base Ref Picker

## Request
When launching a new tmux session for a git project and choosing "Create new worktree," the UI asked for "Base ref (if creating)" as free text with a default value. This was unclear for users who do not already know git ref terminology.

## Why this was implemented
The launch flow now helps users choose a valid base ref more confidently by exposing a picker-style autocomplete list of branches/tags (plus common defaults like `HEAD`).

This keeps the worktree creation flow fast for experienced users while making the prompt understandable for everyone else.

## Result
- Added a project API that lists git refs used for suggestions.
- Updated the session launch form so base ref entry supports autocomplete suggestions.
- Updated label wording to make the field intent clearer.
