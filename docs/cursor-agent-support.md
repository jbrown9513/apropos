# Cursor agent support

Apropos now supports Cursor alongside Codex and Claude for project context files, skills/rules, and MCP configuration. The implementation is modular so additional agentic systems can be added in one place.

## What changed

- **Agent systems registry** (`src/agent-systems.js`): Single source of truth for each system (codex, claude, cursor) defining:
  - Context/agents file path and default content (e.g. CLAUDE.md, .cursorrules)
  - Skills or rules directory and file layout (.codex/skills, .claude/skills, .cursor/rules)
  - MCP config path and format (.mcp.json, .codex/config.toml, .cursor/mcp.json)
- **Cursor context**: Project context is stored in `.cursorrules` at the project root. Scaffolding creates this file and ensures `.cursor/rules` exists.
- **Cursor rules**: Skills targeting Cursor are written as `.cursor/rules/<slug>.md` (one markdown file per rule). Same frontmatter and content style as Codex/Claude skills.
- **Cursor MCP**: MCP tools are written to `.cursor/mcp.json` when adding or updating MCP in a project, in addition to `.mcp.json` (Claude) and `.codex/config.toml` (Codex).
- **Agents editor**: The AGENTS view includes a "Context" dropdown to edit either Claude (CLAUDE.md) or Cursor (.cursorrules). Save sends `agentId` so the correct file is updated.
- **Skills**: Skill target can be codex, claude, or cursor. Inspector discovers Cursor rules from `.cursor/rules` and merges them into the project skills list with target `cursor`.
- **Proxy**: `DEFAULT_PROXY_TARGETS` includes a `cursor` entry for future MCP proxy use (e.g. `CURSOR_MCP_URL`).

## Why this was implemented

Users run multiple coding agents (Codex, Claude, Cursor, OpenCode) from the same workspace. Cursor had session launch support but no parity for project context, skills, or MCP. Modularizing agent layout into a registry keeps behavior consistent and makes it straightforward to add more systems later.
