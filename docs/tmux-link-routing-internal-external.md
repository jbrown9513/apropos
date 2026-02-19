# Tmux link routing for external and internal markdown

Enabled clickable links in tmux session output with clear routing behavior:
- External `http`/`https` links now open in a new browser tab.
- Internal markdown file links now open in the workspace markdown editor/reader flow.

## Why this was implemented

Session output often contains mixed link types (web links and project file references). The previous behavior did not provide a consistent click path for internal markdown references, which slowed down handoff and review workflows.

This update makes terminal output more actionable: web links leave the app in a browser tab, while project links stay inside the workspace and open the relevant markdown context.
