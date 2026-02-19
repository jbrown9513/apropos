# Memory Event Ingest API

## Overview
Added a structured event-ingest route for memory:

- `POST /api/projects/:projectId/memory/ingest-event`

This lets adapters push lifecycle events into the memory engine without manually building memory payloads.

## Why
Cross-agent memory requires consistent event capture.

An event-ingest API gives Codex, Claude, and future adapters one stable path to map hook events into project memory.
