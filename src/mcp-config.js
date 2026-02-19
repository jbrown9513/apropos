import fs from 'node:fs/promises';
import path from 'node:path';
import { mcpConfigPath } from './agent-systems.js';

function tomlString(value) {
  return JSON.stringify(String(value));
}

function tomlArray(values) {
  return `[${values.map((value) => tomlString(value)).join(', ')}]`;
}

function buildJsonMcpPayload(tools) {
  const payload = { mcpServers: {} };
  for (const tool of tools) {
    payload.mcpServers[tool.id] = {
      command: tool.command,
      args: tool.args || []
    };
  }
  return payload;
}

export async function writeClaudeMcpConfig(projectPath, tools) {
  const claudeConfigPath = path.join(projectPath, '.mcp.json');
  const payload = buildJsonMcpPayload(tools);
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

/**
 * Write Cursor project MCP config (.cursor/mcp.json). Same JSON shape as Claude's .mcp.json.
 */
export async function writeCursorMcpConfig(projectPath, tools) {
  const cursorConfigPath = mcpConfigPath(projectPath, 'cursor', false);
  if (!cursorConfigPath) {
    return null;
  }
  await fs.mkdir(path.dirname(cursorConfigPath), { recursive: true });
  const payload = buildJsonMcpPayload(tools);
  await fs.writeFile(cursorConfigPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return cursorConfigPath;
}

/**
 * Write MCP config for all agent systems that support it (codex, claude, cursor).
 */
export async function writeMcpConfigForAllSystems(projectPath, tools) {
  const written = [];
  await writeClaudeMcpConfig(projectPath, tools);
  written.push(path.join(projectPath, '.mcp.json'));
  const codexPath = await writeCodexMcpConfig(projectPath, tools);
  written.push(codexPath);
  const cursorPath = await writeCursorMcpConfig(projectPath, tools);
  if (cursorPath) {
    written.push(cursorPath);
  }
  return written;
}
