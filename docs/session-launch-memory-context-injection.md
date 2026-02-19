# Session Launch Memory Context Injection

## Overview
Session launch API now supports injecting recalled project memory into agent prompts.

Supported request fields on:
- `POST /api/projects/:projectId/sessions`

Fields:
- `memoryQuery` (string)
- `memoryLimit` (number)
- `prompt` (optional user prompt)

When `memoryQuery` is provided for agent sessions, Apropos:
1. recalls ranked project memories
2. formats a memory context block
3. prepends that context to the launch prompt

## Why
This enables immediate cross-agent memory reuse at session start, without requiring UI-specific wiring first.
