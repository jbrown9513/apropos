import fs from 'node:fs/promises';
import path from 'node:path';
import { AGENT_SYSTEM_IDS, skillDirPath } from './agent-systems.js';

function unique(items) {
  return [...new Set(items)];
}

function parseTomlMcpIds(content) {
  const ids = [];
  const pattern = /^\s*\[mcp_servers\.([^\]]+)\]\s*$/gm;
  let match = pattern.exec(content);
  while (match) {
    ids.push(match[1].trim());
    match = pattern.exec(content);
  }
  return ids;
}

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readText(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function listDirectories(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** List .md file basenames without extension in a dir (for Cursor flat rules). */
async function listRuleSlugsInDir(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
      .map((entry) => entry.name.slice(0, -3));
  } catch {
    return [];
  }
}

async function listDocEntries(projectPath) {
  const docsDir = path.join(projectPath, 'docs');
  try {
    const entries = await fs.readdir(docsDir, { withFileTypes: true });
    return {
      exists: true,
      entries: entries.slice(0, 12).map((entry) => ({
        name: entry.name,
        kind: entry.isDirectory() ? 'dir' : 'file'
      }))
    };
  } catch {
    return {
      exists: false,
      entries: []
    };
  }
}

async function inspectAgents(projectPath) {
  const agentsPath = path.join(projectPath, 'AGENTS.md');
  try {
    const stat = await fs.lstat(agentsPath);
    if (!stat.isSymbolicLink()) {
      return {
        exists: true,
        isSymlink: false,
        symlinkTarget: null,
        healthy: true
      };
    }
    const link = await fs.readlink(agentsPath);
    const claudePath = path.join(projectPath, 'CLAUDE.md');
    const resolved = path.resolve(projectPath, link);
    const healthy = link === 'CLAUDE.md' || resolved === claudePath;
    return {
      exists: true,
      isSymlink: true,
      symlinkTarget: link,
      healthy
    };
  } catch {
    return {
      exists: false,
      isSymlink: false,
      symlinkTarget: null,
      healthy: false
    };
  }
}

function toolFromCatalog(catalog, toolId) {
  return catalog.find((item) => item.id === toolId) || null;
}

export async function inspectProjectConfiguration(project, catalog) {
  const projectPath = project.path;
  if (project.sshHost) {
    return {
      mcpTools: project.mcpTools || [],
      skills: project.skills || [],
      structure: {
        docsDir: path.posix.join(projectPath, 'docs'),
        docsExists: true,
        docsEntries: [],
        agents: {
          exists: true,
          isSymlink: true,
          symlinkTarget: 'CLAUDE.md',
          healthy: Boolean(project.agentsSymlinkOk)
        }
      }
    };
  }
  const discoveredMcpIds = [];

  const claudeConfigPath = path.join(projectPath, '.mcp.json');
  const claudeConfig = await readJson(claudeConfigPath);
  if (claudeConfig?.mcpServers && typeof claudeConfig.mcpServers === 'object') {
    discoveredMcpIds.push(...Object.keys(claudeConfig.mcpServers));
  }

  const codexConfigPath = path.join(projectPath, '.codex', 'config.toml');
  const codexConfigRaw = await readText(codexConfigPath);
  if (codexConfigRaw) {
    discoveredMcpIds.push(...parseTomlMcpIds(codexConfigRaw));
  }

  const cursorConfigPath = path.join(projectPath, '.cursor', 'mcp.json');
  const cursorConfig = await readJson(cursorConfigPath);
  if (cursorConfig?.mcpServers && typeof cursorConfig.mcpServers === 'object') {
    discoveredMcpIds.push(...Object.keys(cursorConfig.mcpServers));
  }

  const storedMcpIds = (project.mcpTools || []).map((tool) => tool.id);
  const mcpIds = unique([...storedMcpIds, ...discoveredMcpIds]);
  const mcpTools = mcpIds.map((toolId) => {
    const fromStore = (project.mcpTools || []).find((item) => item.id === toolId);
    if (fromStore) {
      return fromStore;
    }
    const fromCatalog = toolFromCatalog(catalog, toolId);
    if (fromCatalog) {
      return fromCatalog;
    }
    return {
      id: toolId,
      name: toolId,
      command: 'unknown',
      args: [],
      description: 'Discovered from existing project config.'
    };
  });

  const skillsBySystem = {};
  skillsBySystem.codex = await listDirectories(path.join(projectPath, '.codex', 'skills'));
  skillsBySystem.claude = await listDirectories(path.join(projectPath, '.claude', 'skills'));
  skillsBySystem.cursor = await listRuleSlugsInDir(skillDirPath(projectPath, 'cursor', false));

  const storedSkills = project.skills || [];
  const storedById = new Map(storedSkills.map((item) => [item.id, item]));
  const allDiscovered = [
    ...skillsBySystem.codex,
    ...skillsBySystem.claude,
    ...skillsBySystem.cursor
  ];
  const discoveredSkillIds = unique([...storedSkills.map((item) => item.id), ...allDiscovered]);

  const skills = discoveredSkillIds.map((skillId) => {
    let inferredTarget = 'codex';
    if (skillsBySystem.codex.includes(skillId)) {
      inferredTarget = 'codex';
    } else if (skillsBySystem.claude.includes(skillId)) {
      inferredTarget = 'claude';
    } else if (skillsBySystem.cursor.includes(skillId)) {
      inferredTarget = 'cursor';
    }
    const stored = storedById.get(skillId);
    if (stored) {
      const storedTarget = String(stored.target || '').trim().toLowerCase();
      const normalizedTarget = AGENT_SYSTEM_IDS.includes(storedTarget) ? storedTarget : inferredTarget;
      return {
        ...stored,
        target: normalizedTarget
      };
    }
    return {
      id: skillId,
      name: skillId,
      target: inferredTarget,
      createdAt: null
    };
  });

  const { exists: docsExists, entries: docsEntries } = await listDocEntries(projectPath);
  const agents = await inspectAgents(projectPath);

  const cursorRulesPath = path.join(projectPath, '.cursorrules');
  let cursorAgentsExists = false;
  try {
    await fs.access(cursorRulesPath);
    cursorAgentsExists = true;
  } catch {
    // .cursorrules not present
  }

  return {
    mcpTools,
    skills,
    structure: {
      docsDir: path.join(projectPath, 'docs'),
      docsExists,
      docsEntries,
      agents,
      cursorAgents: { exists: cursorAgentsExists }
    }
  };
}
