# MCP Repo Add Auto Derive Config Session

## Overview

Adding an MCP repository now does more than clone.
After the repository is added, Apropos launches a Codex session for the project to inspect the repository and derive MCP config entries for:

- `.mcp.json` (Claude)
- `.codex/config.toml` (Codex)

## Why

Many MCP repositories do not include an Apropos-specific catalog file, so tool discovery can return zero entries even though the server is usable.
Launching an inspection session on add gives a reliable path to configure MCP immediately from repository contents instead of blocking on catalog metadata.
