import express from 'express';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { DEFAULT_PORT, APROPOS_HOME } from './constants.js';
import { trackAlert, trackEvent, getAlerts, getEvents, dismissAlert, dismissAlertsForProject, subscribeEvents, clearEvents, clearAlerts } from './events.js';
import { writeMcpConfigForAllSystems } from './mcp-config.js';
import { isValidSkillTarget, isValidAgentsSystemId, agentsFilePath, skillFilePath, skillDirPath, getAgentSystem, AGENT_SYSTEM_IDS } from './agent-systems.js';
import { ensureProjectLayout } from './project-scaffold.js';
import { inspectProjectConfiguration } from './project-inspector.js';
import { createGitWorktree, detectIsGitRepo as detectIsGitRepoPlugin, listGitRefs, listGitWorktrees, runGitForProject as runGitForProjectPlugin, runGitLocal } from './plugins/git.js';
import { proxyMcpRequest } from './proxy.js';
import { spawnSession, listSessions, refreshSessions, setSessionLastInput, stopSession, stopSessionsForProject } from './sessions.js';
import { clearProjectMemories, listProjectMemories, removeProjectMemory, updateProjectMemory } from './memory.js';
import { createMemoryEngine } from './memory-engine.js';
import { createVectorAdapter } from './vector-store.js';
import {
  addProject,
  currentState,
  clearEventLog,
  getProject,
  loadState,
  removeProject,
  sanitizeProject,
  updateSettings,
  updateFolderState,
  updateSessionTileSizes,
  updateProject
} from './store.js';
import { writeSkill } from './skills.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');
const TMUX_BIN = process.env.TMUX_BIN || '/opt/homebrew/bin/tmux';
const REMOTE_TMUX_CANDIDATES = [
  process.env.TMUX_BIN_REMOTE,
  process.env.TMUX_BIN,
  '/opt/homebrew/bin/tmux',
  '/usr/local/bin/tmux',
  '/usr/bin/tmux'
].filter(Boolean);
const SSH_SHARED_ARGS = [
  '-o', 'ControlMaster=auto',
  '-o', 'ControlPersist=10m',
  '-o', 'ControlPath=/tmp/apropos-ssh-%C',
  '-o', 'ConnectTimeout=8',
  '-o', 'ServerAliveInterval=20',
  '-o', 'ServerAliveCountMax=3'
];
const AGENT_SESSION_KINDS = new Set(['codex', 'claude', 'cursor', 'opencode']);
const AGENT_IDLE_MS = 2600;
const REMOTE_AGENT_POLL_INTERVAL_MS = 7000;
const TERMINAL_INITIAL_SCROLLBACK_LINES = 20000;
const TMUX_HISTORY_LIMIT_LINES = 50000;
const DRAFT_MCP_SERVER_SKILL = {
  name: 'draft mcp server',
  target: 'codex',
  content: `---
name: draft-mcp-server
description: "Draft a new MCP server in the user-owned MCP GitHub repository."
---

# Draft MCP Server

Use this skill when a user wants to create a new MCP server in a project-scoped MCP repository.

## Goals

1. Pick the target MCP repository from this project's configured GitHub repos.
2. Draft a new MCP server scaffold with practical defaults.
3. Add or update MCP catalog metadata so Apropos can discover it.
4. Keep changes scoped to the selected repository clone under \`~/.apropos/<project-id>/mcp/<repo-id>\`.
`
};
const SETUP_MCP_PROXY_SKILL = {
  name: 'setup mcp proxy',
  target: 'codex',
  content: `---
name: setup-mcp-proxy
description: "Configure project MCP tools to route through Apropos observability proxy."
---

# Setup MCP Proxy

Use this skill when a user wants an MCP configured in this project with Apropos proxy visibility.

## Goals

1. Ensure MCP tool config is present in:
- \`.mcp.json\` for Claude
- \`.codex/config.toml\` for Codex
2. Route MCP interactions through:
- \`http://127.0.0.1:4311/api/projects/<project-id>/proxy/codex\`
- \`http://127.0.0.1:4311/api/projects/<project-id>/proxy/claude\`
3. Verify basic connectivity and report changes.
`
};
const DEFAULT_PROJECT_SKILLS = [
  {
    name: 'write automations',
    target: 'codex',
    content: `---
name: write-automations
description: "Create and update .automations JSON workflows for Apropos."
---

# Write Automations

Use this skill when a user asks to create or edit project automations.

## Goal

Create JSON automation files in \`.automations/\` that Apropos can run.

## File format

Each automation file must be valid JSON with:
- \`name\`: string
- \`sessions\`: array with at least one item

Each session item supports:
- \`kind\`: one of \`tmux\`, \`codex\`, \`claude\`, \`cursor\`, \`opencode\`
- \`command\`: optional string

## Steps

1. Ask for the workflow intent if unclear.
2. Propose a short automation file name (kebab-case).
3. Build a valid JSON payload with practical session order.
4. Save the file under \`.automations/<name>.json\`.
5. Validate JSON syntax before finishing.

## Example

\`\`\`json
{
  "name": "default-workspace",
  "sessions": [
    { "kind": "tmux" },
    { "kind": "codex" },
    { "kind": "claude" },
    { "kind": "cursor" },
    { "kind": "opencode" },
    { "kind": "tmux", "command": "npm run dev" }
  ]
}
\`\`\`
`
  },
  {
    ...SETUP_MCP_PROXY_SKILL
  },
  DRAFT_MCP_SERVER_SKILL
];
const require = createRequire(import.meta.url);
let ptyModule = null;
try {
  ptyModule = require('node-pty');
} catch {
  ptyModule = null;
}
const agentQuestionState = new Map();
const sessionInputBuffers = new Map();
const vectorAdapter = createVectorAdapter();
const memoryEngine = createMemoryEngine({
  getSettings: () => currentState().settings?.memory || {},
  vectorAdapter,
  onIngested: async ({ memory }) => {
    const project = getProject(memory.projectId);
    await trackEvent('memory.saved', {
      projectId: memory.projectId,
      projectName: project?.name || '',
      memoryId: memory.id,
      type: memory.type,
      source: memory.source,
      agentKind: memory.agentKind,
      sessionId: memory.sessionId
    });
  },
  onError: async (error, input) => {
    await trackAlert('memory.ingest_failed', {
      projectId: String(input?.projectId || '').trim() || null,
      source: String(input?.source || '').trim() || null,
      error: error.message
    }, 'warning');
  }
});

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  if (req.path === '/' || req.path.startsWith('/app.js') || req.path.startsWith('/styles.css')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});
app.use(express.static(publicDir));

function basenameFromPath(rawPath) {
  const normalized = String(rawPath || '').replace(/[\\/]+$/, '');
  return path.basename(normalized);
}

function slugifySkillName(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'skill';
}

