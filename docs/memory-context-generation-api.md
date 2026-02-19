# Memory Context Generation API

## Overview
Added a memory-context endpoint for adapters/session launch flows:

- `POST /api/projects/:projectId/memory/context`

It returns:
- ranked recall results
- a formatted context block that can be injected into prompts

## Why
Core memory systems need a consistent way to convert stored memory into reusable context for agent sessions.
