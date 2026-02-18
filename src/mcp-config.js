import fs from 'node:fs/promises';
import path from 'node:path';

function tomlString(value) {
  return JSON.stringify(String(value));
}

function tomlArray(values) {
  return `[${values.map((value) => tomlString(value)).join(', ')}]`;
}

export async function writeClaudeMcpConfig(projectPath, tools) {
  const claudeConfigPath = path.join(projectPath, '.mcp.json');
  const payload = {
    mcpServers: {}
  };

  for (const tool of tools) {
    payload.mcpServers[tool.id] = {
      command: tool.command,
      args: tool.args || []
    };
  }

  await fs.writeFile(claudeConfigPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return claudeConfigPath;
}

export async function writeCodexMcpConfig(projectPath, tools) {
  const codexDir = path.join(projectPath, '.codex');
  await fs.mkdir(codexDir, { recursive: true });

  const lines = [];
  lines.push('# Managed by apropos.');
  lines.push('# Add custom MCP entries below if needed.');

  for (const tool of tools) {
    lines.push('');
    lines.push(`[mcp_servers.${tool.id}]`);
    lines.push(`command = ${tomlString(tool.command)}`);
    lines.push(`args = ${tomlArray(tool.args || [])}`);
  }

  const codexConfigPath = path.join(codexDir, 'config.toml');
  await fs.writeFile(codexConfigPath, lines.join('\n') + '\n', 'utf8');
  return codexConfigPath;
}
