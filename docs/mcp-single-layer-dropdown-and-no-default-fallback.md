# MCP Single-Layer Dropdown And No Default Fallback

## Overview

The workspace `MCP` control now opens a single dropdown menu that lists available configured MCP servers for the active project, plus one `Create new MCP server` option.

The previous multi-step flow (action picker, repository picker, then tool picker) was removed for this path.

## Why

The MCP button should act like a direct launcher, not a nested flow.
A single-layer dropdown reduces interaction steps and makes it obvious what servers can be added immediately.

This change also removes fallback default MCP tools when user repositories do not provide tools.
If a configured repository is empty, Apropos now shows no servers from defaults, which matches explicit user configuration and avoids surprising entries.
