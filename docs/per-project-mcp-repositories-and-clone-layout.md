# Per-Project MCP Repositories And Clone Layout

## Overview

MCP repository configuration is now scoped to each project instead of a single global list.
Each project owns its own MCP repositories, MCP catalog, and local clones.

Repository clones now live under:

`~/.apropos/<project-id>/mcp/<repo-id>`

instead of a shared global path.

## Why

Different projects can require different MCP sources.
Project-scoped MCP repositories let users mix sources without cross-project bleed-through and keep MCP setup aligned to the project where it is used.

This also makes draft/setup flows clearer: when launching MCP setup or creating new MCP servers, Apropos now references the selected project’s repository list only.
