# Agent Default Memory And No Legacy Proxy

## Overview
Memory now writes by default from live agent activity (`codex`, `claude`, `cursor`, `opencode`) and completion detection.

Also, the legacy proxy route is disabled:
- `POST /api/proxy/:target` now returns `410`
- project-scoped proxy route is required:
  - `POST /api/projects/:projectId/proxy/:target`

## Why
The target behavior is agent-native memory capture, not only MCP proxy capture.

Live session polling now records progress/completion memories so memory grows as agents work.
