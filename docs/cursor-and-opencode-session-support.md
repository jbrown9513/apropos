# Cursor and OpenCode session support

Added first-class workspace session support for Cursor CLI and OpenCode agents.

## What changed

- Workspace toolbar now includes `+ cursor` and `+ opencode` launch buttons.
- Session parsing and agent-session handling now recognize `cursor` and `opencode` kinds.
- Automation session schema now accepts `cursor` and `opencode` kinds.
- Terminal tiles and session legend now include distinct visual treatments for both new agent kinds.
- Missing-CLI launch errors now offer docs links for Cursor CLI and OpenCode.

## Why this was implemented

Users need to run multiple coding agents side-by-side from the same tmux workspace flow. Adding Cursor and OpenCode as native session kinds keeps launch, monitoring, and notification behavior consistent with existing Codex/Claude sessions.
