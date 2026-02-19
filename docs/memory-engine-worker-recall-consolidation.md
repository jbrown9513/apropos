# Memory Engine Worker Recall Consolidation

## Overview
Implemented a first-pass Apropos memory engine inspired by the `claude-mem` core flow:
- ingest
- background worker processing
- recall
- consolidation

### Added
- new engine module: `src/memory-engine.js`
- queued ingest path for manual memory writes and MCP auto-capture
- recall endpoint:
  - `POST /api/projects/:projectId/memory/recall`
- consolidation endpoint:
  - `POST /api/projects/:projectId/memory/consolidate`

## Why
This creates a framework-agnostic memory core that can be shared across Codex, Claude, and future agents.

By moving from direct writes to an engine pipeline, Apropos gets a stable place to evolve:
- vector integrations
- ranking improvements
- summarization and cleanup strategies
