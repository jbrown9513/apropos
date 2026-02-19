# Focus mode project context priority

Focus mode now prioritizes the currently open project instead of feeling detached from the workspace the user is actively viewing.

## What changed

- Focus-mode session selection now prefers sessions from the active project.
- Focus-mode notification queue now prefers alerts from the active project.
- If the active project has no matching sessions or notifications, focus mode falls back to global items so the mode still works.
- Fallback focus session memory is now tracked per project to keep selection stable while switching projects.
- The workspace title in focus mode now includes the active project name.
- Focus footer copy now clarifies that empty/missing matches are scoped to the current project.

## Why

Users in focus mode should still see immediate context about the project they are working on. Prioritizing active-project sessions and notifications keeps focus mode actionable without removing the global fallback behavior.
