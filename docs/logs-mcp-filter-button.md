# Logs MCP Filter Button

## Overview
The existing `LOGS` panel now includes a single `Filter` button for `MCP Logs`.

The button cycles through:
- `all`
- `codex`
- `claude`
- `errors`

This works in both normal logs view and split-pane logs view.

## Why
We already have one logs surface for MCP and diff activity.
Adding a filter directly in that same component makes it faster to focus on relevant MCP traffic without creating a new panel or workflow.
