# MCP Repo URL SSH Flow

## Overview

The MCP repository setup flow is now centered on a single GitHub repository URL that users set from the UI.
The form now instructs users to provide a GitHub SSH URL with push access, such as:

`git@github.com:jbrown9513/apropos_mcp.git`

When this URL is set for a specific project, Apropos clones the repository into:

`~/.apropos/<project-id>/mcp/<repo-id>`

(or `$APROPOS_HOME/<project-id>/mcp/<repo-id>` when `APROPOS_HOME` is customized).

## Why

This keeps MCP setup simple while allowing each project to own its MCP sources independently.
By requiring a push-capable GitHub SSH URL, users are guided toward repos they can actively evolve, not just read.
This supports iterative agent workflows where MCP servers are created and improved over time in a user-owned repository.
