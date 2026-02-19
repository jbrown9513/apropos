/**
 * Registry of agentic systems (Codex, Claude, Cursor, etc.) for project layout:
 * - Context/agents file path and default content
 * - Skills/rules directory and file pattern
 * - MCP config path and format
 *
 * Use this module instead of hardcoding paths so new systems can be added in one place.
 */

import path from 'node:path';

export const AGENT_SYSTEM_IDS = ['codex', 'claude', 'cursor'];

const DEFAULT_AGENTS_CONTENT = {
  claude: '# Claude Project Context\n\n- Add project-specific notes for Claude Code here.\n',
  cursor: '# Cursor Project Context\n\n- Add project-specific notes for Cursor here.\n'
};

/**
 * @typedef {Object} AgentsFileSpec
 * @property {string} pathInProject - Path relative to project root (e.g. 'CLAUDE.md', '.cursorrules')
 * @property {string} defaultContent
 */

/**
 * @typedef {Object} SkillsSpec
 * @property {string} dir - Dir relative to project (e.g. '.codex/skills', '.cursor/rules')
 * @property {'subdir'|'flat'} layout - 'subdir' = <dir>/<slug>/SKILL.md, 'flat' = <dir>/<slug>.md
 * @property {string} [filename] - For subdir: 'SKILL.md'; for flat: filename is <slug>.md
 */

/**
 * @typedef {Object} McpConfigSpec
 * @property {string} pathInProject
 * @property {'json'|'toml'} format
 */

/**
 * @typedef {Object} AgentSystem
 * @property {string} id
 * @property {string} label
 * @property {AgentsFileSpec|null} agentsFile
 * @property {SkillsSpec} skills
 * @property {McpConfigSpec|null} mcpConfig
 */

/** @type {Record<string, AgentSystem>} */
const SYSTEMS = {
  codex: {
    id: 'codex',
    label: 'Codex',
    agentsFile: null,
    skills: {
      dir: '.codex/skills',
      layout: 'subdir',
      filename: 'SKILL.md'
    },
    mcpConfig: {
      pathInProject: '.codex/config.toml',
      format: 'toml'
    }
  },
  claude: {
    id: 'claude',
    label: 'Claude',
    agentsFile: {
      pathInProject: 'CLAUDE.md',
      defaultContent: DEFAULT_AGENTS_CONTENT.claude
    },
    skills: {
      dir: '.claude/skills',
      layout: 'subdir',
      filename: 'SKILL.md'
    },
    mcpConfig: {
      pathInProject: '.mcp.json',
      format: 'json'
    }
  },
  cursor: {
    id: 'cursor',
    label: 'Cursor',
    agentsFile: {
      pathInProject: '.cursorrules',
      defaultContent: DEFAULT_AGENTS_CONTENT.cursor
    },
    skills: {
      dir: '.cursor/rules',
      layout: 'flat',
      filename: null
    },
    mcpConfig: {
      pathInProject: '.cursor/mcp.json',
      format: 'json'
    }
  }
};

export function getAgentSystem(id) {
  const normalized = String(id || '').trim().toLowerCase();
  return SYSTEMS[normalized] ?? null;
}

export function listAgentSystems() {
  return AGENT_SYSTEM_IDS.map((id) => SYSTEMS[id]).filter(Boolean);
}

export function agentSystemsWithAgentsFile() {
  return listAgentSystems().filter((s) => s.agentsFile != null);
}

export function agentSystemsWithMcpConfig() {
  return listAgentSystems().filter((s) => s.mcpConfig != null);
}

/**
 * Resolve full path for the agents/context file for a system.
 * @param {string} projectPath - Absolute project root path
 * @param {string} systemId - codex | claude | cursor
 * @param {boolean} [posix] - Use forward slashes (for SSH/remote)
 * @returns {string|null}
 */
export function agentsFilePath(projectPath, systemId, posix = false) {
  const system = getAgentSystem(systemId);
  if (!system?.agentsFile) {
    return null;
  }
  const sep = posix ? '/' : path.sep;
  const rel = system.agentsFile.pathInProject.replace(/\//g, sep);
  return `${projectPath}${sep}${rel}`;
}

/**
 * Resolve full path for a skill/rule file.
 * @param {string} projectPath
 * @param {string} systemId
 * @param {string} slug
 * @param {boolean} [posix]
 * @returns {string}
 */
export function skillFilePath(projectPath, systemId, slug, posix = false) {
  const system = getAgentSystem(systemId);
  if (!system) {
    return '';
  }
  const sep = posix ? '/' : path.sep;
  const dir = system.skills.dir.replace(/\//g, sep);
  const base = `${projectPath}${sep}${dir}`;
  if (system.skills.layout === 'subdir' && system.skills.filename) {
    return `${base}${sep}${slug}${sep}${system.skills.filename}`;
  }
  return `${base}${sep}${slug}.md`;
}

/**
 * Resolve full path for MCP config file.
 * @param {string} projectPath
 * @param {string} systemId
 * @param {boolean} [posix]
 * @returns {string|null}
 */
export function mcpConfigPath(projectPath, systemId, posix = false) {
  const system = getAgentSystem(systemId);
  if (!system?.mcpConfig) {
    return null;
  }
  const sep = posix ? '/' : path.sep;
  const rel = system.mcpConfig.pathInProject.replace(/\//g, sep);
  return `${projectPath}${sep}${rel}`;
}

/**
 * Resolve full path for the skills/rules directory (for listing).
 * @param {string} projectPath
 * @param {string} systemId
 * @param {boolean} [posix]
 * @returns {string}
 */
export function skillDirPath(projectPath, systemId, posix = false) {
  const system = getAgentSystem(systemId);
  if (!system) {
    return projectPath;
  }
  const sep = posix ? '/' : path.sep;
  const dir = system.skills.dir.replace(/\//g, sep);
  return `${projectPath}${sep}${dir}`;
}

/**
 * Valid skill target for writeSkill / API (codex, claude, cursor).
 */
export function isValidSkillTarget(target) {
  const t = String(target || '').trim().toLowerCase();
  return AGENT_SYSTEM_IDS.includes(t);
}

/**
 * Valid agent id for editor/agents API (systems that have an agents file: claude, cursor).
 */
export function isValidAgentsSystemId(agentId) {
  const system = getAgentSystem(agentId);
  return system != null && system.agentsFile != null;
}
