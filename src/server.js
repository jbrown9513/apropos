import express from 'express';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { DEFAULT_PORT, APROPOS_HOME } from './constants.js';
import { trackAlert, trackEvent, getAlerts, getEvents, dismissAlert, subscribeEvents, clearEvents, clearAlerts } from './events.js';
import { writeCodexMcpConfig, writeClaudeMcpConfig } from './mcp-config.js';
import { ensureProjectLayout } from './project-scaffold.js';
import { inspectProjectConfiguration } from './project-inspector.js';
import { proxyMcpRequest } from './proxy.js';
import { spawnSession, listSessions, refreshSessions, setSessionLastInput, stopSession, stopSessionsForProject } from './sessions.js';
import {
  addProject,
  currentState,
  clearEventLog,
  getMcpCatalog,
  getProject,
  loadState,
  removeProject,
  sanitizeProject,
  updateSettings,
  updateFolderState,
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
const AGENT_SESSION_KINDS = new Set(['codex', 'claude']);
const AGENT_IDLE_MS = 2600;
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
- \`kind\`: one of \`tmux\`, \`codex\`, \`claude\`
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
    { "kind": "tmux", "command": "npm run dev" }
  ]
}
\`\`\`
`
  },
  {
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
- \`http://127.0.0.1:4311/api/proxy/codex\`
- \`http://127.0.0.1:4311/api/proxy/claude\`
3. Verify basic connectivity and report changes.
`
  }
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

