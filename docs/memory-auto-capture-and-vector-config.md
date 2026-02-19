# Memory Auto-Capture And Vector Config

## Overview
Memory now auto-populates from project-scoped MCP proxy traffic and includes configurable vector-store settings.

Added:
- project-aware proxy routes:
  - `POST /api/projects/:projectId/proxy/:target`
  - existing `POST /api/proxy/:target` still works
- MCP auto-capture into project memory (default enabled)
- memory settings APIs:
  - `GET /api/settings/memory`
  - `POST /api/settings/memory`
- vector onboarding starter:
  - `POST /api/settings/memory/vector/onboarding-start`
- logs stream now includes `memory.*` events so saved memories are visible in the existing logs panel

## Why
Users need memories to appear without manual entry and need control over vector infrastructure.

Project-scoped proxy routing gives Apropos enough context to persist memory per project.
Configurable vector settings allow local default onboarding while keeping future providers flexible.
