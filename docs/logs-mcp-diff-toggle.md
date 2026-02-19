# Logs MCP And Diff Toggle

## Overview
The workspace `LOGS` panel now supports two views: `MCP Logs` and `Diff Logs`.

## Why this was added
MCP proxy traffic is useful, but coding sessions also produce repository changes that should be visible from the same place. A single logs surface with a quick toggle makes it easier to inspect system activity and project file changes without leaving the workspace.

## What changed
- Added a logs view toggle in both inline logs and split-pane logs headers.
- `MCP Logs` keeps the existing streaming proxy log behavior.
- `Diff Logs` calls a new API endpoint and displays an ordered changed-file list from git status.
- Added a refresh action for `Diff Logs` so the file-change list can be updated on demand.

## Result
`LOGS` is now a multipurpose operational panel that can switch between backend proxy activity and active project diffs.
