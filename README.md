# apropos

Local dashboard + MCP observability proxy for project operations.

## What it does

- Registers local projects (git and non-git).
- Registers remote projects over SSH (`host:path`) with the same workspace/session controls.
- Stores config in `$APROPOS_HOME` (default: `~/.apropos`).
- Scaffolds each project with:
  - `docs/`
  - `CLAUDE.md`
  - `AGENTS.md -> CLAUDE.md` symlink
- Adds project MCP tools from a default catalog based on `modelcontextprotocol/servers`.
- Supports additional MCP catalogs from git repositories (configured in-app).
  - Custom MCP repositories should be set with a GitHub SSH URL that has push access (for example `git@github.com:org/repo.git`).
  - Repositories are cloned under `$APROPOS_HOME/mcp/<repo-id>` (default root: `~/.apropos/mcp`).
- Writes project-specific MCP config files for both:
  - Claude Code: `.mcp.json`
  - Codex: `.codex/config.toml`
- Saves project skills in both formats:
  - Codex: `.codex/skills/<skill>/SKILL.md`
  - Claude: `.claude/skills/<skill>/SKILL.md`
- Installs default skills on project add (currently: `write automations`, `setup mcp proxy` targeting both Codex and Claude).
- Spawns unlimited per-project sessions in `tmux` for:
  - shell (`tmux`)
  - `codex`
  - `claude`

## Tmux sizing

By default, new `tmux` sessions use tmux/client-managed sizing so they can expand to the full terminal width.

- Override columns with `TMUX_COLS`.
- Override rows with `TMUX_ROWS`.
- For remote projects, `tmux`/`codex`/`claude` sessions are created and attached over SSH on the remote host.
- Supports reusable project automations in `.automations/*.json` (run from the workspace "Run Automation" button).
- Exposes an MCP proxy endpoint with event + alert logging.
- Streams MCP proxy interaction logs in the workspace `LOGS` panel.

## Automations

Create JSON files in your project at `.automations/<name>.json`.

Example:

```json
{
  "name": "default-workspace",
  "sessions": [
    { "kind": "tmux" },
    { "kind": "codex" },
    { "kind": "claude" },
    { "kind": "tmux", "command": "npm run dev" }
  ]
}
```

- `sessions` must contain one or more entries.
- `kind` must be one of: `tmux`, `codex`, `claude`.
- `command` is optional; when omitted, defaults are used (`tmux` shell, `codex`, `claude`).

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:4311`.

## Environment variables

- `APROPOS_HOME` (default: `~/.apropos`)
- `PORT` (default: `4311`)
- `CODEX_MCP_URL` (default target for `/api/proxy/codex`)
- `CLAUDE_MCP_URL` (default target for `/api/proxy/claude`)

## API quick reference

- `GET /api/dashboard`
- `POST /api/projects`
- `POST /api/projects/:projectId/scaffold`
- `POST /api/projects/:projectId/mcp-tools`
- `POST /api/projects/:projectId/mcp-tools/setup`
- `POST /api/mcp/repositories`
- `POST /api/mcp/repositories/:repoId/sync`
- `POST /api/projects/:projectId/skills`
- `POST /api/projects/:projectId/sessions`
- `DELETE /api/sessions/:sessionId`
- `POST /api/proxy/:target`
- `GET /api/alerts`
- `DELETE /api/alerts/:alertId`
