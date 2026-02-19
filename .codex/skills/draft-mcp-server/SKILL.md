---
name: draft-mcp-server
description: "Draft a new MCP server in the user-owned MCP GitHub repository."
---

# Draft MCP Server

Use this skill when a user wants to create a new MCP server in a project-scoped MCP repository.

## Goals

1. Pick the target MCP repository from the current project's configured GitHub repos.
2. Draft a new MCP server scaffold with practical defaults.
3. Add or update MCP catalog metadata so Apropos can discover it.
4. Keep changes scoped to the selected repository clone under `~/.apropos/<project-id>/mcp/<repo-id>`.
