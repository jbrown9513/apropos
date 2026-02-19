# MCP Config Local Source Option

The MCP configuration command now supports two source modes:

- GitHub repo URL (existing behavior)
- Local project MCP (new behavior)

When `Local project MCP` is selected, Apropos no longer requires a remote GitHub URL. Instead, it starts a Codex session that uses the `setup-mcp-proxy` skill with project context so the agent can:

- find an MCP server already present in the local project,
- configure `.mcp.json` and `.codex/config.toml`, and
- route usage through the Apropos MCP proxy endpoints.

This was added because some projects already contain local MCP servers and only need AI-driven configuration in the project MCP cache/config path, not repository cloning or GitHub setup.
