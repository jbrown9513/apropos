# Focus mode random tmux fallback

Focus mode now falls back to a random active tmux session when there are no outstanding notifications for the project.

## What changed
- When notification backlog is empty, focus mode no longer defaults to the first tmux session.
- Instead, it picks a random active tmux session for that project.
- The random selection stays stable while that session remains active, so focus mode does not jump between sessions during refreshes.

## Why
When notifications are depleted, users still need a useful working terminal in focus mode.
A random fallback avoids hard bias toward the first session while keeping the view stable once chosen.
- Added a render-level safety fallback so focus mode still displays an active session if selection metadata is temporarily missing.
