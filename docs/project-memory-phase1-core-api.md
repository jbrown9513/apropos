# Project Memory Phase 1 Core API

## Overview
Added an Apropos-native memory API so each project can store and read memories independently of any specific agent framework.

Phase 1 includes:
- `POST /api/projects/:projectId/memory`
- `GET /api/projects/:projectId/memory`
- `PATCH /api/projects/:projectId/memory/:memoryId`
- `DELETE /api/projects/:projectId/memory/:memoryId`
- `memory.saved` event emission
- `memory.updated` and `memory.deleted` event emission
- automatic memory cleanup when a project is deleted

## Why
We want memory to be a core product behavior that persists between Codex, Claude, and future agents.

Building the first storage API directly in Apropos gives us:
- one source of truth for project memory
- cross-agent portability
- a foundation for future semantic recall and adapter integrations