function runGit(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd }, (error, stdout, stderr) => {
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

function mcpRepoCloneDir(repoId) {
  return path.join(APROPOS_HOME, 'mcp', repoId);
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

async function syncMcpRepository(gitUrl, repoId) {
  const cloneRoot = path.join(APROPOS_HOME, 'mcp');
  await ensureDir(cloneRoot);
  const repoPath = mcpRepoCloneDir(repoId);
  let exists = false;
  try {
    const stat = await fs.stat(path.join(repoPath, '.git'));
    exists = stat.isDirectory();
  } catch {
    exists = false;
  }

  if (!exists) {
    await runGit(['clone', '--depth', '1', gitUrl, repoPath], process.cwd());
  } else {
    await runGit(['-C', repoPath, 'pull', '--ff-only'], process.cwd());
  }
  const tools = await parseCatalogFromRepository(repoPath, gitUrl);
  return { repoPath, tools };
}

async function detectIsGitRepo(projectPath) {
  try {
    await fs.access(path.join(projectPath, '.git'));
    return true;
  } catch {
    // Continue with git command detection.
  }

  try {
    const result = await runGit(['rev-parse', '--is-inside-work-tree'], projectPath);
    return result === 'true';
  } catch {
    return false;
  }
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
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, ' ')
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
    execFile('ssh', [sshHost, command], (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function execTmuxForSession(session, args, callback) {
  if (session.sshHost) {
    const command = buildRemoteTmuxCommand(args);
    execFile('ssh', [session.sshHost, command], callback);
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

function projectSkillFile(project, orchestrator, slug) {
  if (project.sshHost) {
    const base = orchestrator === 'codex' ? '.codex' : '.claude';
    return path.posix.join(project.path, base, 'skills', slug, 'SKILL.md');
  }
  const base = orchestrator === 'codex' ? '.codex' : '.claude';
  return path.join(project.path, base, 'skills', slug, 'SKILL.md');
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
  const skillPathHint = orchestrator === 'codex'
    ? `${project.path}/.codex/skills/$skil-name/SKILL.md`
    : `${project.path}/.claude/skills/$skil-name/SKILL.md`;
  return [
    `Create a new ${orchestrator} skill.`,
    `Choose a slug for the skill and write SKILL.md to ${skillPathHint}.`,
    `Use your ${orchestrator} skill-builder workflow and produce a complete SKILL.md.`,
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
    if (!['tmux', 'codex', 'claude'].includes(kind)) {
      throw new Error(`sessions[${index}].kind must be tmux, codex, or claude`);
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
    lastPaneFingerprint: '',
    lastPaneChangedAtMs: 0
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
}

function pollAgentSessionQuestions() {
  for (const session of listSessions()) {
    if (!AGENT_SESSION_KINDS.has(session.kind)) {
      continue;
    }
    execTmuxForSession(session, ['capture-pane', '-p', '-J', '-S', '-120', '-t', session.tmuxName], (error, stdout) => {
      if (error) {
        return;
      }
      maybeTrackAgentQuestion(session, stdout);
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
  if (!['codex', 'claude'].includes(normalizedTarget)) {
    throw new Error('Skill target must be codex or claude');
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
  const codexSkillDir = path.posix.join(projectPath, '.codex', 'skills', slug);
  const claudeSkillDir = path.posix.join(projectPath, '.claude', 'skills', slug);

  const steps = ['set -e'];
  if (normalizedTarget === 'codex') {
    const codexFile = path.posix.join(codexSkillDir, 'SKILL.md');
    steps.push(`mkdir -p ${shellQuote(codexSkillDir)}`);
    steps.push(`printf %s ${shellQuote(normalizedContent)} > ${shellQuote(codexFile)}`);
    written.push(codexFile);
  } else {
    steps.push(`rm -rf -- ${shellQuote(codexSkillDir)}`);
    removed.push(codexSkillDir);
  }

  if (normalizedTarget === 'claude') {
    const claudeFile = path.posix.join(claudeSkillDir, 'SKILL.md');
    steps.push(`mkdir -p ${shellQuote(claudeSkillDir)}`);
    steps.push(`printf %s ${shellQuote(normalizedContent)} > ${shellQuote(claudeFile)}`);
    written.push(claudeFile);
  } else {
    steps.push(`rm -rf -- ${shellQuote(claudeSkillDir)}`);
    removed.push(claudeSkillDir);
  }

  await runSsh(sshHost, steps.join('; '));
  return { slug, written, removed };
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
  const claudePayload = JSON.stringify({
    mcpServers: Object.fromEntries((tools || []).map((tool) => [tool.id, {
      command: tool.command,
      args: Array.isArray(tool.args) ? tool.args : []
    }]))
  }, null, 2) + '\n';
  const codexPayload = buildCodexTomlForTools(tools);
  await runSsh(sshHost, [
    'set -e',
    `mkdir -p ${shellQuote(codexDir)}`,
    `printf %s ${shellQuote(claudePayload)} > ${shellQuote(claudePath)}`,
    `printf %s ${shellQuote(codexPayload)} > ${shellQuote(codexPath)}`
  ].join('; '));
}

async function removeSkillRemote(sshHost, projectPath, slug) {
  const codexSkillDir = path.posix.join(projectPath, '.codex', 'skills', slug);
  const claudeSkillDir = path.posix.join(projectPath, '.claude', 'skills', slug);
  await runSsh(sshHost, [
    'set -e',
    `rm -rf -- ${shellQuote(codexSkillDir)}`,
    `rm -rf -- ${shellQuote(claudeSkillDir)}`
  ].join('; '));
  return {
    removed: [codexSkillDir, claudeSkillDir]
  };
}

async function installDefaultSkills(project) {
  for (const spec of DEFAULT_PROJECT_SKILLS) {
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
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.get('/api/dashboard', async (_req, res) => {
  await refreshSessions(getProject, currentState().projects);
  const state = currentState();
  const catalog = getMcpCatalog();
  const projects = await Promise.all(
    state.projects.map(async (project) => {
      const sanitized = sanitizeProject(project);
      const inspected = await inspectProjectConfiguration(project, catalog);
      return {
        ...sanitized,
        mcpTools: inspected.mcpTools,
        skills: inspected.skills,
        structure: inspected.structure
      };
    })
  );
  res.json({
    settings: state.settings,
    mcpCatalog: catalog,
    projects,
    projectFolders: state.projectFolders || [],
    projectFolderByProject: state.projectFolderByProject || {},
    activeFolderId: state.activeFolderId || null,
    sessions: listSessions(),
    alerts: getAlerts().slice(0, 100),
    events: getEvents().slice(0, 100)
  });
});

app.get('/api/mcp/repositories', (_req, res) => {
  const repositories = currentState().settings.mcpRepositories || [];
  res.json({ repositories, catalog: getMcpCatalog() });
});

app.post('/api/mcp/repositories', async (req, res) => {
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
    const synced = await syncMcpRepository(gitUrl, repoId);
    const updatedSettings = await updateSettings((settings) => {
      const repositories = Array.isArray(settings.mcpRepositories) ? settings.mcpRepositories.slice() : [];
      const nextRepo = {
        id: repoId,
        name: repoName,
        gitUrl,
        tools: synced.tools
      };
      const index = repositories.findIndex((item) => item.id === repoId || item.gitUrl === gitUrl);
      if (index >= 0) {
        repositories[index] = {
          ...repositories[index],
          ...nextRepo
        };
      } else {
        repositories.push(nextRepo);
      }
      return {
        ...settings,
        mcpRepositoryBase: gitUrl,
        mcpRepositories: repositories
      };
    });

    await trackEvent('mcp.repository_added', {
      repoId,
      repoName,
      gitUrl,
      toolCount: synced.tools.length
    });

    const repository = (updatedSettings.mcpRepositories || []).find((item) => item.id === repoId) || null;
    res.status(201).json({
      ok: true,
      repository: repository ? { ...repository, clonePath: synced.repoPath } : null,
      catalog: getMcpCatalog()
    });
  } catch (error) {
    await trackAlert('mcp.repository_add_failed', { gitUrl, error: error.message }, 'warning');
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/mcp/repositories/:repoId/sync', async (req, res) => {
  const repoId = String(req.params.repoId || '').trim();
  if (!repoId) {
    res.status(400).json({ error: 'repoId is required' });
    return;
  }
  const repositories = currentState().settings.mcpRepositories || [];
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
    const synced = await syncMcpRepository(repository.gitUrl, repoId);
    const updatedSettings = await updateSettings((settings) => {
      const nextRepositories = Array.isArray(settings.mcpRepositories) ? settings.mcpRepositories.slice() : [];
      const index = nextRepositories.findIndex((item) => item.id === repoId);
      if (index >= 0) {
        nextRepositories[index] = {
          ...nextRepositories[index],
          tools: synced.tools
        };
      }
      return {
        ...settings,
        mcpRepositories: nextRepositories
      };
    });
    await trackEvent('mcp.repository_synced', {
      repoId,
      gitUrl: repository.gitUrl,
      toolCount: synced.tools.length
    });
    res.json({
      ok: true,
      repository: (() => {
        const updatedRepo = (updatedSettings.mcpRepositories || []).find((item) => item.id === repoId) || null;
        return updatedRepo ? { ...updatedRepo, clonePath: synced.repoPath } : null;
      })(),
      catalog: getMcpCatalog()
    });
  } catch (error) {
    await trackAlert('mcp.repository_sync_failed', {
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
      detectedIsGit = await detectIsGitRepo(normalizedProjectPath);
      scaffold = await ensureProjectLayout(normalizedProjectPath);
    }

    const project = await addProject({
      name: finalName,
      projectPath: normalizedProjectPath,
      isGit: detectedIsGit,
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

    res.status(201).json({ project: sanitizeProject(getProject(project.id)) });
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
    res.json({ project: sanitizeProject(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
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

    await trackEvent('project.deleted', {
      projectId: project.id,
      projectName: project.name,
      projectPath: project.path,
      deleteFiles,
      stoppedSessions
    });

    res.json({ project: sanitizeProject(removed), deleteFiles, stoppedSessions });
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
  const tool = getMcpCatalog().find((item) => item.id === toolId);
  if (!tool) {
    res.status(400).json({ error: 'Unknown toolId' });
    return;
  }

  try {
    const updated = await updateProject(project.id, (draft) => {
      if (!draft.mcpTools.find((item) => item.id === tool.id)) {
        draft.mcpTools.push(tool);
      }
    });

    if (project.sshHost) {
      await writeMcpConfigRemote(project.sshHost, project.path, updated.mcpTools);
    } else {
      await writeClaudeMcpConfig(project.path, updated.mcpTools);
      await writeCodexMcpConfig(project.path, updated.mcpTools);
    }

    await trackEvent('project.mcp_tool_added', {
      projectId: project.id,
      projectName: project.name,
      toolId: tool.id
    });

    res.json({ project: sanitizeProject(updated) });
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
  const tool = getMcpCatalog().find((item) => item.id === toolId);
  if (!tool) {
    res.status(400).json({ error: 'Unknown toolId' });
    return;
  }

  try {
    const updated = await updateProject(project.id, (draft) => {
      if (!draft.mcpTools.find((item) => item.id === tool.id)) {
        draft.mcpTools.push(tool);
      }
    });

    if (project.sshHost) {
      await writeMcpConfigRemote(project.sshHost, project.path, updated.mcpTools);
    } else {
      await writeClaudeMcpConfig(project.path, updated.mcpTools);
      await writeCodexMcpConfig(project.path, updated.mcpTools);
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
          `Proxy endpoint: http://127.0.0.1:${DEFAULT_PORT}/api/proxy/${orchestrator}`,
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
      project: sanitizeProject(updated),
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
    const updated = await updateProject(project.id, (draft) => {
      draft.mcpTools = (draft.mcpTools || []).filter((item) => item.id !== toolId);
    });

    if (project.sshHost) {
      await writeMcpConfigRemote(project.sshHost, project.path, updated.mcpTools);
    } else {
      await writeClaudeMcpConfig(project.path, updated.mcpTools);
      await writeCodexMcpConfig(project.path, updated.mcpTools);
    }

    await trackEvent('project.mcp_tool_removed', {
      projectId: project.id,
      projectName: project.name,
      toolId
    });

    res.json({ project: sanitizeProject(updated) });
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

    if (kind === 'docs') {
      const relativePath = String(req.query.relativePath || 'README.md').trim();
      if (!relativePath) {
        res.status(400).json({ error: 'relativePath is required for docs' });
        return;
      }
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

    if (kind === 'docs-files') {
      const docsRoot = path.join(project.path, 'docs');
      const files = await listDocsFilesRecursive(docsRoot);
      res.json({ kind, files });
      return;
    }

    if (kind === 'skills') {
      const requestedName = String(req.query.name || '').trim();
      const skill = requestedName
        ? (project.skills || []).find((item) => item.name === requestedName || item.id === requestedName)
        : project.skills?.[0];
      const name = requestedName || skill?.name || skill?.id || '';
      const target = String(skill?.target || 'codex').trim().toLowerCase();
      const slug = slugifySkillName(name || skill?.id || 'skill');
      const candidates = [];
      if (target === 'codex') {
        candidates.push(path.join(project.path, '.codex', 'skills', slug, 'SKILL.md'));
      } else if (target === 'claude') {
        candidates.push(path.join(project.path, '.claude', 'skills', slug, 'SKILL.md'));
      } else {
        candidates.push(path.join(project.path, '.codex', 'skills', slug, 'SKILL.md'));
        candidates.push(path.join(project.path, '.claude', 'skills', slug, 'SKILL.md'));
      }
      for (const filePath of candidates) {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          res.json({ kind, name, target, content, source: filePath });
          return;
        } catch (error) {
          if (error.code !== 'ENOENT') {
            throw error;
          }
        }
      }
      res.json({ kind, name, target, content: '', source: null });
      return;
    }

    if (kind === 'mcp') {
      const configured = (project.mcpTools || []).map((tool) => tool.id);
      const repositories = currentState().settings.mcpRepositories || [];
      const catalog = getMcpCatalog();
      res.json({ kind, configured, repositories, catalog });
      return;
    }

    res.status(400).json({ error: 'Unsupported kind' });
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
  if (!['codex', 'claude'].includes(String(target).trim())) {
    res.status(400).json({ error: 'target must be codex or claude' });
    return;
  }

  try {
    const result = await writeSkill(project.path, { name, content, target });
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

    res.json({ project: sanitizeProject(updated), files: result.written });
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
      const codexSkillDir = path.join(project.path, '.codex', 'skills', slug);
      const claudeSkillDir = path.join(project.path, '.claude', 'skills', slug);
      await fs.rm(codexSkillDir, { recursive: true, force: true });
      await fs.rm(claudeSkillDir, { recursive: true, force: true });
      removedFiles = [codexSkillDir, claudeSkillDir];
    }

    const updated = await updateProject(project.id, (draft) => {
      draft.skills = (draft.skills || []).filter((item) => item.id !== slug);
    });

    await trackEvent('project.skill_removed', {
      projectId: project.id,
      projectName: project.name,
      skillId: slug
    });

    res.json({ ok: true, removed: removedFiles, project: sanitizeProject(updated) });
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
      if (!['codex', 'claude'].includes(requestedOrchestrator)) {
        res.status(400).json({ error: 'orchestrator must be codex or claude for mode=add' });
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
      orchestrator = String(skill.target || '').trim().toLowerCase();
      if (!['codex', 'claude'].includes(orchestrator)) {
        res.status(400).json({ error: 'Skill target must be codex or claude' });
        return;
      }
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
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:projectId/agents', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const { content } = req.body || {};
  if (!content) {
    res.status(400).json({ error: 'content is required' });
    return;
  }

  try {
    const claudePath = path.join(project.path, 'CLAUDE.md');
    const agentsPath = path.join(project.path, 'AGENTS.md');
    await fs.writeFile(claudePath, String(content), 'utf8');

    let agentsSymlinkOk = false;
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

    const updated = await updateProject(project.id, (draft) => {
      draft.agentsSymlinkOk = agentsSymlinkOk;
    });

    await trackEvent('project.agents_updated', {
      projectId: project.id,
      projectName: project.name
    });

    res.json({ project: sanitizeProject(updated) });
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

app.post('/api/projects/:projectId/sessions', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const { kind, command } = req.body || {};
  if (!kind) {
    res.status(400).json({ error: 'kind is required' });
    return;
  }

  try {
    const session = await spawnSession({ project, kind, rawCommand: command });
    await refreshSessions(getProject, currentState().projects);
    res.status(201).json({ session });
  } catch (error) {
    if (error.code === 'MISSING_CLI') {
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

app.post('/api/proxy/:target', async (req, res) => {
  const targetName = req.params.target;
  const targetUrl = currentState().settings.proxyTargets[targetName];
  if (!targetUrl) {
    res.status(404).json({ error: `No proxy target configured for ${targetName}` });
    return;
  }

  const result = await proxyMcpRequest(targetName, targetUrl, req.body, {
    authorization: req.headers.authorization || ''
  });
  res.status(result.status).json(result);
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

app.delete('/api/alerts', (_req, res) => {
  const removedCount = clearAlerts();
  res.json({ ok: true, removedCount });
});

app.get('/projects/:projectId', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(publicDir, 'index.html'));
});

await loadState();

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
      if (!event?.type || !String(event.type).startsWith('proxy.')) {
        return;
      }
      if (ws.readyState !== 1) {
        return;
      }
      ws.send(JSON.stringify({ type: 'mcp-log', event }));
    };

    const recent = getEvents()
      .filter((event) => String(event.type || '').startsWith('proxy.'))
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

  let ptyProcess;
  try {
    if (!ptyModule) {
      throw new Error('PTY unavailable');
    }
    const ptyBin = session.sshHost ? 'ssh' : TMUX_BIN;
    const ptyArgs = session.sshHost
      ? ['-t', session.sshHost, buildRemoteTmuxCommand(['attach', '-t', session.tmuxName])]
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
    ws.send(
      JSON.stringify({
        type: 'output',
        data: '\r\n[fallback terminal mode active]\r\n'
      })
    );

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

    renderScreen();
    const timer = setInterval(() => {
      scheduleRender(0);
    }, 140);

    ws.on('message', (rawMessage) => {
      const parsed = safeJsonParse(String(rawMessage));
      if (!parsed || parsed.type !== 'input') {
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

  ptyProcess.onData((data) => {
    ws.send(JSON.stringify({ type: 'output', data }));
    maybeTrackAgentQuestion(session, data);
  });

  // Send the current tmux pane on initial attach so existing sessions are visible immediately.
  execTmuxForSession(session, ['capture-pane', '-p', '-J', '-S', '-120', '-t', session.tmuxName], (captureErr, stdout) => {
    if (captureErr || ws.readyState !== ws.OPEN) {
      return;
    }
    const snapshot = String(stdout || '').replace(/\n+$/g, '');
    if (snapshot) {
      ws.send(JSON.stringify({ type: 'screen', data: snapshot }));
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
