# Focus mode global notification queue

Focus mode now works across all projects and sessions instead of being tied to the currently selected project.

## What changed
- Focus mode selection is now project-agnostic.
- Session selection prioritizes sessions linked to outstanding notifications across the full workspace.
- Notification-linked session matching is no longer restricted to `tmux` kind only.
- Project picker is hidden while focus mode is enabled.
- Focus mode controls now use a single `NEXT` button to move through the active work queue.
- If no notification-linked session is available, focus mode falls back to a random active session.

## Why
The intent of focus mode is to move users through their highest-priority active work queue, one session at a time, regardless of project boundaries.
A global queue and single-step `NEXT` control creates a clearer triage flow and keeps attention on the next actionable session.
- If notifications exist but none map to active sessions, `NEXT` rotates random active sessions so focus mode still progresses.
- Focus mode now force-hides the project picker immediately on toggle.
- Notification-to-session matching now falls back to project + session kind when direct session identity fields are missing, reducing incorrect random fallback picks.
- Focus footer now displays a source badge: `Notification queue` or `Random fallback`.
- Resize controls now resolve the clicked session's owning project, so width/height changes work correctly for cross-project sessions shown in focus mode.