async function listDocsFilesRecursive(rootPath) {
  const files = [];
  const queue = [''];
  while (queue.length && files.length < 500) {
    const relDir = queue.shift();
    const absDir = path.join(rootPath, relDir);
    let entries = [];
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relPath = relDir ? path.posix.join(relDir, entry.name) : entry.name;
      if (entry.isDirectory()) {
        queue.push(relPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      files.push(relPath);
      if (files.length >= 500) {
        break;
      }
    }
  }
  return files;
}

function pickDirectoryMacOs() {
  const script = 'POSIX path of (choose folder with prompt "Select project directory")';
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function slugifyRepoId(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/^git@github\.com:/, '')
    .replace(/^ssh:\/\/git@github\.com\//, '')
    .replace(/^https?:\/\//, '')
    .replace(/^github\.com\//, '')
    .replace(/\.git$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'mcp-repo';
}

function mcpProjectRoot(projectId) {
  return path.join(APROPOS_HOME, projectId);
}

function mcpCloneRootForProject(projectId) {
  return path.join(mcpProjectRoot(projectId), 'mcp');
}

function worktreeRootForProject(projectId) {
  return path.join(mcpProjectRoot(projectId), 'worktrees');
}

async function resolveWorktreeRootForProject(project) {
  if (!project?.sshHost) {
    return worktreeRootForProject(project.id);
  }
  const remoteHome = String(await runSsh(project.sshHost, 'printf %s "$HOME"')).trim();
  const home = remoteHome || '$HOME';
  return path.posix.join(home, '.apropos', project.id, 'worktrees');
}

function mcpRepoCloneDir(projectId, repoId) {
  return path.join(mcpCloneRootForProject(projectId), repoId);
}

function normalizeProjectMcpRepositories(project) {
  const repositories = Array.isArray(project?.mcpRepositories) ? project.mcpRepositories : [];
  return repositories
    .map((item) => {
      const id = String(item?.id || '').trim();
      const gitUrl = String(item?.gitUrl || item?.repo || '').trim();
      if (!id || !gitUrl) {
        return null;
      }
      const tools = Array.isArray(item?.tools)
        ? item.tools.map((tool) => normalizeCatalogTool(tool, gitUrl)).filter(Boolean)
        : [];
      return {
        id,
        name: String(item?.name || id).trim() || id,
        gitUrl,
        tools
      };
    })
    .filter(Boolean);
}

function buildMcpCatalogForProject(project) {
  const repositories = normalizeProjectMcpRepositories(project);
  const byId = new Map();
  for (const repository of repositories) {
    for (const tool of repository.tools || []) {
      const normalized = normalizeCatalogTool({
        ...tool,
        repo: tool?.repo || repository.gitUrl
      }, repository.gitUrl);
      if (!normalized || byId.has(normalized.id)) {
        continue;
      }
      byId.set(normalized.id, normalized);
    }
  }
  return [...byId.values()];
}

function findProjectCatalogTool(project, toolId) {
  const normalizedToolId = String(toolId || '').trim();
  return buildMcpCatalogForProject(project).find((item) => item.id === normalizedToolId) || null;
}

async function resolveWritableProjectMcpTools(project) {
  const stored = Array.isArray(project?.mcpTools)
    ? project.mcpTools.filter((tool) => String(tool?.id || '').trim() && String(tool?.command || '').trim())
    : [];
  if (stored.length) {
    return stored;
  }
  const catalog = buildMcpCatalogForProject(project);
  const inspected = await inspectProjectConfiguration(project, catalog);
  return (inspected.mcpTools || [])
    .filter((tool) => String(tool?.id || '').trim() && String(tool?.command || '').trim() && tool.command !== 'unknown');
}

function getMcpCatalog(project = null) {
  if (project) {
    return buildMcpCatalogForProject(project);
  }
  const byId = new Map();
  for (const currentProject of currentState().projects || []) {
    for (const tool of buildMcpCatalogForProject(currentProject)) {
      if (!byId.has(tool.id)) {
        byId.set(tool.id, tool);
      }
    }
  }
  return [...byId.values()];
}

function isGithubRepoUrl(gitUrl) {
  const normalized = String(gitUrl || '').trim();
  const httpsPattern = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+(?:\.git)?$/i;
  const sshPattern = /^(git@github\.com:|ssh:\/\/git@github\.com\/)[^/\s]+\/[^/\s]+(?:\.git)?$/i;
  return httpsPattern.test(normalized) || sshPattern.test(normalized);
}

function isGithubPushUrl(gitUrl) {
  const normalized = String(gitUrl || '').trim();
  const sshPattern = /^(git@github\.com:|ssh:\/\/git@github\.com\/)[^/\s]+\/[^/\s]+(?:\.git)?$/i;
  return sshPattern.test(normalized);
}

function validateMcpRepoGitUrl(gitUrl) {
  if (!isGithubRepoUrl(gitUrl)) {
    throw new Error('Repository URL must be a GitHub repo URL.');
  }
  if (!isGithubPushUrl(gitUrl)) {
    throw new Error('Use a GitHub SSH URL with push access (for example: git@github.com:owner/repo.git).');
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJsonFileIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function normalizeCatalogTool(tool, fallbackRepo) {
  const id = String(tool?.id || '').trim();
  const command = String(tool?.command || '').trim();
  if (!id || !command) {
    return null;
  }
  return {
    id,
    name: String(tool?.name || id).trim() || id,
    repo: String(tool?.repo || fallbackRepo || '').trim(),
    command,
    args: Array.isArray(tool?.args) ? tool.args.map((arg) => String(arg)) : [],
    description: String(tool?.description || '').trim()
  };
}

async function parseCatalogFromRepository(repoPath, fallbackRepoUrl) {
  const candidates = [
    'apropos.mcp.json',
    'mcp-catalog.json',
    '.apropos/mcp-catalog.json'
  ];
  for (const relativePath of candidates) {
    const payload = await readJsonFileIfExists(path.join(repoPath, relativePath));
    if (!payload) {
      continue;
    }
    const tools = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.tools)
        ? payload.tools
        : [];
    const normalized = tools.map((item) => normalizeCatalogTool(item, fallbackRepoUrl)).filter(Boolean);
    if (normalized.length) {
      return normalized;
    }
  }

  const packageJson = await readJsonFileIfExists(path.join(repoPath, 'package.json'));
  const packageName = String(packageJson?.name || '').trim();
  if (packageName && packageName.includes('server')) {
    const repoName = packageName.split('/').pop() || packageName;
    return [{
      id: repoName.replace(/^server-/, ''),
      name: repoName,
      repo: fallbackRepoUrl,
      command: 'npx',
      args: ['-y', packageName],
      description: `MCP server from ${packageName}`
    }];
  }
  return [];
}

async function syncMcpRepository(project, gitUrl, repoId) {
  const cloneRoot = mcpCloneRootForProject(project.id);
  await ensureDir(cloneRoot);
  const repoPath = mcpRepoCloneDir(project.id, repoId);
  let exists = false;
  try {
    const stat = await fs.stat(path.join(repoPath, '.git'));
    exists = stat.isDirectory();
  } catch {
    exists = false;
  }

  if (!exists) {
    await runGitLocal(['clone', '--depth', '1', gitUrl, repoPath], process.cwd());
  } else {
    await runGitLocal(['-C', repoPath, 'pull', '--ff-only'], process.cwd());
  }
  const tools = await parseCatalogFromRepository(repoPath, gitUrl);
  return { repoPath, tools };
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function splitInputChunks(data) {
  const chunks = [];
  let buffer = '';
  const flushBuffer = () => {
    if (!buffer) {
      return;
    }
    chunks.push({ type: 'text', value: buffer });
    buffer = '';
  };

  const arrowKeyFromSequence = (sequence) => {
    if (sequence === '\u001b[A' || sequence === '\u001bOA') {
      return 'Up';
    }
    if (sequence === '\u001b[B' || sequence === '\u001bOB') {
      return 'Down';
    }
    if (sequence === '\u001b[C' || sequence === '\u001bOC') {
      return 'Right';
    }
    if (sequence === '\u001b[D' || sequence === '\u001bOD') {
      return 'Left';
    }
    return null;
  };

  for (let index = 0; index < data.length; index += 1) {
    const char = data[index];
    if (char === '\u001b') {
      const two = data.slice(index, index + 2);
      const three = data.slice(index, index + 3);
      const keyThree = arrowKeyFromSequence(three);
      if (keyThree) {
        flushBuffer();
        chunks.push({ type: 'key', value: keyThree });
        index += 2;
        continue;
      }
      const keyTwo = arrowKeyFromSequence(two);
      if (keyTwo) {
        flushBuffer();
        chunks.push({ type: 'key', value: keyTwo });
        index += 1;
        continue;
      }
    }

    if (char === '\r' || char === '\n') {
      flushBuffer();
      chunks.push({ type: 'enter' });
      continue;
    }
    if (char === '\u001b') {
      buffer += char;
      continue;
    }
    if (char === '\t') {
      buffer += '  ';
      continue;
    }
    if (char === '\u007f') {
      flushBuffer();
      chunks.push({ type: 'backspace' });
      continue;
    }
    if (char >= ' ') {
      buffer += char;
    }
  }
  flushBuffer();
  return chunks;
}

function sanitizeCommittedInput(value) {
  return String(value || '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, ' ')
    .replace(/\x1bP[\s\S]*?\x1b\\/g, ' ')
    .replace(/\x1b\^[\s\S]*?\x1b\\/g, ' ')
    .replace(/\x1b_[\s\S]*?\x1b\\/g, ' ')
    // Match full CSI sequences, including private-mode parameters like ESC[>0;276;0c.
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, ' ')
    .replace(/\x1b[@-Z\\-_]/g, ' ')
    .replace(/\[(?:200|201)~/g, ' ')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ingestSessionInput(sessionId, rawInput) {
  const chunks = splitInputChunks(String(rawInput || ''));
  let buffer = sessionInputBuffers.get(sessionId) || '';
  let committed = null;
  for (const chunk of chunks) {
    if (chunk.type === 'text') {
      buffer += chunk.value;
      continue;
    }
    if (chunk.type === 'backspace') {
      buffer = buffer.slice(0, -1);
      continue;
    }
    if (chunk.type === 'enter') {
      committed = sanitizeCommittedInput(buffer);
      buffer = '';
    }
  }
  sessionInputBuffers.set(sessionId, buffer);
  return committed;
}

function shellQuote(value) {
  return `'${String(value ?? '').replace(/'/g, `'\\''`)}'`;
}

function buildRemoteTmuxCommand(args) {
  const argsQuoted = args.map((arg) => shellQuote(arg)).join(' ');
  const candidates = REMOTE_TMUX_CANDIDATES.map((candidate) => shellQuote(candidate)).join(' ');
  return [
    "tmux_bin=\"$(command -v tmux 2>/dev/null || true)\"",
    'if [ -z "$tmux_bin" ]; then',
    `  for candidate in ${candidates}; do`,
    '    if [ -x "$candidate" ]; then tmux_bin="$candidate"; break; fi',
    '  done',
    'fi',
    'if [ -z "$tmux_bin" ]; then',
    '  echo "tmux not found on remote host PATH. Install tmux or set TMUX_BIN_REMOTE." >&2',
    '  exit 127',
    'fi',
    `"$tmux_bin" ${argsQuoted}`
  ].join('; ');
}

function runSsh(sshHost, command) {
  return new Promise((resolve, reject) => {
    execFile('ssh', [...SSH_SHARED_ARGS, sshHost, command], (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function runGitForProject(project, args) {
  return runGitForProjectPlugin(project, args, { runRemote: runSsh });
}

function parseGitStatusPorcelain(rawOutput) {
  const lines = String(rawOutput || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);

  const entries = [];
  for (const line of lines) {
    if (line.length < 4) {
      continue;
    }
    const code = line.slice(0, 2);
    const indexStatus = code[0] || ' ';
    const worktreeStatus = code[1] || ' ';
    const rest = line.slice(3);
    if (!rest) {
      continue;
    }

    let filePath = rest;
    let previousPath = null;
    if (rest.includes(' -> ')) {
      const [fromPath, toPath] = rest.split(' -> ');
      previousPath = String(fromPath || '').trim() || null;
      filePath = String(toPath || '').trim();
    }

    const isConflict = indexStatus === 'U' || worktreeStatus === 'U' || code === 'AA' || code === 'DD';
    const isUntracked = code === '??';
    const hasStaged = !isUntracked && indexStatus !== ' ';
    const hasUnstaged = !isUntracked && worktreeStatus !== ' ';
    let group = 'other';
    let groupRank = 4;
    if (isConflict) {
      group = 'conflict';
      groupRank = 1;
    } else if (hasStaged) {
      group = 'staged';
      groupRank = 2;
    } else if (hasUnstaged) {
      group = 'unstaged';
      groupRank = 3;
    } else if (isUntracked) {
      group = 'untracked';
      groupRank = 4;
    }

    entries.push({
      code,
      indexStatus,
      worktreeStatus,
      path: filePath,
      previousPath,
      group,
      groupRank
    });
  }

  entries.sort((a, b) => {
    if (a.groupRank !== b.groupRank) {
      return a.groupRank - b.groupRank;
    }
    return String(a.path || '').localeCompare(String(b.path || ''));
  });

  return entries.map((entry, idx) => ({
    order: idx + 1,
    code: entry.code,
    indexStatus: entry.indexStatus,
    worktreeStatus: entry.worktreeStatus,
    group: entry.group,
    path: entry.path,
    previousPath: entry.previousPath
  }));
}

function execTmuxForSession(session, args, callback) {
  if (session.sshHost) {
    const command = buildRemoteTmuxCommand(args);
    execFile('ssh', [...SSH_SHARED_ARGS, session.sshHost, command], callback);
    return;
  }
  execFile(TMUX_BIN, args, callback);
}

function runTmuxForSession(session, args) {
  return new Promise((resolve, reject) => {
    execTmuxForSession(session, args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(String(stdout || '').trim());
    });
  });
}

function applyTmuxScroll(session, rawLines) {
  const lines = Math.trunc(Number(rawLines || 0));
  if (!Number.isFinite(lines) || lines === 0) {
    return;
  }
  const steps = Math.min(120, Math.max(1, Math.abs(lines)));
  const direction = lines < 0 ? 'scroll-up' : 'scroll-down';
  // Enter copy mode before scrolling through pane history.
  execTmuxForSession(session, ['copy-mode', '-t', session.tmuxName], () => {
    execTmuxForSession(
      session,
      ['send-keys', '-t', session.tmuxName, '-X', '-N', String(steps), direction],
      () => {}
    );
  });
}

function projectSkillFile(project, orchestrator, slug) {
  return skillFilePath(project.path, orchestrator, slug, Boolean(project.sshHost));
}

function buildSkillPreloadCommand(slug) {
  return `$${slug}`;
}

function buildNewSkillBuilderPrompt({ project, orchestrator, skillName = '', skillFile = '' }) {
  if (skillName && skillFile) {
    return [
      `Create a new ${orchestrator} skill named "${skillName}".`,
      `Write it to ${skillFile}.`,
      `Use your ${orchestrator} skill-builder workflow and produce a complete SKILL.md.`,
      `Only write project-local files under ${project.path}; do not edit global skills.`
    ].join(' ');
  }
  const skillPathHint = skillFilePath(project.path, orchestrator, '$skill-name', Boolean(project.sshHost))
    || `${project.path}/.codex/skills/$skill-name/SKILL.md`;
  return [
    `Create a new ${orchestrator} skill.`,
    `Choose a slug for the skill and write to ${skillPathHint}.`,
    `Use your ${orchestrator} skill-builder workflow and produce a complete skill/rule file.`,
    `Only write project-local files under ${project.path}; do not edit global skills.`
  ].join(' ');
}

function automationDirForProject(project) {
  if (project.sshHost) {
    return path.posix.join(project.path, '.automations');
  }
  return path.join(project.path, '.automations');
}

function isSafeAutomationId(automationId) {
  return /^[A-Za-z0-9._-]+\.json$/.test(String(automationId || '').trim());
}

async function listAutomationIds(project) {
  const dirPath = automationDirForProject(project);
  if (project.sshHost) {
    const command = [
      `if [ -d ${shellQuote(dirPath)} ]; then`,
      `for f in ${shellQuote(dirPath)}/*.json; do`,
      '[ -f "$f" ] || continue;',
      'basename "$f";',
      'done;',
      'fi'
    ].join(' ');
    const output = await runSsh(project.sshHost, command).catch(() => '');
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && isSafeAutomationId(line))
      .sort((a, b) => a.localeCompare(b));
  }

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && isSafeAutomationId(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

async function readAutomationRaw(project, automationId) {
  if (!isSafeAutomationId(automationId)) {
    throw new Error('Invalid automation id');
  }

  const dirPath = automationDirForProject(project);
  if (project.sshHost) {
    const filePath = path.posix.join(dirPath, automationId);
    return runSsh(project.sshHost, `cat ${shellQuote(filePath)}`);
  }

  const filePath = path.resolve(dirPath, automationId);
  const resolvedDir = path.resolve(dirPath);
  if (!(filePath === resolvedDir || filePath.startsWith(`${resolvedDir}${path.sep}`))) {
    throw new Error('Invalid automation path');
  }
  return fs.readFile(filePath, 'utf8');
}

function parseAutomationPayload(raw, fallbackName) {
  const payload = safeJsonParse(String(raw || ''));
  if (!payload || typeof payload !== 'object') {
    throw new Error('Automation file must be valid JSON');
  }

  const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
  if (!sessions.length) {
    throw new Error('Automation requires sessions[]');
  }

  const normalizedSessions = sessions.map((session, index) => {
    const kind = String(session?.kind || '').trim();
    const command = session?.command === undefined ? undefined : String(session.command);
    if (!['tmux', 'codex', 'claude', 'cursor', 'opencode'].includes(kind)) {
      throw new Error(`sessions[${index}].kind must be tmux, codex, claude, cursor, or opencode`);
    }
    return {
      kind,
      command
    };
  });

  return {
    name: String(payload.name || fallbackName || 'automation').trim(),
    sessions: normalizedSessions
  };
}

function stripAnsi(raw) {
  return String(raw || '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

function normalizePaneText(raw) {
  return stripAnsi(raw)
    .replace(/\r/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .trim();
}

function ensureAgentState(sessionId) {
  const existing = agentQuestionState.get(sessionId);
  if (existing) {
    return existing;
  }
  const created = {
    tail: '',
    lastSignature: '',
    lastInputAtMs: 0,
    lastNotifiedInputAtMs: 0,
    lastProgressMemoryAtMs: 0,
    lastProgressFingerprint: '',
    lastPaneFingerprint: '',
    lastPaneChangedAtMs: 0,
    lastRemotePollAtMs: 0
  };
  agentQuestionState.set(sessionId, created);
  return created;
}

function extractAgentQuestion(text) {
  const cleaned = normalizePaneText(text);
  const lines = cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-14);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line.length < 8 || line.length > 260) {
      continue;
    }
    if (!line.endsWith('?')) {
      continue;
    }
    if (/^[>$#%]/.test(line)) {
      continue;
    }
    return line;
  }
  return null;
}

function maybeTrackAgentQuestion(session, outputText) {
  if (!session || !AGENT_SESSION_KINDS.has(session.kind)) {
    return;
  }

  const previous = ensureAgentState(session.id);
  const merged = `${previous.tail}\n${String(outputText || '')}`.slice(-8000);
  const question = extractAgentQuestion(merged);
  const nextState = previous;
  nextState.tail = merged.slice(-2500);
  if (!question) {
    return;
  }

  const signature = `${session.id}|${question}`;
  if (signature === previous.lastSignature) {
    return;
  }

  nextState.lastSignature = signature;

  trackAlert('session.agent_question', {
    projectId: session.projectId,
    projectName: session.projectName,
    sessionId: session.id,
    tmuxName: session.tmuxName,
    kind: session.kind,
    question,
    lastInput: session.lastInput || ''
  }, 'info').catch(() => {});
}

function markAgentInput(session) {
  if (!session || !AGENT_SESSION_KINDS.has(session.kind)) {
    return;
  }
  const now = Date.now();
  const state = ensureAgentState(session.id);
  state.lastInputAtMs = now;
  state.lastPaneChangedAtMs = now;
}

function maybeTrackAgentCompletion(session, paneText) {
  if (!session || !AGENT_SESSION_KINDS.has(session.kind)) {
    return;
  }
  const now = Date.now();
  const state = ensureAgentState(session.id);
  const normalized = normalizePaneText(paneText);
  const fingerprint = normalized.slice(-1800);
  if (fingerprint !== state.lastPaneFingerprint) {
    state.lastPaneFingerprint = fingerprint;
    state.lastPaneChangedAtMs = now;
  }

  if (!state.lastInputAtMs) {
    return;
  }
  if (state.lastNotifiedInputAtMs >= state.lastInputAtMs) {
    return;
  }
  if (now - state.lastPaneChangedAtMs < AGENT_IDLE_MS) {
    return;
  }

  state.lastNotifiedInputAtMs = state.lastInputAtMs;
  trackAlert('session.agent_idle', {
    projectId: session.projectId,
    projectName: session.projectName,
    sessionId: session.id,
    tmuxName: session.tmuxName,
    kind: session.kind,
    lastInput: session.lastInput || ''
  }, 'info').catch(() => {});

  memoryEngine.enqueueEventIngest({
    projectId: session.projectId,
    type: 'tool_call.succeeded',
    source: 'agent-auto',
    agentKind: session.kind,
    sessionId: session.id,
    summary: `${session.kind} finished: ${String(session.lastInput || '').trim() || 'task complete'}`
  }).catch(() => {});
}

function maybeTrackAgentProgressMemory(session, paneText) {
  if (!session || !AGENT_SESSION_KINDS.has(session.kind)) {
    return;
  }
  const now = Date.now();
  const state = ensureAgentState(session.id);
  if (!state.lastInputAtMs) {
    return;
  }
  // Avoid memory spam: at most once every 12s per active session when pane changes.
  if (now - state.lastProgressMemoryAtMs < 12000) {
    return;
  }
  const normalized = normalizePaneText(paneText);
  if (!normalized) {
    return;
  }
  const fingerprint = normalized.slice(-1200);
  if (!fingerprint || fingerprint === state.lastProgressFingerprint) {
    return;
  }
  state.lastProgressFingerprint = fingerprint;
  state.lastProgressMemoryAtMs = now;

  const lastInput = String(session.lastInput || '').trim();
  const summary = [
    `${session.kind} progress`,
    lastInput ? `input="${lastInput.slice(0, 120)}"` : '',
    `output="${fingerprint.slice(-280).replace(/\s+/g, ' ').trim()}"`
  ].filter(Boolean).join(' | ');

  memoryEngine.enqueueEventIngest({
    projectId: session.projectId,
    type: 'agent.progress',
    source: 'agent-auto',
    agentKind: session.kind,
    sessionId: session.id,
    summary,
    tags: ['progress', session.kind]
  }).catch(() => {});
}

function pollAgentSessionQuestions() {
  const now = Date.now();
  for (const session of listSessions()) {
    if (!AGENT_SESSION_KINDS.has(session.kind)) {
      continue;
    }
    const state = ensureAgentState(session.id);
    const seededLastInput = String(session.lastInput || '').trim();
    if (!state.lastInputAtMs && seededLastInput && seededLastInput.toLowerCase() !== String(session.kind || '').toLowerCase()) {
      state.lastInputAtMs = now;
    }
    if (session.sshHost) {
      // Poll remote panes on a throttled cadence so background projects still
      // generate question/completion notifications without continuous SSH churn.
      if (now - state.lastRemotePollAtMs < REMOTE_AGENT_POLL_INTERVAL_MS) {
        continue;
      }
      state.lastRemotePollAtMs = now;
    }
    execTmuxForSession(session, ['capture-pane', '-p', '-J', '-S', '-120', '-t', session.tmuxName], (error, stdout) => {
      if (error) {
        return;
      }
      maybeTrackAgentQuestion(session, stdout);
      maybeTrackAgentProgressMemory(session, stdout);
      maybeTrackAgentCompletion(session, stdout);
    });
  }
}

async function detectIsGitRepoRemote(sshHost, projectPath) {
  const command = `cd ${shellQuote(projectPath)} && ( [ -d .git ] || git rev-parse --is-inside-work-tree >/dev/null 2>&1 )`;
  try {
    await runSsh(sshHost, command);
    return true;
  } catch {
    return false;
  }
}

async function detectIsGitRepoForProject(project) {
  if (!project) {
    return false;
  }
  if (project.sshHost) {
    return detectIsGitRepoRemote(project.sshHost, project.path);
  }
  return detectIsGitRepoPlugin(project);
}

async function sanitizeProjectLive(project) {
  const isGit = await detectIsGitRepoForProject(project);
  return sanitizeProject(project, { isGit });
}

async function ensureProjectLayoutRemote(sshHost, projectPath) {
  const seed = '# Claude Project Context\\n\\n- Add project-specific notes for Claude Code here.\\n';
  const claudePath = path.posix.join(projectPath, 'CLAUDE.md');
  const agentsPath = path.posix.join(projectPath, 'AGENTS.md');
  const docsPath = path.posix.join(projectPath, 'docs');
  const command = [
    'set -e',
    `mkdir -p ${shellQuote(projectPath)} ${shellQuote(docsPath)}`,
    `if [ ! -e ${shellQuote(claudePath)} ]; then printf %s ${shellQuote(seed)} > ${shellQuote(claudePath)}; fi`,
    `if [ ! -e ${shellQuote(agentsPath)} ]; then ln -s CLAUDE.md ${shellQuote(agentsPath)}; fi`
  ].join('; ');
  await runSsh(sshHost, command);
  const linkCheck = `if [ -L ${shellQuote(agentsPath)} ] && [ \"$(readlink ${shellQuote(agentsPath)})\" = \"CLAUDE.md\" ]; then echo ok; fi`;
  let agentsSymlinkOk = false;
  try {
    const check = await runSsh(sshHost, linkCheck);
    agentsSymlinkOk = check.trim() === 'ok';
  } catch {
    agentsSymlinkOk = false;
  }
  return {
    docsDir: docsPath,
    agentsSymlinkOk
  };
}

async function writeSkillRemote(sshHost, projectPath, { name, content, target }) {
  const normalizedTarget = String(target || '').trim().toLowerCase();
  if (!isValidSkillTarget(normalizedTarget)) {
    throw new Error(`Skill target must be one of: ${AGENT_SYSTEM_IDS.join(', ')}`);
  }
  const slug = slugifySkillName(name);
  const hasFrontmatter = /^\s*---\s*\n[\s\S]*?\n---\s*(\n|$)/.test(String(content || ''));
  const normalizedContent = hasFrontmatter
    ? String(content || '')
    : [
      '---',
      `name: ${slug}`,
      `description: ${JSON.stringify(`Project skill: ${String(name || slug).trim()}`)}`,
      '---',
      '',
      String(content || '').trimStart()
    ].join('\n');
  const written = [];
  const removed = [];
  const steps = ['set -e'];

  for (const systemId of AGENT_SYSTEM_IDS) {
    const system = getAgentSystem(systemId);
    const filePath = skillFilePath(projectPath, systemId, slug, true);
    if (!filePath) {
      continue;
    }
    if (systemId === normalizedTarget) {
      const dir = path.posix.dirname(filePath);
      steps.push(`mkdir -p ${shellQuote(dir)}`);
      steps.push(`printf %s ${shellQuote(normalizedContent)} > ${shellQuote(filePath)}`);
      written.push(filePath);
    } else {
      if (system.skills.layout === 'subdir') {
        steps.push(`rm -rf -- ${shellQuote(path.posix.dirname(filePath))}`);
        removed.push(path.posix.dirname(filePath));
      } else {
        steps.push(`rm -f -- ${shellQuote(filePath)}`);
        removed.push(filePath);
      }
    }
  }

  await runSsh(sshHost, steps.join('; '));
  return { slug, written, removed };
}

async function readRemoteFileIfExists(sshHost, filePath) {
  const existsMarker = '__APROPOS_EXISTS__';
  const missingMarker = '__APROPOS_MISSING__';
  const command = [
    `if [ -f ${shellQuote(filePath)} ]; then`,
    `printf '%s\\n' ${shellQuote(existsMarker)};`,
    `cat ${shellQuote(filePath)};`,
    'else',
    `printf '%s\\n' ${shellQuote(missingMarker)};`,
    'fi'
  ].join(' ');
  const output = await runSsh(sshHost, command);
  if (output === missingMarker) {
    return null;
  }
  if (output.startsWith(`${existsMarker}\n`)) {
    return output.slice(existsMarker.length + 1);
  }
  if (output === existsMarker) {
    return '';
  }
  return null;
}

async function writeRemoteTextFile(sshHost, filePath, content) {
  const directory = path.posix.dirname(filePath);
  const command = [
    'set -e',
    `mkdir -p ${shellQuote(directory)}`,
    `printf %s ${shellQuote(String(content || ''))} > ${shellQuote(filePath)}`
  ].join('; ');
  await runSsh(sshHost, command);
}

function normalizeDocsRelativePathForRemote(value) {
  const normalized = path.posix.normalize(String(value || '').trim().replace(/^\/+/, ''));
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    return '';
  }
  return normalized;
}

async function listDocsFilesRemote(sshHost, projectPath) {
  const docsRoot = path.posix.join(projectPath, 'docs');
  const command = [
    `if [ -d ${shellQuote(docsRoot)} ]; then`,
    `cd ${shellQuote(docsRoot)};`,
    "find . -type f | sed 's#^\\./##' | LC_ALL=C sort | head -n 500;",
    'fi'
  ].join(' ');
  const output = await runSsh(sshHost, command).catch(() => '');
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildCodexTomlForTools(tools) {
  const lines = ['# Managed by apropos.', '# Add custom MCP entries below if needed.'];
  for (const tool of tools || []) {
    lines.push('');
    lines.push(`[mcp_servers.${tool.id}]`);
    lines.push(`command = ${JSON.stringify(String(tool.command || ''))}`);
    const args = Array.isArray(tool.args) ? tool.args.map((arg) => JSON.stringify(String(arg))).join(', ') : '';
    lines.push(`args = [${args}]`);
  }
  return `${lines.join('\n')}\n`;
}

async function writeMcpConfigRemote(sshHost, projectPath, tools) {
  const claudePath = path.posix.join(projectPath, '.mcp.json');
  const codexDir = path.posix.join(projectPath, '.codex');
  const codexPath = path.posix.join(codexDir, 'config.toml');
  const cursorDir = path.posix.join(projectPath, '.cursor');
  const cursorPath = path.posix.join(cursorDir, 'mcp.json');
  const jsonPayload = JSON.stringify({
    mcpServers: Object.fromEntries((tools || []).map((tool) => [tool.id, {
      command: tool.command,
      args: Array.isArray(tool.args) ? tool.args : []
    }]))
  }, null, 2) + '\n';
  const codexPayload = buildCodexTomlForTools(tools);
  await runSsh(sshHost, [
    'set -e',
    `mkdir -p ${shellQuote(codexDir)}`,
    `mkdir -p ${shellQuote(cursorDir)}`,
    `printf %s ${shellQuote(jsonPayload)} > ${shellQuote(claudePath)}`,
    `printf %s ${shellQuote(codexPayload)} > ${shellQuote(codexPath)}`,
    `printf %s ${shellQuote(jsonPayload)} > ${shellQuote(cursorPath)}`
  ].join('; '));
}

async function removeSkillRemote(sshHost, projectPath, slug) {
  const toRemove = [];
  for (const systemId of AGENT_SYSTEM_IDS) {
    const system = getAgentSystem(systemId);
    const filePath = skillFilePath(projectPath, systemId, slug, true);
    if (!filePath) {
      continue;
    }
    if (system.skills.layout === 'subdir') {
      toRemove.push(path.posix.dirname(filePath));
    } else {
      toRemove.push(filePath);
    }
  }
  const steps = ['set -e', ...toRemove.map((p) => `rm -rf -- ${shellQuote(p)}`)];
  await runSsh(sshHost, steps.join('; '));
  return { removed: toRemove };
}

async function upsertProjectSkill(project, spec) {
  const result = project.sshHost
    ? await writeSkillRemote(project.sshHost, project.path, spec)
    : await writeSkill(project.path, spec);

  await updateProject(project.id, (draft) => {
    const nextSkill = {
      id: result.slug,
      name: spec.name,
      target: spec.target,
      createdAt: new Date().toISOString()
    };
    const existingIndex = (draft.skills || []).findIndex((item) => item.id === result.slug);
    if (existingIndex >= 0) {
      draft.skills[existingIndex] = {
        ...draft.skills[existingIndex],
        ...nextSkill
      };
    } else {
      draft.skills.push(nextSkill);
    }
  });

  return {
    slug: result.slug,
    name: spec.name,
    target: spec.target
  };
}

function buildDraftMcpServerPrompt({ project, repositories, skillSlug }) {
  const configuredRepos = Array.isArray(repositories)
    ? repositories.map((item) => ({
      name: String(item?.name || item?.id || '').trim(),
      gitUrl: String(item?.gitUrl || '').trim()
    })).filter((item) => item.gitUrl)
    : [];
  const repoText = configuredRepos.length
    ? configuredRepos.map((repo) => `- ${repo.name || repo.gitUrl}: ${repo.gitUrl}`).join('\n')
    : '- No MCP repository is configured yet.';
  return [
    buildSkillPreloadCommand(skillSlug),
    'Draft a new MCP server for this project.',
    `Project path: ${project.path}`,
    `Project MCP clone root: ${path.join(APROPOS_HOME, project.id, 'mcp')}`,
    'Project-configured MCP repositories:',
    repoText,
    'Use the selected repository and prepare an initial server scaffold plus catalog entry.'
  ].join('\n');
}

function buildMcpRepositoryDeriveConfigPrompt({ project, repository, repoId, clonePath }) {
  const repoUrl = String(repository?.gitUrl || '').trim();
  const repoName = String(repository?.name || repoId || '').trim() || repoId;
  const repositoryLocation = project.sshHost
    ? `Repository URL: ${repoUrl}. On this remote host, inspect or clone as needed before configuration.`
    : `Repository clone path: ${clonePath}.`;
  return [
    `Configure MCP repository "${repoName}" for this project.`,
    `Project path: ${project.path}.`,
    `Repository id: ${repoId}.`,
    repositoryLocation,
    'Determine the exact MCP server command and args, then update both `.mcp.json` (Claude) and `.codex/config.toml` (Codex).',
    'Keep existing MCP entries intact and add exactly one entry for this repository.',
    'When done, summarize the selected command/args and rationale.'
  ].join(' ');
}

function buildLocalMcpSetupPrompt({ project, skillSlug }) {
  return [
    buildSkillPreloadCommand(skillSlug),
    'Configure local MCP usage for this project.',
    `Project path: ${project.path}`,
    'Find an MCP server implementation that already exists locally for this project and determine its exact command and args.',
    'Update `.mcp.json` (Claude) and `.codex/config.toml` (Codex) so the local MCP server is usable.',
    'Keep existing MCP entries intact and add exactly one local MCP entry if none exists for this local server.',
    `Route through proxy endpoints: http://127.0.0.1:${DEFAULT_PORT}/api/projects/${project.id}/proxy/codex and http://127.0.0.1:${DEFAULT_PORT}/api/projects/${project.id}/proxy/claude.`,
    'Run a basic connectivity check and summarize what was configured.'
  ].join('\n');
}

function normalizeHeaderOrQuery(value) {
  return String(value || '').trim();
}

function projectMemorySettings() {
  const memory = currentState().settings?.memory || {};
  const vectorStore = memory.vectorStore || {};
  return {
    autoCaptureMcp: memory.autoCaptureMcp !== false,
    vectorStore: {
      provider: String(vectorStore.provider || 'local').trim().toLowerCase() || 'local',
      endpoint: String(vectorStore.endpoint || '').trim(),
      collection: String(vectorStore.collection || 'apropos_memory').trim() || 'apropos_memory',
      autoStartOnboarding: vectorStore.autoStartOnboarding !== false,
      dockerContainer: String(vectorStore.dockerContainer || 'apropos-qdrant').trim() || 'apropos-qdrant',
      dockerImage: String(vectorStore.dockerImage || 'qdrant/qdrant:latest').trim() || 'qdrant/qdrant:latest',
      dockerPort: Number.parseInt(String(vectorStore.dockerPort || 6333), 10) || 6333
    }
  };
}

function shouldAutoCaptureProxyMemory(result, body) {
  const settings = projectMemorySettings();
  if (!settings.autoCaptureMcp) {
    return false;
  }
  const method = String(body?.method || '').trim().toLowerCase();
  if (result?.status >= 400) {
    return true;
  }
  return method.includes('tool') || method.includes('call');
}

async function maybeCaptureProxyMemory({ project, targetName, body, result, sessionId }) {
  if (!project || !result || !shouldAutoCaptureProxyMemory(result, body)) {
    return null;
  }
  const method = String(body?.method || 'unknown').trim() || 'unknown';
  const status = Number(result?.status);
  const durationMs = Number(result?.durationMs);
  const content = [
    `MCP ${targetName} ${method}`,
    `status=${Number.isFinite(status) ? status : 'unknown'}`,
    `duration=${Number.isFinite(durationMs) ? `${durationMs}ms` : '-'}`
  ].join(' ');

  const ingested = await memoryEngine.enqueueIngest({
    projectId: project.id,
    type: 'tool_observation',
    content,
    agentKind: targetName,
    sessionId: sessionId || null,
    source: 'proxy-auto',
    tags: [targetName, method, Number.isFinite(status) && status >= 400 ? 'error' : 'ok']
  });
  return ingested.memory;
}

function formatMemoryContextBlock(recalled) {
  const results = Array.isArray(recalled?.results) ? recalled.results : [];
  if (!results.length) {
    return '';
  }
  const lines = ['# Project Memory Context'];
  for (const [index, entry] of results.entries()) {
    const memory = entry?.memory || {};
    const type = String(memory.type || 'fact');
    const content = String(memory.content || '').trim();
    const tags = Array.isArray(memory.tags) && memory.tags.length ? ` tags=${memory.tags.join(',')}` : '';
    if (!content) {
      continue;
    }
    lines.push(`${index + 1}. [${type}] ${content}${tags}`);
  }
  if (lines.length === 1) {
    return '';
  }
  return `${lines.join('\n')}\n`;
}

function runLocalExec(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(String(stdout || '').trim());
    });
  });
}

async function startDefaultVectorStore() {
  const settings = projectMemorySettings();
  const vector = settings.vectorStore;
  if (vector.provider !== 'qdrant') {
    return {
      started: false,
      provider: vector.provider,
      message: 'Default auto-start is only implemented for qdrant provider.'
    };
  }

  await runLocalExec('docker', ['--version']);
  const containerName = vector.dockerContainer;
  const inspectState = await runLocalExec('docker', ['inspect', '-f', '{{.State.Running}}', containerName]).catch(() => '');
  if (inspectState === 'true') {
    return {
      started: false,
      provider: vector.provider,
      container: containerName,
      endpoint: vector.endpoint || `http://127.0.0.1:${vector.dockerPort}`,
      message: 'Qdrant container already running.'
    };
  }
  if (inspectState === 'false') {
    await runLocalExec('docker', ['start', containerName]);
  } else {
    await runLocalExec('docker', [
      'run',
      '-d',
      '--name',
      containerName,
      '-p',
      `${vector.dockerPort}:6333`,
      vector.dockerImage
    ]);
  }

  return {
    started: true,
    provider: vector.provider,
    container: containerName,
    endpoint: vector.endpoint || `http://127.0.0.1:${vector.dockerPort}`,
    message: 'Qdrant container started for onboarding.'
  };
}

async function installDefaultSkills(project) {
  for (const spec of DEFAULT_PROJECT_SKILLS) {
    await upsertProjectSkill(project, spec);
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.get('/api/dashboard', async (_req, res) => {
  await refreshSessions(getProject, currentState().projects);
  const state = currentState();
  const projects = await Promise.all(
    state.projects.map(async (project) => {
      const sanitized = await sanitizeProjectLive(project);
      const catalog = buildMcpCatalogForProject(project);
      const inspected = await inspectProjectConfiguration(project, catalog);
      return {
        ...sanitized,
        mcpRepositories: normalizeProjectMcpRepositories(project),
        mcpCatalog: catalog,
        mcpTools: inspected.mcpTools,
        skills: inspected.skills,
        structure: inspected.structure
      };
    })
  );
  const globalCatalog = projects.flatMap((project) => project.mcpCatalog || []);
  res.json({
    settings: state.settings,
    mcpCatalog: globalCatalog,
    projects,
    projectFolders: state.projectFolders || [],
    projectFolderByProject: state.projectFolderByProject || {},
    activeFolderId: state.activeFolderId || null,
    sessionTileSizesByProject: state.sessionTileSizesByProject || {},
    sessions: listSessions(),
    alerts: getAlerts().slice(0, 100),
    events: getEvents().slice(0, 100)
  });
});

app.get('/api/projects/:projectId/mcp/repositories', (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json({
    repositories: normalizeProjectMcpRepositories(project),
    catalog: buildMcpCatalogForProject(project)
  });
});

app.post('/api/projects/:projectId/mcp/repositories', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  const source = String(req.body?.source || 'github').trim().toLowerCase();
  if (!['github', 'local'].includes(source)) {
    res.status(400).json({ error: 'source must be github or local' });
    return;
  }
  if (source === 'local') {
    try {
      const skill = await upsertProjectSkill(project, SETUP_MCP_PROXY_SKILL);
      const prompt = buildLocalMcpSetupPrompt({
        project,
        skillSlug: skill.slug
      });
      let session = null;
      const skipped = [];
      try {
        session = await spawnSession({ project, kind: 'codex', prompt });
        setSessionLastInput(session.id, prompt);
        await refreshSessions(getProject, currentState().projects);
        await trackEvent('project.mcp_local_setup_session_started', {
          projectId: project.id,
          projectName: project.name,
          sessionId: session.id,
          tmuxName: session.tmuxName,
          skillId: skill.slug
        });
      } catch (error) {
        if (error.code === 'MISSING_CLI') {
          skipped.push({ orchestrator: 'codex', reason: error.message });
          await trackAlert('project.mcp_local_setup_session_skipped', {
            projectId: project.id,
            reason: error.message
          }, 'warning');
        } else {
          throw error;
        }
      }
      res.status(201).json({
        ok: true,
        source: 'local',
        session,
        skipped
      });
      return;
    } catch (error) {
      await trackAlert('mcp.local_setup_failed', { projectId: project.id, error: error.message }, 'warning');
      res.status(500).json({ error: error.message });
      return;
    }
  }
  const gitUrl = String(req.body?.gitUrl || '').trim();
  const requestedName = String(req.body?.name || '').trim();
  if (!gitUrl) {
    res.status(400).json({ error: 'gitUrl is required' });
    return;
  }
  try {
    validateMcpRepoGitUrl(gitUrl);
  } catch (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  const repoId = slugifyRepoId(gitUrl);
  const repoName = requestedName || repoId;

  try {
    const synced = await syncMcpRepository(project, gitUrl, repoId);
    const updatedProject = await updateProject(project.id, (draft) => {
      const repositories = normalizeProjectMcpRepositories(draft);
      const nextRepo = { id: repoId, name: repoName, gitUrl, tools: synced.tools };
      const index = repositories.findIndex((item) => item.id === repoId || item.gitUrl === gitUrl);
      if (index >= 0) {
        repositories[index] = {
          ...repositories[index],
          ...nextRepo
        };
      } else {
        repositories.push(nextRepo);
      }
      draft.mcpRepositories = repositories;
    });
    const repository = (updatedProject?.mcpRepositories || []).find((item) => item.id === repoId) || null;

    const derivePrompt = buildMcpRepositoryDeriveConfigPrompt({
      project: updatedProject || project,
      repository: repository || { id: repoId, name: repoName, gitUrl },
      repoId,
      clonePath: synced.repoPath
    });
    let session = null;
    try {
      session = await spawnSession({ project: updatedProject || project, kind: 'codex', prompt: derivePrompt });
      setSessionLastInput(session.id, derivePrompt);
      await refreshSessions(getProject, currentState().projects);
      await trackEvent('project.mcp_repository_derive_session_started', {
        projectId: project.id,
        projectName: project.name,
        repoId,
        gitUrl,
        sessionId: session.id,
        tmuxName: session.tmuxName
      });
    } catch (error) {
      if (error.code === 'MISSING_CLI') {
        await trackAlert('project.mcp_repository_derive_session_skipped', {
          projectId: project.id,
          repoId,
          gitUrl,
          reason: error.message
        }, 'warning');
      } else {
        throw error;
      }
    }

    await trackEvent('mcp.repository_added', {
      projectId: project.id,
      repoId,
      repoName,
      gitUrl,
      toolCount: synced.tools.length
    });

    res.status(201).json({
      ok: true,
      repository: repository ? { ...repository, clonePath: synced.repoPath } : null,
      catalog: buildMcpCatalogForProject(updatedProject || project),
      session
    });
  } catch (error) {
    await trackAlert('mcp.repository_add_failed', { projectId: project.id, gitUrl, error: error.message }, 'warning');
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:projectId/mcp/repositories/:repoId/sync', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  const repoId = String(req.params.repoId || '').trim();
  if (!repoId) {
    res.status(400).json({ error: 'repoId is required' });
    return;
  }
  const repositories = normalizeProjectMcpRepositories(project);
  const repository = repositories.find((item) => item.id === repoId);
  if (!repository) {
    res.status(404).json({ error: 'Repository not found' });
    return;
  }
  try {
    validateMcpRepoGitUrl(repository.gitUrl);
  } catch (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  try {
    const synced = await syncMcpRepository(project, repository.gitUrl, repoId);
    const updatedProject = await updateProject(project.id, (draft) => {
      const nextRepositories = normalizeProjectMcpRepositories(draft);
      const index = nextRepositories.findIndex((item) => item.id === repoId || item.gitUrl === repository.gitUrl);
      if (index >= 0) {
        nextRepositories[index] = {
          ...nextRepositories[index],
          tools: synced.tools
        };
      }
      draft.mcpRepositories = nextRepositories;
    });
    await trackEvent('mcp.repository_synced', {
      projectId: project.id,
      repoId,
      gitUrl: repository.gitUrl,
      toolCount: synced.tools.length
    });
    res.json({
      ok: true,
      repository: (() => {
        const updatedRepo = (updatedProject?.mcpRepositories || []).find((item) => item.id === repoId) || null;
        return updatedRepo ? { ...updatedRepo, clonePath: synced.repoPath } : null;
      })(),
      catalog: buildMcpCatalogForProject(updatedProject || project)
    });
  } catch (error) {
    await trackAlert('mcp.repository_sync_failed', {
      projectId: project.id,
      repoId,
      gitUrl: repository.gitUrl,
      error: error.message
    }, 'warning');
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/folders/state', async (req, res) => {
  const { projectFolders, projectFolderByProject, activeFolderId } = req.body || {};
  try {
    const updated = await updateFolderState({ projectFolders, projectFolderByProject, activeFolderId });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/workspace/session-sizes', async (req, res) => {
  try {
    const sessionTileSizesByProject = await updateSessionTileSizes(req.body?.sessionTileSizesByProject);
    res.json({ ok: true, sessionTileSizesByProject });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/system/pick-directory', async (_req, res) => {
  if (process.platform !== 'darwin') {
    res.status(501).json({ error: 'Native folder picker is currently supported on macOS only.' });
    return;
  }
  try {
    const pickedPath = await pickDirectoryMacOs();
    if (!pickedPath) {
      res.status(400).json({ error: 'No directory selected' });
      return;
    }
    res.json({ path: pickedPath, name: basenameFromPath(pickedPath) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects', async (req, res) => {
  const { name, path: projectPath, sshHost } = req.body || {};
  const remoteHost = String(sshHost || '').trim() || null;
  const derivedName = basenameFromPath(projectPath);
  const finalName = String(name || derivedName || '').trim();
  if (!finalName || !projectPath) {
    res.status(400).json({ error: 'path is required' });
    return;
  }

  try {
    const normalizedProjectPath = String(projectPath).trim();
    let detectedIsGit = false;
    let scaffold;
    if (remoteHost) {
      detectedIsGit = await detectIsGitRepoRemote(remoteHost, normalizedProjectPath);
      scaffold = await ensureProjectLayoutRemote(remoteHost, normalizedProjectPath);
    } else {
      await fs.mkdir(normalizedProjectPath, { recursive: true });
      detectedIsGit = await detectIsGitRepoPlugin({ path: normalizedProjectPath, sshHost: null });
      scaffold = await ensureProjectLayout(normalizedProjectPath);
    }

    const project = await addProject({
      name: finalName,
      projectPath: normalizedProjectPath,
      sshHost: remoteHost
    });
    await updateProject(project.id, (draft) => {
      draft.agentsSymlinkOk = scaffold.agentsSymlinkOk;
    });
    await installDefaultSkills(project);

    await trackEvent('project.added', {
      projectId: project.id,
      projectName: project.name,
      projectPath: project.path,
      sshHost: project.sshHost || null
    });

    res.status(201).json({ project: sanitizeProject(getProject(project.id), { isGit: detectedIsGit }) });
  } catch (error) {
    await trackAlert('project.add_failed', { name: finalName, projectPath, error: error.message }, 'critical');
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:projectId/scaffold', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const scaffold = project.sshHost
      ? await ensureProjectLayoutRemote(project.sshHost, project.path)
      : await ensureProjectLayout(project.path);
    const updated = await updateProject(project.id, (draft) => {
      draft.agentsSymlinkOk = scaffold.agentsSymlinkOk;
    });
    res.json({ project: await sanitizeProjectLive(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects/:projectId/memory', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const memories = await listProjectMemories(project.id, {
      type: req.query.type,
      tag: req.query.tag,
      limit: req.query.limit
    });
    res.json({ memories });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/projects/:projectId/memory', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const ingested = await memoryEngine.enqueueIngest({
      ...(req.body || {}),
      projectId: project.id
    });
    res.status(201).json({ memory: ingested.memory, vector: ingested.vector });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/projects/:projectId/memory/recall', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const recalled = await memoryEngine.recall({
      projectId: project.id,
      query: req.body?.query,
      limit: req.body?.limit,
      sessionId: req.body?.sessionId,
      tag: req.body?.tag
    });
    await trackEvent('memory.recalled', {
      projectId: project.id,
      projectName: project.name,
      query: String(req.body?.query || '').trim(),
      count: recalled.count
    });
    res.json(recalled);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/projects/:projectId/memory/context', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const recalled = await memoryEngine.recall({
      projectId: project.id,
      query: req.body?.query,
      limit: req.body?.limit,
      sessionId: req.body?.sessionId,
      tag: req.body?.tag
    });
    const context = formatMemoryContextBlock(recalled);
    await trackEvent('memory.context_generated', {
      projectId: project.id,
      projectName: project.name,
      query: String(req.body?.query || '').trim(),
      count: recalled.count
    });
    res.json({
      query: recalled.query,
      count: recalled.count,
      context,
      results: recalled.results
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/projects/:projectId/memory/consolidate', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const summary = await memoryEngine.consolidate({
      projectId: project.id,
      limit: req.body?.limit
    });
    await trackEvent('memory.consolidated', {
      projectId: project.id,
      projectName: project.name,
      removed: summary.removed,
      retained: summary.retained
    });
    res.json({ summary });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/projects/:projectId/memory/ingest-event', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const ingested = await memoryEngine.enqueueEventIngest({
      ...(req.body || {}),
      projectId: project.id
    });
    res.status(201).json({ memory: ingested.memory, vector: ingested.vector });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.patch('/api/projects/:projectId/memory/:memoryId', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const memory = await updateProjectMemory(project.id, req.params.memoryId, req.body || {});
    if (!memory) {
      res.status(404).json({ error: 'Memory not found' });
      return;
    }
    await trackEvent('memory.updated', {
      projectId: project.id,
      projectName: project.name,
      memoryId: memory.id,
      type: memory.type,
      source: memory.source,
      agentKind: memory.agentKind,
      sessionId: memory.sessionId
    });
    res.json({ memory });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/projects/:projectId/memory/:memoryId', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const removed = await removeProjectMemory(project.id, req.params.memoryId);
    if (!removed) {
      res.status(404).json({ error: 'Memory not found' });
      return;
    }
    await trackEvent('memory.deleted', {
      projectId: project.id,
      projectName: project.name,
      memoryId: removed.id,
      type: removed.type,
      source: removed.source,
      agentKind: removed.agentKind,
      sessionId: removed.sessionId
    });
    res.json({ memory: removed });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/projects/:projectId', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const deleteFiles = String(req.query.deleteFiles || 'false') === 'true';

  try {
    const stoppedSessions = await stopSessionsForProject(project.id);
    if (deleteFiles) {
      if (project.sshHost) {
        await runSsh(project.sshHost, `rm -rf -- ${shellQuote(project.path)}`);
      } else {
        await fs.rm(project.path, { recursive: true, force: true });
      }
    }
    const removed = await removeProject(project.id);
    await clearProjectMemories(project.id);

    await trackEvent('project.deleted', {
      projectId: project.id,
      projectName: project.name,
      projectPath: project.path,
      deleteFiles,
      stoppedSessions
    });

    res.json({ project: await sanitizeProjectLive(removed), deleteFiles, stoppedSessions });
  } catch (error) {
    await trackAlert('project.delete_failed', {
      projectId: project.id,
      projectName: project.name,
      projectPath: project.path,
      deleteFiles,
      error: error.message
    }, 'critical');
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:projectId/mcp-tools', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const { toolId } = req.body || {};
  const tool = findProjectCatalogTool(project, toolId);
  if (!tool) {
    res.status(400).json({ error: 'Unknown toolId' });
    return;
  }

  try {
    const baseTools = await resolveWritableProjectMcpTools(project);
    const updated = await updateProject(project.id, (draft) => {
      const nextTools = [...baseTools];
      if (!nextTools.find((item) => item.id === tool.id)) {
        nextTools.push(tool);
      }
      draft.mcpTools = nextTools;
    });

    if (project.sshHost) {
      await writeMcpConfigRemote(project.sshHost, project.path, updated.mcpTools);
    } else {
      await writeMcpConfigForAllSystems(project.path, updated.mcpTools);
    }

    await trackEvent('project.mcp_tool_added', {
      projectId: project.id,
      projectName: project.name,
      toolId: tool.id
    });

    res.json({ project: await sanitizeProjectLive(updated) });
  } catch (error) {
    await trackAlert('project.mcp_tool_add_failed', {
      projectId: project.id,
      toolId: tool.id,
      error: error.message
    }, 'warning');
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:projectId/mcp-tools/setup', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const toolId = String(req.body?.toolId || '').trim();
  if (!toolId) {
    res.status(400).json({ error: 'toolId is required' });
    return;
  }
  const tool = findProjectCatalogTool(project, toolId);
  if (!tool) {
    res.status(400).json({ error: 'Unknown toolId' });
    return;
  }

  try {
    const baseTools = await resolveWritableProjectMcpTools(project);
    const updated = await updateProject(project.id, (draft) => {
      const nextTools = [...baseTools];
      if (!nextTools.find((item) => item.id === tool.id)) {
        nextTools.push(tool);
      }
      draft.mcpTools = nextTools;
    });

    if (project.sshHost) {
      await writeMcpConfigRemote(project.sshHost, project.path, updated.mcpTools);
    } else {
      await writeMcpConfigForAllSystems(project.path, updated.mcpTools);
    }

    const launched = [];
    const skipped = [];
    for (const orchestrator of ['codex', 'claude']) {
      try {
        const session = await spawnSession({ project, kind: orchestrator });
        const prompt = [
          '/skill setup-mcp-proxy',
          `Set up MCP tool "${tool.id}" in this project.`,
          `Repository: ${tool.repo || 'n/a'}`,
          'Route MCP interactions through the apropos MCP observability proxy endpoint.',
          `Proxy endpoint: http://127.0.0.1:${DEFAULT_PORT}/api/projects/${project.id}/proxy/${orchestrator}`,
          'Verify config files and run a quick connectivity check.'
        ].join('\n');
        await runTmuxForSession(session, ['send-keys', '-t', session.tmuxName, '-l', prompt]);
        await runTmuxForSession(session, ['send-keys', '-t', session.tmuxName, 'C-m']);
        setSessionLastInput(session.id, prompt);
        launched.push(session);
      } catch (error) {
        if (error.code === 'MISSING_CLI') {
          skipped.push({ orchestrator, reason: error.message });
          continue;
        }
        throw error;
      }
    }

    await refreshSessions(getProject, currentState().projects);
    await trackEvent('project.mcp_tool_setup_started', {
      projectId: project.id,
      projectName: project.name,
      toolId: tool.id,
      launchedCount: launched.length,
      skipped
    });

    res.status(201).json({
      ok: true,
      project: await sanitizeProjectLive(updated),
      tool,
      launched,
      skipped
    });
  } catch (error) {
    await trackAlert('project.mcp_tool_setup_failed', {
      projectId: project.id,
      projectName: project.name,
      toolId,
      error: error.message
    }, 'warning');
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:projectId/mcp-tools/draft-server-session', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const skill = await upsertProjectSkill(project, DRAFT_MCP_SERVER_SKILL);
    const repositories = normalizeProjectMcpRepositories(project);
    const prompt = buildDraftMcpServerPrompt({
      project,
      repositories,
      skillSlug: skill.slug
    });
    const session = await spawnSession({ project, kind: 'codex', prompt });
    setSessionLastInput(session.id, prompt);
    await refreshSessions(getProject, currentState().projects);

    await trackEvent('project.mcp_server_draft_session_started', {
      projectId: project.id,
      projectName: project.name,
      sessionId: session.id,
      tmuxName: session.tmuxName,
      skillId: skill.slug
    });

    res.status(201).json({
      ok: true,
      session,
      skill
    });
  } catch (error) {
    await trackAlert('project.mcp_server_draft_session_failed', {
      projectId: project.id,
      projectName: project.name,
      error: error.message
    }, 'warning');
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:projectId/mcp-tools/remove', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const { toolId } = req.body || {};
  if (!toolId) {
    res.status(400).json({ error: 'toolId is required' });
    return;
  }

  try {
    const baseTools = await resolveWritableProjectMcpTools(project);
    const updated = await updateProject(project.id, (draft) => {
      draft.mcpTools = baseTools.filter((item) => item.id !== toolId);
    });

    if (project.sshHost) {
      await writeMcpConfigRemote(project.sshHost, project.path, updated.mcpTools);
    } else {
      await writeMcpConfigForAllSystems(project.path, updated.mcpTools);
    }

    await trackEvent('project.mcp_tool_removed', {
      projectId: project.id,
      projectName: project.name,
      toolId
    });

    res.json({ project: await sanitizeProjectLive(updated) });
  } catch (error) {
    await trackAlert('project.mcp_tool_remove_failed', {
      projectId: project.id,
      toolId,
      error: error.message
    }, 'warning');
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects/:projectId/editor', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const kind = String(req.query.kind || '').trim().toLowerCase();
  if (!kind) {
    res.status(400).json({ error: 'kind is required' });
    return;
  }

  try {
    if (kind === 'agents') {
      if (project.sshHost) {
        const claudePath = path.posix.join(project.path, 'CLAUDE.md');
        const agentsPath = path.posix.join(project.path, 'AGENTS.md');
        const claudeContent = await readRemoteFileIfExists(project.sshHost, claudePath);
        if (claudeContent != null) {
          res.json({ kind, content: claudeContent, source: 'CLAUDE.md' });
          return;
        }
        const agentsContent = await readRemoteFileIfExists(project.sshHost, agentsPath);
        if (agentsContent != null) {
          res.json({ kind, content: agentsContent, source: 'AGENTS.md' });
          return;
        }
        res.json({ kind, content: '', source: null });
        return;
      } else {
        const claudePath = path.join(project.path, 'CLAUDE.md');
        const agentsPath = path.join(project.path, 'AGENTS.md');
        try {
          const content = await fs.readFile(claudePath, 'utf8');
          res.json({ kind, content, source: 'CLAUDE.md' });
          return;
        } catch (error) {
          if (error.code !== 'ENOENT') {
            throw error;
          }
        }
        try {
          const content = await fs.readFile(agentsPath, 'utf8');
          res.json({ kind, content, source: 'AGENTS.md' });
          return;
        } catch (error) {
          if (error.code !== 'ENOENT') {
            throw error;
          }
        }
        res.json({ kind, content: '', source: null });
        return;
      }
    }

    if (kind === 'cursor') {
      const cursorPath = agentsFilePath(project.path, 'cursor', Boolean(project.sshHost));
      if (!cursorPath) {
        res.status(400).json({ error: 'Cursor agents file not configured' });
        return;
      }
      if (project.sshHost) {
        const content = await readRemoteFileIfExists(project.sshHost, cursorPath);
        const system = getAgentSystem('cursor');
        res.json({ kind, content: content ?? system?.agentsFile?.defaultContent ?? '', source: cursorPath });
        return;
      }
      try {
        const content = await fs.readFile(cursorPath, 'utf8');
        res.json({ kind, content, source: cursorPath });
      } catch (error) {
        if (error.code === 'ENOENT') {
          const system = getAgentSystem('cursor');
          res.json({ kind, content: system?.agentsFile?.defaultContent ?? '', source: null });
        } else {
          throw error;
        }
      }
      return;
    }

    if (kind === 'docs') {
      const relativePath = String(req.query.relativePath || 'README.md').trim();
      if (!relativePath) {
        res.status(400).json({ error: 'relativePath is required for docs' });
        return;
      }
      if (project.sshHost) {
        const normalizedRelative = normalizeDocsRelativePathForRemote(relativePath);
        if (!normalizedRelative) {
          res.status(400).json({ error: 'relativePath must stay under docs/' });
          return;
        }
        const targetPath = path.posix.join(project.path, 'docs', normalizedRelative);
        const content = await readRemoteFileIfExists(project.sshHost, targetPath);
        if (content != null) {
          res.json({ kind, relativePath: normalizedRelative, content, source: targetPath });
          return;
        }
        res.json({ kind, relativePath: normalizedRelative, content: '', source: null });
        return;
      } else {
        const docsRoot = path.join(project.path, 'docs');
        const targetPath = path.resolve(docsRoot, relativePath);
        const normalizedRoot = path.resolve(docsRoot);
        if (!(targetPath === normalizedRoot || targetPath.startsWith(`${normalizedRoot}${path.sep}`))) {
          res.status(400).json({ error: 'relativePath must stay under docs/' });
          return;
        }
        try {
          const content = await fs.readFile(targetPath, 'utf8');
          res.json({ kind, relativePath, content, source: targetPath });
          return;
        } catch (error) {
          if (error.code !== 'ENOENT') {
            throw error;
          }
        }
        res.json({ kind, relativePath, content: '', source: null });
        return;
      }
    }

    if (kind === 'docs-files') {
      const files = project.sshHost
        ? await listDocsFilesRemote(project.sshHost, project.path)
        : await listDocsFilesRecursive(path.join(project.path, 'docs'));
      res.json({ kind, files });
      return;
    }

    if (kind === 'skills') {
      const requestedName = String(req.query.name || '').trim();
      const skill = requestedName
        ? (project.skills || []).find((item) => item.name === requestedName || item.id === requestedName)
        : project.skills?.[0];
      const name = requestedName || skill?.name || skill?.id || '';
      const rawTarget = String(skill?.target || '').trim().toLowerCase();
      const target = AGENT_SYSTEM_IDS.includes(rawTarget) ? rawTarget : 'codex';
      const slug = slugifySkillName(name || skill?.id || 'skill');
      const candidates = [skillFilePath(project.path, target, slug, Boolean(project.sshHost))].filter(Boolean);
      for (const filePath of candidates) {
        const content = project.sshHost
          ? await readRemoteFileIfExists(project.sshHost, filePath)
          : await fs.readFile(filePath, 'utf8').catch((error) => {
            if (error.code === 'ENOENT') {
              return null;
            }
            throw error;
          });
        if (content != null) {
          res.json({ kind, name, target, content, source: filePath });
          return;
        }
      }
      res.json({ kind, name, target, content: '', source: null });
      return;
    }

    if (kind === 'mcp') {
      const configured = (project.mcpTools || []).map((tool) => tool.id);
      const repositories = normalizeProjectMcpRepositories(project);
      const catalog = buildMcpCatalogForProject(project);
      res.json({ kind, configured, repositories, catalog });
      return;
    }

    res.status(400).json({ error: 'Unsupported kind' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects/:projectId/diff-logs', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const output = await runGitForProject(project, ['status', '--porcelain=v1', '--untracked-files=all']);
    const entries = parseGitStatusPorcelain(output);
    res.json({
      generatedAt: new Date().toISOString(),
      entries
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:projectId/skills', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const { name, content, target } = req.body || {};
  if (!name || !content || !target) {
    res.status(400).json({ error: 'name, content, and target are required' });
    return;
  }
  if (!isValidSkillTarget(String(target).trim())) {
    res.status(400).json({ error: `target must be one of: ${AGENT_SYSTEM_IDS.join(', ')}` });
    return;
  }

  try {
    const result = project.sshHost
      ? await writeSkillRemote(project.sshHost, project.path, { name, content, target })
      : await writeSkill(project.path, { name, content, target });
    const updated = await updateProject(project.id, (draft) => {
      const nextSkill = {
        id: result.slug,
        name,
        target,
        createdAt: new Date().toISOString()
      };
      const existingIndex = (draft.skills || []).findIndex((item) => item.id === result.slug);
      if (existingIndex >= 0) {
        draft.skills[existingIndex] = {
          ...draft.skills[existingIndex],
          ...nextSkill
        };
      } else {
        draft.skills.push(nextSkill);
      }
    });

    await trackEvent('project.skill_added', {
      projectId: project.id,
      projectName: project.name,
      skillName: name,
      target
    });

    res.json({ project: await sanitizeProjectLive(updated), files: result.written });
  } catch (error) {
    await trackAlert('project.skill_add_failed', {
      projectId: project.id,
      skillName: name,
      error: error.message
    }, 'warning');
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:projectId/skills/remove', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const requestedId = String(req.body?.skillId || '').trim();
  const requestedName = String(req.body?.name || '').trim();
  if (!requestedId && !requestedName) {
    res.status(400).json({ error: 'skillId or name is required' });
    return;
  }

  const skill = (project.skills || []).find((item) => item.id === requestedId || item.name === requestedName);
  const slug = skill?.id || slugifySkillName(requestedName || requestedId);

  try {
    let removedFiles = [];
    if (project.sshHost) {
      const removed = await removeSkillRemote(project.sshHost, project.path, slug);
      removedFiles = removed.removed;
    } else {
      for (const systemId of AGENT_SYSTEM_IDS) {
        const system = getAgentSystem(systemId);
        const filePath = skillFilePath(project.path, systemId, slug, false);
        if (!filePath) {
          continue;
        }
        if (system.skills.layout === 'subdir') {
          await fs.rm(path.dirname(filePath), { recursive: true, force: true });
          removedFiles.push(path.dirname(filePath));
        } else {
          await fs.rm(filePath, { force: true });
          removedFiles.push(filePath);
        }
      }
    }

    const updated = await updateProject(project.id, (draft) => {
      draft.skills = (draft.skills || []).filter((item) => item.id !== slug);
    });

    await trackEvent('project.skill_removed', {
      projectId: project.id,
      projectName: project.name,
      skillId: slug
    });

    res.json({ ok: true, removed: removedFiles, project: await sanitizeProjectLive(updated) });
  } catch (error) {
    await trackAlert('project.skill_remove_failed', {
      projectId: project.id,
      skillId: slug,
      error: error.message
    }, 'warning');
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:projectId/skills/authoring-session', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const mode = String(req.body?.mode || 'existing').trim();
  const requestedOrchestrator = String(req.body?.orchestrator || '').trim();
  const requestedName = String(req.body?.skillName || '').trim();
  const requestedId = String(req.body?.skillId || '').trim();
  if (!['existing', 'add'].includes(mode)) {
    res.status(400).json({ error: 'mode must be existing or add' });
    return;
  }

  try {
    let slug = '';
    let skillName = '';
    let orchestrator = '';
    let preloadCommand = '';

    if (mode === 'add') {
      skillName = requestedName;
      if (!isValidSkillTarget(requestedOrchestrator)) {
        res.status(400).json({ error: `orchestrator must be one of: ${AGENT_SYSTEM_IDS.join(', ')} for mode=add` });
        return;
      }
      orchestrator = requestedOrchestrator;
      if (skillName) {
        slug = slugifySkillName(skillName);
      }
    } else {
      let skill = (project.skills || []).find((item) => item.id === requestedId);
      if (!skill && requestedName) {
        skill = (project.skills || []).find((item) => item.name === requestedName || item.id === requestedName);
      }
      if (!skill) {
        res.status(404).json({ error: 'Skill not found' });
        return;
      }

      slug = String(skill.id || slugifySkillName(skill.name || 'skill')).trim();
      skillName = String(skill.name || slug).trim();
      const rawTarget = String(skill.target || '').trim().toLowerCase();
      orchestrator = AGENT_SYSTEM_IDS.includes(rawTarget) ? rawTarget : 'codex';
      preloadCommand = buildSkillPreloadCommand(slug);
    }

    const skillFile = slug ? projectSkillFile(project, orchestrator, slug) : null;
    if (mode === 'add') {
      preloadCommand = buildNewSkillBuilderPrompt({ project, orchestrator, skillName, skillFile });
    }

    const session = await spawnSession({ project, kind: orchestrator, prompt: preloadCommand });
    setSessionLastInput(session.id, preloadCommand);
    await refreshSessions(getProject, currentState().projects);

    await trackEvent('project.skill_session_started', {
      projectId: project.id,
      projectName: project.name,
      mode,
      orchestrator,
      skillName,
      skillId: slug,
      skillFile,
      sessionId: session.id,
      tmuxName: session.tmuxName
    });

    res.status(201).json({
      ok: true,
      session,
      skill: {
        name: skillName,
        slug,
        orchestrator,
        file: skillFile
      }
    });
  } catch (error) {
    if (error.code === 'MISSING_CLI' || error.code === 'AGENT_EXITED_EARLY') {
      res.status(400).json({ error: error.message, code: error.code, kind: error.kind });
      return;
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:projectId/agents', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const { content, agentId } = req.body || {};
  if (!content) {
    res.status(400).json({ error: 'content is required' });
    return;
  }

  const normalizedAgentId = String(agentId || 'claude').trim().toLowerCase();
  if (!isValidAgentsSystemId(normalizedAgentId)) {
    res.status(400).json({ error: `agentId must be one of: claude, cursor` });
    return;
  }

  try {
    let agentsSymlinkOk = false;

    if (normalizedAgentId === 'cursor') {
      const cursorPath = agentsFilePath(project.path, 'cursor', Boolean(project.sshHost));
      if (!cursorPath) {
        res.status(400).json({ error: 'Cursor agents file not configured' });
        return;
      }
      if (project.sshHost) {
        await writeRemoteTextFile(project.sshHost, cursorPath, String(content));
      } else {
        await fs.writeFile(cursorPath, String(content), 'utf8');
      }
    } else {
      if (project.sshHost) {
        const claudePath = path.posix.join(project.path, 'CLAUDE.md');
        const agentsPath = path.posix.join(project.path, 'AGENTS.md');
        await writeRemoteTextFile(project.sshHost, claudePath, String(content));
        try {
          await runSsh(project.sshHost, [
            'set -e',
            `rm -f -- ${shellQuote(agentsPath)}`,
            `ln -s CLAUDE.md ${shellQuote(agentsPath)}`
          ].join('; '));
          const check = await runSsh(
            project.sshHost,
            `if [ -L ${shellQuote(agentsPath)} ] && [ "$(readlink ${shellQuote(agentsPath)})" = "CLAUDE.md" ]; then echo ok; fi`
          );
          agentsSymlinkOk = check.trim() === 'ok';
        } catch {
          await writeRemoteTextFile(project.sshHost, agentsPath, String(content));
          agentsSymlinkOk = false;
        }
      } else {
        const claudePath = path.join(project.path, 'CLAUDE.md');
        const agentsPath = path.join(project.path, 'AGENTS.md');
        await fs.writeFile(claudePath, String(content), 'utf8');
        try {
          const stat = await fs.lstat(agentsPath);
          if (stat.isSymbolicLink()) {
            const target = await fs.readlink(agentsPath);
            agentsSymlinkOk = target === 'CLAUDE.md' || path.resolve(project.path, target) === claudePath;
          } else {
            await fs.writeFile(agentsPath, String(content), 'utf8');
          }
        } catch (error) {
          if (error.code === 'ENOENT') {
            await fs.symlink('CLAUDE.md', agentsPath);
            agentsSymlinkOk = true;
          } else {
            throw error;
          }
        }
      }
    }

    const updated = await updateProject(project.id, (draft) => {
      draft.agentsSymlinkOk = agentsSymlinkOk;
    });

    await trackEvent('project.agents_updated', {
      projectId: project.id,
      projectName: project.name,
      agentId: normalizedAgentId
    });

    res.json({ project: await sanitizeProjectLive(updated) });
  } catch (error) {
    await trackAlert('project.agents_update_failed', {
      projectId: project.id,
      error: error.message
    }, 'warning');
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:projectId/docs', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const { relativePath, content } = req.body || {};
  if (!relativePath || content === undefined) {
    res.status(400).json({ error: 'relativePath and content are required' });
    return;
  }

  const docsRoot = path.join(project.path, 'docs');
  const targetPath = path.resolve(docsRoot, String(relativePath));
  const normalizedRoot = path.resolve(docsRoot);
  if (!(targetPath === normalizedRoot || targetPath.startsWith(`${normalizedRoot}${path.sep}`))) {
    res.status(400).json({ error: 'relativePath must stay under docs/' });
    return;
  }

  try {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, String(content), 'utf8');
    await trackEvent('project.docs_updated', {
      projectId: project.id,
      projectName: project.name,
      relativePath: String(relativePath)
    });
    res.json({ ok: true, file: targetPath });
  } catch (error) {
    await trackAlert('project.docs_update_failed', {
      projectId: project.id,
      relativePath: String(relativePath),
      error: error.message
    }, 'warning');
    res.status(500).json({ error: error.message });
  }
});

async function listProjectSessionWorktrees(project) {
  if (!(await detectIsGitRepoForProject(project))) {
    return [];
  }
  const root = await resolveWorktreeRootForProject(project);
  return listGitWorktrees(project, { runRemote: runSsh, worktreeRoot: root });
}

async function resolveSessionWorkspace(project, workspacePayload) {
  const mode = String(workspacePayload?.mode || 'main').trim().toLowerCase();
  const isGit = await detectIsGitRepoForProject(project);
  if (!isGit || mode === 'main') {
    return { workspacePath: project.path, workspaceName: 'main', created: false };
  }
  const root = await resolveWorktreeRootForProject(project);
  if (mode === 'create') {
    const name = String(workspacePayload?.name || '').trim();
    if (!name) {
      throw new Error('worktree name is required for mode=create');
    }
    const created = await createGitWorktree(project, {
      name,
      rootDir: root,
      baseRef: String(workspacePayload?.baseRef || 'HEAD').trim() || 'HEAD',
      runRemote: runSsh
    });
    return { workspacePath: created.path, workspaceName: created.name, created: true };
  }
  if (mode === 'worktree') {
    const name = String(workspacePayload?.name || '').trim();
    if (!name) {
      throw new Error('worktree name is required for mode=worktree');
    }
    const worktrees = await listGitWorktrees(project, { runRemote: runSsh, worktreeRoot: root });
    const selected = worktrees.find((item) => item.name === name || item.id === name);
    if (!selected) {
      throw new Error(`Unknown worktree "${name}".`);
    }
    return { workspacePath: selected.path, workspaceName: selected.name, created: false };
  }
  throw new Error('workspace.mode must be one of main, worktree, create');
}

app.get('/api/projects/:projectId/worktrees', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  if (!(await detectIsGitRepoForProject(project))) {
    res.json({ worktrees: [] });
    return;
  }
  try {
    const worktrees = await listProjectSessionWorktrees(project);
    res.json({
      worktrees: [
        { id: 'main', name: 'main', path: project.path, kind: 'main' },
        ...worktrees.map((item) => ({ ...item, kind: 'worktree' }))
      ]
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/projects/:projectId/git-refs', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  if (!(await detectIsGitRepoForProject(project))) {
    res.json({ refs: [] });
    return;
  }
  try {
    const refs = await listGitRefs(project, { runRemote: runSsh });
    res.json({ refs });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/projects/:projectId/worktrees', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  if (!(await detectIsGitRepoForProject(project))) {
    res.status(400).json({ error: 'Project is not a git repository.' });
    return;
  }
  const name = String(req.body?.name || '').trim();
  const baseRef = String(req.body?.baseRef || 'HEAD').trim() || 'HEAD';
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  try {
    const created = await createGitWorktree(project, {
      name,
      baseRef,
      rootDir: await resolveWorktreeRootForProject(project),
      runRemote: runSsh
    });
    res.status(201).json({ worktree: { ...created, kind: 'worktree' } });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/projects/:projectId/sessions', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const { kind, command, workspace, prompt, memoryQuery, memoryLimit } = req.body || {};
  if (!kind) {
    res.status(400).json({ error: 'kind is required' });
    return;
  }

  try {
    let launchPrompt = String(prompt || '').trim();
    if (AGENT_SESSION_KINDS.has(String(kind || '').trim().toLowerCase())) {
      const query = String(memoryQuery || '').trim();
      if (query) {
        const recalled = await memoryEngine.recall({
          projectId: project.id,
          query,
          limit: memoryLimit
        });
        const contextBlock = formatMemoryContextBlock(recalled);
        if (contextBlock) {
          launchPrompt = launchPrompt ? `${contextBlock}\n${launchPrompt}` : contextBlock;
          await trackEvent('memory.context_generated', {
            projectId: project.id,
            projectName: project.name,
            query,
            count: recalled.count,
            source: 'session.launch'
          });
        }
      }
    }

    const resolvedWorkspace = await resolveSessionWorkspace(project, workspace);
    const session = await spawnSession({
      project,
      kind,
      rawCommand: command,
      prompt: launchPrompt || undefined,
      workspacePath: resolvedWorkspace.workspacePath,
      workspaceName: resolvedWorkspace.workspaceName
    });
    await refreshSessions(getProject, currentState().projects);
    res.status(201).json({ session });
  } catch (error) {
    if (error.code === 'MISSING_CLI' || error.code === 'AGENT_EXITED_EARLY') {
      res.status(400).json({
        error: error.message,
        code: error.code,
        kind: error.kind
      });
      return;
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:projectId/sessions/stop-all', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  const stopped = await stopSessionsForProject(project.id);
  await refreshSessions(getProject, currentState().projects);
  res.json({ ok: true, stopped });
});

app.get('/api/projects/:projectId/automations', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const ids = await listAutomationIds(project);
    const automations = [];
    for (const id of ids) {
      try {
        const raw = await readAutomationRaw(project, id);
        const parsed = parseAutomationPayload(raw, id.replace(/\.json$/i, ''));
        automations.push({
          id,
          name: parsed.name,
          sessionCount: parsed.sessions.length
        });
      } catch (error) {
        automations.push({
          id,
          name: id.replace(/\.json$/i, ''),
          sessionCount: 0,
          invalid: true,
          error: error.message
        });
      }
    }
    res.json({ automations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:projectId/automations/run', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const automationId = String(req.body?.automationId || '').trim();
  if (!automationId) {
    res.status(400).json({ error: 'automationId is required' });
    return;
  }

  try {
    const raw = await readAutomationRaw(project, automationId);
    const automation = parseAutomationPayload(raw, automationId.replace(/\.json$/i, ''));
    const launched = [];
    for (const spec of automation.sessions) {
      const session = await spawnSession({
        project,
        kind: spec.kind,
        rawCommand: spec.command
      });
      launched.push(session);
    }
    await refreshSessions(getProject, currentState().projects);
    await trackEvent('project.automation_ran', {
      projectId: project.id,
      projectName: project.name,
      automationId,
      automationName: automation.name,
      launchedCount: launched.length
    });
    res.status(201).json({
      ok: true,
      automation: {
        id: automationId,
        name: automation.name
      },
      launched
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/sessions/:sessionId', async (req, res) => {
  const session = await stopSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  await refreshSessions(getProject, currentState().projects);
  res.json({ stopped: session });
});

app.get('/api/settings/memory', (_req, res) => {
  res.json({ memory: projectMemorySettings() });
});

app.post('/api/settings/memory', async (req, res) => {
  const payload = req.body?.memory && typeof req.body.memory === 'object'
    ? req.body.memory
    : (req.body && typeof req.body === 'object' ? req.body : {});
  try {
    const settings = await updateSettings((draft) => ({
      ...draft,
      memory: {
        ...(draft.memory || {}),
        ...payload,
        vectorStore: {
          ...(draft.memory?.vectorStore || {}),
          ...(payload.vectorStore || {})
        }
      }
    }));
    res.json({ memory: settings.memory });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/settings/memory/vector/onboarding-start', async (_req, res) => {
  try {
    const result = await startDefaultVectorStore();
    await trackEvent('memory.vector_store.onboarding_start', result, 'info');
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    await trackAlert('memory.vector_store.onboarding_failed', { error: error.message }, 'warning');
    res.status(500).json({ error: error.message });
  }
});

async function handleProxyRequest(req, res, project = null) {
  const targetName = req.params.target;
  const targetUrl = currentState().settings.proxyTargets[targetName];
  if (!targetUrl) {
    res.status(404).json({ error: `No proxy target configured for ${targetName}` });
    return;
  }

  const projectId = project?.id
    || normalizeHeaderOrQuery(req.headers['x-apropos-project-id'])
    || normalizeHeaderOrQuery(req.query?.projectId);
  const sessionId = normalizeHeaderOrQuery(req.headers['x-apropos-session-id']) || normalizeHeaderOrQuery(req.query?.sessionId);
  const projectFromHeader = !project && projectId ? getProject(projectId) : null;
  const targetProject = project || projectFromHeader || null;

  const result = await proxyMcpRequest(targetName, targetUrl, req.body, {
    authorization: req.headers.authorization || ''
  }, {
    projectId: targetProject?.id || null,
    sessionId: sessionId || null
  });

  if (targetProject) {
    try {
      await maybeCaptureProxyMemory({
        project: targetProject,
        targetName,
        body: req.body,
        result,
        sessionId
      });
    } catch (error) {
      await trackAlert('memory.auto_capture_failed', {
        projectId: targetProject.id,
        targetName,
        error: error.message
      }, 'warning');
    }
  }

  res.status(result.status).json(result);
}

app.post('/api/proxy/:target', async (req, res) => {
  res.status(410).json({
    error: 'Legacy proxy route is disabled. Use /api/projects/:projectId/proxy/:target.'
  });
});

app.post('/api/projects/:projectId/proxy/:target', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  await handleProxyRequest(req, res, project);
});

app.get('/api/alerts', (_req, res) => {
  res.json({ alerts: getAlerts() });
});

app.post('/api/logs/clear', async (_req, res) => {
  try {
    clearEvents();
    await clearEventLog();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/alerts/:alertId', (req, res) => {
  const removed = dismissAlert(req.params.alertId);
  if (!removed) {
    res.status(404).json({ error: 'Alert not found' });
    return;
  }
  res.json({ ok: true });
});

app.post('/api/alerts/ack-project', (req, res) => {
  const projectId = String(req.body?.projectId || '').trim();
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }
  const removedCount = dismissAlertsForProject(projectId);
  res.json({ ok: true, removedCount, projectId });
});

app.delete('/api/alerts', (_req, res) => {
  const removedCount = clearAlerts();
  res.json({ ok: true, removedCount });
});

app.get('/projects/:projectId', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(publicDir, 'index.html'));
});

await loadState();
memoryEngine.start();

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname !== '/ws/terminal' && url.pathname !== '/ws/mcp-logs') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws, request) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === '/ws/mcp-logs') {
    const emitEvent = (event) => {
      const eventType = String(event?.type || '');
      if (!eventType.startsWith('proxy.') && !eventType.startsWith('memory.')) {
        return;
      }
      if (ws.readyState !== 1) {
        return;
      }
      ws.send(JSON.stringify({ type: 'mcp-log', event }));
    };

    const recent = getEvents()
      .filter((event) => {
        const type = String(event.type || '');
        return type.startsWith('proxy.') || type.startsWith('memory.');
      })
      .slice(0, 200)
      .reverse();
    ws.send(JSON.stringify({ type: 'mcp-log-bootstrap', events: recent }));
    const unsubscribe = subscribeEvents(emitEvent);
    ws.on('close', () => {
      unsubscribe();
    });
    return;
  }

  const sessionId = url.searchParams.get('sessionId');
  const session = listSessions().find((item) => item.id === sessionId);
  if (!session) {
    ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
    ws.close();
    return;
  }

  // Keep tmux mouse mode disabled so browser text selection/copy works reliably.
  execTmuxForSession(session, ['set-option', '-t', session.tmuxName, 'mouse', 'off'], () => {});
  // Hide tmux status bar in embedded terminals.
  execTmuxForSession(session, ['set-option', '-t', session.tmuxName, 'status', 'off'], () => {});
  // Reinforce global history depth in case tmux user config sets it very low.
  execTmuxForSession(session, ['set-window-option', '-g', 'history-limit', String(TMUX_HISTORY_LIMIT_LINES)], () => {});
  // Ensure deep tmux history for browser-backed scrolling.
  execTmuxForSession(session, ['set-window-option', '-t', session.tmuxName, 'history-limit', String(TMUX_HISTORY_LIMIT_LINES)], () => {});
  // Disable alternate screen so scrollback history is always accessible in
  // the browser terminal, regardless of session kind.
  execTmuxForSession(session, ['set-window-option', '-t', session.tmuxName, 'alternate-screen', 'off'], () => {});

  let ptyProcess;
  try {
    if (!ptyModule) {
      throw new Error('PTY unavailable');
    }
    const ptyBin = session.sshHost ? 'ssh' : TMUX_BIN;
    const ptyArgs = session.sshHost
      ? [...SSH_SHARED_ARGS, '-t', session.sshHost, buildRemoteTmuxCommand(['attach', '-t', session.tmuxName])]
      : ['attach', '-t', session.tmuxName];
    ptyProcess = ptyModule.spawn(ptyBin, ptyArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd: process.cwd(),
      env: {
        ...process.env,
        TMUX: '',
        TERM: 'xterm-256color'
      }
    });
  } catch (error) {
    // Fallback mode: use tmux capture-pane + send-keys when PTY attach is unavailable.
    let closed = false;
    let lastScreen = '';
    let renderScheduled = false;
    let fallbackHistorySent = false;
    ws.send(
      JSON.stringify({
        type: 'output',
        data: '\r\n[fallback terminal mode active]\r\n'
      })
    );

    const sendFallbackScrollbackHistory = () => {
      if (fallbackHistorySent || closed) {
        return;
      }
      fallbackHistorySent = true;
      execTmuxForSession(
        session,
        ['capture-pane', '-p', '-J', '-S', `-${TERMINAL_INITIAL_SCROLLBACK_LINES}`, '-t', session.tmuxName],
        (captureErr, stdout) => {
          if (captureErr || closed || ws.readyState !== ws.OPEN) {
            return;
          }
          const snapshot = String(stdout || '').replace(/\n+$/g, '');
          if (snapshot) {
            ws.send(JSON.stringify({ type: 'history', data: snapshot }));
          }
        }
      );
    };

    const renderScreen = () => {
      renderScheduled = false;
      execTmuxForSession(session, ['capture-pane', '-p', '-J', '-S', '-120', '-t', session.tmuxName], (captureErr, stdout) => {
        if (closed || captureErr) {
          return;
        }
        const normalized = String(stdout).replace(/\n+$/g, '');
        if (normalized !== lastScreen) {
          lastScreen = normalized;
          ws.send(JSON.stringify({ type: 'screen', data: normalized }));
          maybeTrackAgentQuestion(session, normalized);
        }
      });
    };

    const scheduleRender = (delayMs = 0) => {
      if (renderScheduled || closed) {
        return;
      }
      renderScheduled = true;
      setTimeout(renderScreen, delayMs);
    };

    sendFallbackScrollbackHistory();
    renderScreen();
    const timer = setInterval(() => {
      scheduleRender(0);
    }, 140);

    ws.on('message', (rawMessage) => {
      const parsed = safeJsonParse(String(rawMessage));
      if (!parsed) {
        return;
      }
      if (parsed.type === 'tmux-scroll') {
        applyTmuxScroll(session, parsed.lines);
        scheduleRender(10);
        return;
      }
      if (parsed.type !== 'input') {
        return;
      }
      const lastInput = ingestSessionInput(session.id, parsed.data);
      if (lastInput) {
        setSessionLastInput(session.id, lastInput);
        markAgentInput(session);
      }
      for (const chunk of splitInputChunks(String(parsed.data || ''))) {
        if (chunk.type === 'text') {
          execTmuxForSession(session, ['send-keys', '-t', session.tmuxName, '-l', chunk.value], () => {});
        } else if (chunk.type === 'enter') {
          execTmuxForSession(session, ['send-keys', '-t', session.tmuxName, 'C-m'], () => {});
        } else if (chunk.type === 'backspace') {
          execTmuxForSession(session, ['send-keys', '-t', session.tmuxName, 'BSpace'], () => {});
        } else if (chunk.type === 'key') {
          execTmuxForSession(session, ['send-keys', '-t', session.tmuxName, chunk.value], () => {});
        }
      }
      scheduleRender(10);
    });

    ws.on('close', () => {
      closed = true;
      clearInterval(timer);
    });
    return;
  }

  // Track whether the initial tmux redraw has arrived.  Resize events received
  // before that are deferred so tmux only redraws once (avoiding duplicate
  // content in the scrollback buffer).
  let initialRedrawReceived = false;
  let pendingResize = null;

  let historySent = false;

  function sendScrollbackHistory() {
    if (historySent) {
      return;
    }
    historySent = true;
    execTmuxForSession(
      session,
      ['capture-pane', '-p', '-J', '-S', `-${TERMINAL_INITIAL_SCROLLBACK_LINES}`, '-t', session.tmuxName],
      (captureErr, stdout) => {
        if (captureErr || ws.readyState !== ws.OPEN) {
          return;
        }
        const snapshot = String(stdout || '').replace(/\n+$/g, '');
        if (snapshot) {
          ws.send(JSON.stringify({ type: 'history', data: snapshot }));
        }
      }
    );
  }

  // Some sessions do not emit an initial redraw quickly; preload history
  // regardless so output scrollback is always available.
  setTimeout(sendScrollbackHistory, 400);

  ptyProcess.onData((data) => {
    ws.send(JSON.stringify({ type: 'output', data }));
    maybeTrackAgentQuestion(session, data);
    if (!initialRedrawReceived) {
      initialRedrawReceived = true;
      if (pendingResize) {
        const { cols, rows } = pendingResize;
        pendingResize = null;
        setTimeout(() => {
          try { ptyProcess.resize(cols, rows); } catch { /* ignore */ }
        }, 50);
      }
      // Send scrollback history after the initial PTY redraw so tmux's
      // terminal reset sequences don't clear the scrollback buffer.
      setTimeout(sendScrollbackHistory, 150);
    }
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'closed', exitCode: exitCode ?? null, signal: signal ?? null }));
      ws.close();
    }
  });

  ws.on('message', (rawMessage) => {
    const parsed = safeJsonParse(String(rawMessage));
    if (!parsed) {
      return;
    }
    if (parsed.type === 'tmux-scroll') {
      applyTmuxScroll(session, parsed.lines);
      return;
    }
    if (parsed.type === 'input') {
      const lastInput = ingestSessionInput(session.id, parsed.data);
      if (lastInput) {
        setSessionLastInput(session.id, lastInput);
        markAgentInput(session);
      }
      ptyProcess.write(parsed.data || '');
      return;
    }
    if (parsed.type === 'resize') {
      const cols = Number(parsed.cols || 120);
      const rows = Number(parsed.rows || 40);
      if (!initialRedrawReceived) {
        pendingResize = { cols, rows };
        return;
      }
      try {
        ptyProcess.resize(cols, rows);
      } catch {
        // ignore stale resize attempts
      }
    }
  });

  ws.on('close', () => {
    try {
      ptyProcess.kill();
    } catch {
      // ignore stale closes
    }
  });
});

server.listen(DEFAULT_PORT, () => {
  console.log(`apropos listening on http://localhost:${DEFAULT_PORT}`);
});

setInterval(() => {
  pollAgentSessionQuestions();
}, 2200);
