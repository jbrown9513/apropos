# Claude-Mem Feasibility Investigation

## Overview
We evaluated whether `claude-mem` is a fit for two goals:
- save memory per project
- add visibility into tool/MCP calls

Investigation date: February 19, 2026.

## Upstream findings
- `claude-mem` presents itself as a memory layer for AI coding workflows with first-class integrations focused on Claude Code and Cursor.
- Its standard setup uses:
  - an MCP stdio server (`npx claude-mem mcp`)
  - a memory worker
  - client hooks
- We did not find official Codex integration docs in the project docs/readme.
- We did not find a clearly documented, official Codex support path (install + hooks + lifecycle mapping) in upstream docs.

## Apropos codebase fit
Apropos already has a useful baseline:
- project-scoped persistence/state (`src/store.js`)
- MCP proxy entrypoints for both targets (`/api/proxy/codex`, `/api/proxy/claude`)
- event capture + websocket log streaming (`src/events.js`, `/ws/mcp-logs`)

Current gap for the requested visibility:
- proxy logs currently capture request id, target, method, status, and duration (`src/proxy.js`)
- they do not consistently include project id, session id, or normalized tool-call identity
- only proxied MCP traffic is visible; non-MCP tool calls inside Codex/Claude are not fully observable from Apropos today

## Applicability conclusion
- Claude/Cursor path: `claude-mem` is applicable as an optional integration for richer memory behavior.
- Codex path: treat as experimental until upstream publishes an explicit Codex support path.
- Cross-agent (Codex + Claude) product path: implement memory and observability in Apropos first so behavior remains stable and project-scoped.

## Recommended direction
- Build Apropos-native project memory as the default system of record.
- Keep `claude-mem` as an adapter for Claude/Cursor workflows, not the core dependency.
- Prioritize observability improvements in Apropos:
  - include `projectId`, `sessionId`, and `toolId` in proxy event payloads when available
  - normalize event schema (`tool_call.started`, `tool_call.succeeded`, `tool_call.failed`, duration)
  - add logs filtering by project/session in UI
- Re-evaluate deeper `claude-mem` Codex coupling only if upstream Codex support becomes official.
