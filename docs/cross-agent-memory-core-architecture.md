# Cross-Agent Memory Core Architecture

## Overview
Apropos will own a single memory system that persists across all agent frameworks (`codex`, `claude`, and future agents).

This keeps memory project-scoped, portable, and consistent no matter which agent runs a session.

## Why
- We want one shared memory for each project, not separate memories per agent tool.
- We need stable behavior as we add more agent frameworks.
- We already have project/session/event infrastructure in Apropos; memory should plug into that foundation.

## Decision
- Apropos is the source of truth for memory storage and retrieval.
- Agent-specific integrations are adapters, not primary storage.
- `claude-mem` can be integrated as an optional adapter for Claude/Cursor workflows, but not as the core store.

## Memory model
Each memory item should include:
- `id`
- `projectId`
- `sessionId` (nullable)
- `agentKind` (`codex`, `claude`, etc.)
- `type` (`fact`, `preference`, `decision`, `task_context`, `tool_observation`)
- `content`
- `tags` (array)
- `visibility` (`project`, later: `global` if needed)
- `confidence` (0.0-1.0)
- `createdAt`
- `updatedAt`
- `source` (manual, inferred, imported)

Optional retrieval fields:
- `embedding`
- `embeddingModel`

## Event contract
Normalize events from all agents to one schema:
- `session.started`
- `session.stopped`
- `tool_call.started`
- `tool_call.succeeded`
- `tool_call.failed`
- `memory.saved`
- `memory.recalled`

Minimum payload for tool call events:
- `projectId`
- `sessionId`
- `agentKind`
- `toolId`
- `status`
- `durationMs`
- `error` (if failed)

## API shape (initial)
- `POST /api/projects/:projectId/memory`
- `GET /api/projects/:projectId/memory`
- `POST /api/projects/:projectId/memory/search`
- `POST /api/projects/:projectId/memory/recall`
- `POST /api/projects/:projectId/memory/import`
- `POST /api/projects/:projectId/memory/export`

## Adapter contract
Each adapter maps agent-specific signals into Apropos memory/events:
- lifecycle hook mapping
- tool call mapping
- context injection mapping
- write-back mapping (when a memory should be persisted)

Adapter outcomes:
- no adapter can bypass Apropos memory APIs
- adapter failures must not block session runtime
- all adapter writes are attributed to `agentKind` and `source`

## Storage strategy
Phase 1:
- Start with local project-scoped storage in Apropos data home.
- Use simple metadata + full text search baseline.

Phase 2:
- Add embeddings for semantic recall.
- Add ranking that combines recency + relevance + confidence.

Phase 3:
- Optional sync/export and policy controls.

## `claude-mem` integration posture
- Use as optional ingest/retrieval adapter where it helps.
- Do not require it for Codex or other agents.
- Any imported memory is normalized into Apropos schema.

## Rollout plan
1. Implement canonical memory schema + CRUD/search APIs.
2. Add normalized tool-call events with project/session identity.
3. Add logs filtering by project/session/tool.
4. Implement Codex adapter.
5. Implement Claude adapter.
6. Add optional `claude-mem` import/export bridge.
7. Add embedding-backed recall.

## Success criteria
- Memory persists across sessions and across agent frameworks in the same project.
- A memory created in one framework is recallable in another.
- Tool/MCP call visibility is queryable and filterable per project and session.
- Agent switch does not change memory behavior.
