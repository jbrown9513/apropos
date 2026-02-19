import { execFile } from 'node:child_process';
import { nanoid } from 'nanoid';
import { trackAlert, trackEvent } from './events.js';
import { ensureSessionRulesFiles } from './plugins/vcs-mappings.js';

const sessions = [];
const SESSION_PREFIX_RE = /^([A-Za-z0-9_-]+)-(tmux|codex|claude|cursor|opencode)-([A-Za-z0-9_-]+)$/;
const TMUX_BIN = process.env.TMUX_BIN || '/opt/homebrew/bin/tmux';
const AGENT_KINDS = new Set(['codex', 'claude', 'cursor', 'opencode']);
const REMOTE_TMUX_CANDIDATES = [
  process.env.TMUX_BIN_REMOTE,
  process.env.TMUX_BIN,
  '/opt/homebrew/bin/tmux',
  '/usr/local/bin/tmux',
  '/usr/bin/tmux'
].filter(Boolean);
const TMUX_HISTORY_LIMIT_LINES = '50000';
const SSH_SHARED_ARGS = [
  '-o', 'ControlMaster=auto',
  '-o', 'ControlPersist=10m',
  '-o', 'ControlPath=/tmp/apropos-ssh-%C',
  '-o', 'ConnectTimeout=8',
  '-o', 'ServerAliveInterval=20',
  '-o', 'ServerAliveCountMax=3'
];

function shellQuote(value) {
  return `'${String(value ?? '').replace(/'/g, `'\\''`)}'`;
}

function sessionIdFrom(sshHost, tmuxName) {
  return `${sshHost || 'local'}:${tmuxName}`;
}

function commandName(command) {
  const first = String(command || '').trim().split(/\s+/)[0] || '';
  return first;
}

function runSsh(sshHost, command, cwd) {
  return new Promise((resolve, reject) => {
    const wrapped = cwd ? `cd ${shellQuote(cwd)} && ${command}` : command;
    execFile('ssh', [...SSH_SHARED_ARGS, sshHost, wrapped], (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function commandExists(command, project) {
  const executable = commandName(command);
  if (!executable) {
    return false;
  }

  const script = `command -v ${shellQuote(executable)} >/dev/null 2>&1`;
  if (project.sshHost) {
    // Use the user's login shell with -lic so interactive config files
    // (.bashrc, .zshrc) are sourced — tools installed via nvm/volta add
    // PATH entries there rather than in .profile.
    const remoteScript = `"$SHELL" -lic ${shellQuote(script)} 2>/dev/null`;
    try {
      await runSsh(project.sshHost, remoteScript, project.path);
      return true;
    } catch {
      return false;
    }
  }

  return new Promise((resolve) => {
    execFile('/bin/sh', ['-lc', script], { cwd: project.path }, (error) => {
      resolve(!error);
    });
  });
}

function runTmuxLocal(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(TMUX_BIN, args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function runTmuxRemote(sshHost, args, cwd) {
  const argsQuoted = args.map((arg) => shellQuote(arg)).join(' ');
  const candidates = REMOTE_TMUX_CANDIDATES.map((candidate) => shellQuote(candidate)).join(' ');
  const command = [
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
  return runSsh(sshHost, command, cwd);
}

function runTmuxForProject(project, args, cwd) {
  if (project?.sshHost) {
    return runTmuxRemote(project.sshHost, args, cwd);
  }
  return runTmuxLocal(args, cwd);
}

function runTmuxForSession(session, args) {
  if (session?.sshHost) {
    return runTmuxRemote(session.sshHost, args);
  }
  return runTmuxLocal(args);
}

function parseTmuxName(tmuxName) {
  const match = tmuxName.match(SESSION_PREFIX_RE);
  if (!match) {
    return null;
  }
  return {
    projectId: match[1],
    kind: match[2]
  };
}

function buildCommand(kind, rawCommand, projectPath, isRemote = false) {
  if (kind === 'tmux') {
    if (rawCommand) {
      return rawCommand;
    }
    const shell = process.env.SHELL || 'zsh';
    return `cd ${shellQuote(projectPath)} && exec ${shellQuote(shell)}`;
  }
  if (kind === 'codex') {
    return rawCommand || (isRemote ? 'npx -y @openai/codex' : 'codex');
  }
  if (kind === 'claude') {
    return rawCommand || 'claude';
  }
  if (kind === 'cursor') {
    return rawCommand || 'cursor-agent';
  }
  if (kind === 'opencode') {
    return rawCommand || 'opencode';
  }
  return rawCommand || process.env.SHELL || 'zsh';
}

function buildPromptCommand(_kind, command, _prompt) {
  const normalizedPrompt = String(_prompt ?? '').trim();
  if (!normalizedPrompt) {
    return command;
  }
  if (_kind === 'codex') {
    return `${command} ${shellQuote(normalizedPrompt)}`;
  }
  return command;
}

function deriveInitialLastInput({ prompt }) {
  const promptText = String(prompt || '').trim();
  if (promptText) {
    return promptText;
  }
  return '';
}

function normalizeTmuxSize(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return String(parsed);
}

async function tmuxSessionExists(project, tmuxName) {
  try {
    await runTmuxForProject(project, ['has-session', '-t', tmuxName], project.path);
    return true;
  } catch {
    return false;
  }
}

export function listSessions() {
  return sessions;
}

export function setSessionLastInput(sessionId, lastInput) {
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) {
    return null;
  }
  session.lastInput = String(lastInput || '').trim();
  return session;
}

export async function refreshSessions(projectLookup, projects = []) {
  const outputs = [];
  try {
    const localOutput = await runTmuxLocal(['list-sessions', '-F', '#{session_name}|#{session_created}']);
    outputs.push({ sshHost: null, output: localOutput });
  } catch {
    // Ignore hosts without tmux sessions.
  }

  const remoteHosts = [...new Set((projects || []).map((project) => project.sshHost).filter(Boolean))];
  await Promise.all(
    remoteHosts.map(async (sshHost) => {
      try {
        const output = await runTmuxRemote(sshHost, ['list-sessions', '-F', '#{session_name}|#{session_created}']);
        outputs.push({ sshHost, output });
      } catch {
        // Ignore hosts without tmux sessions.
      }
    })
  );

  if (!outputs.length) {
    sessions.length = 0;
    return sessions;
  }

  const next = [];
  for (const item of outputs) {
    for (const line of item.output.split('\n')) {
      if (!line.trim()) {
        continue;
      }
      const [tmuxName, createdRaw] = line.split('|');
      const parsed = parseTmuxName(tmuxName);
      if (!parsed) {
        continue;
      }
      const project = projectLookup(parsed.projectId);
      if (!project || (project.sshHost || null) !== item.sshHost) {
        continue;
      }

      const existing = sessions.find((session) => session.tmuxName === tmuxName && (session.sshHost || null) === item.sshHost);
      const startedAt = createdRaw ? new Date(Number(createdRaw) * 1000).toISOString() : new Date().toISOString();
      const inferredCommand = existing?.command || (parsed.kind === 'tmux' ? process.env.SHELL || 'zsh' : parsed.kind);
      next.push({
        id: sessionIdFrom(item.sshHost, tmuxName),
        projectId: parsed.projectId,
        projectName: project.name,
        kind: parsed.kind,
        command: inferredCommand,
        tmuxName,
        sshHost: item.sshHost || null,
        workspacePath: existing?.workspacePath || project.path,
        workspaceName: existing?.workspaceName || 'main',
        lastInput: existing?.lastInput || '',
        startedAt: existing?.startedAt || startedAt
      });
    }
  }

  sessions.length = 0;
  sessions.push(...next);
  return sessions;
}

export async function spawnSession({ project, kind, rawCommand, prompt, workspacePath, workspaceName }) {
  const sessionPath = String(workspacePath || project.path || '').trim() || project.path;
  const sessionWorkspaceName = String(workspaceName || 'main').trim() || 'main';
  const baseCommand = buildCommand(kind, rawCommand, sessionPath, Boolean(project.sshHost));
  const command = buildPromptCommand(kind, baseCommand, prompt);
  const promptInjectedInCommand = command !== baseCommand;
  const normalizedPrompt = String(prompt ?? '').trim();
  const initialLastInput = deriveInitialLastInput({ prompt });
  const tmuxName = `${project.id}-${kind}-${nanoid(5)}`;
  const tmuxWidth = normalizeTmuxSize(process.env.TMUX_COLS);
  const tmuxHeight = normalizeTmuxSize(process.env.TMUX_ROWS);
  if (AGENT_KINDS.has(kind)) {
    // Remote sessions skip preflight command existence checks to avoid an extra
    // SSH round trip and reduce launch latency.
    if (!project.sshHost) {
      const available = await commandExists(command, { ...project, path: sessionPath });
      if (!available) {
        const error = new Error(
          `${kind} is not installed. Download/install ${kind} and ensure it is on PATH, then retry.`
        );
        error.code = 'MISSING_CLI';
        error.kind = kind;
        throw error;
      }
    }
  }

  try {
    if (AGENT_KINDS.has(kind) && !project.sshHost) {
      await ensureSessionRulesFiles(sessionPath);
    }
    const newSessionArgs = ['new-session', '-d', '-s', tmuxName];
    if (tmuxWidth) {
      newSessionArgs.push('-x', tmuxWidth);
    }
    if (tmuxHeight) {
      newSessionArgs.push('-y', tmuxHeight);
    }
    // For remote agent sessions, launch from the user's login shell so agent
    // auth/env exports are available (Codex can stall without full login env).
    const tmuxCommand = project.sshHost && AGENT_KINDS.has(kind)
      ? `"$SHELL" -lic ${shellQuote(`exec ${command}`)}`
      : command;
    newSessionArgs.push('-c', sessionPath, tmuxCommand);
    await runTmuxForProject(project, newSessionArgs, sessionPath);
    try {
      // Reinforce global tmux history depth in case user config overrides it low.
      await runTmuxForProject(project, ['set-window-option', '-g', 'history-limit', TMUX_HISTORY_LIMIT_LINES], sessionPath);
      // Apply mouse mode after server/session creation so first launch works on hosts
      // where no tmux socket exists yet.
      await runTmuxForProject(project, ['set-option', '-t', tmuxName, 'mouse', 'off'], sessionPath);
      // Hide the tmux status bar in embedded terminals to avoid bright bottom bars.
      await runTmuxForProject(project, ['set-option', '-t', tmuxName, 'status', 'off'], sessionPath);
      await runTmuxForProject(project, ['set-window-option', '-t', tmuxName, 'history-limit', TMUX_HISTORY_LIMIT_LINES], sessionPath);
      if (AGENT_KINDS.has(kind)) {
        // Keep full-screen agent UIs in the main pane history so browser scrollback
        // can reveal prior output instead of a short alternate-screen buffer.
        await runTmuxForProject(project, ['set-window-option', '-t', tmuxName, 'alternate-screen', 'off'], sessionPath);
      }
    } catch {
      // Ignore optional tmux UI setting failures.
    }

    if (tmuxWidth || tmuxHeight) {
      // Some tmux versions ignore `new-session -x/-y` depending on client state.
      // Force the window size after session creation when explicit dimensions are set.
      const resizeArgs = ['resize-window', '-t', tmuxName];
      if (tmuxWidth) {
        resizeArgs.push('-x', tmuxWidth);
      }
      if (tmuxHeight) {
        resizeArgs.push('-y', tmuxHeight);
      }
      await runTmuxForProject(project, resizeArgs, sessionPath);
    }

    if (AGENT_KINDS.has(kind) && normalizedPrompt && !promptInjectedInCommand) {
      try {
        await runTmuxForProject(project, ['send-keys', '-t', tmuxName, '-l', normalizedPrompt], sessionPath);
        await runTmuxForProject(project, ['send-keys', '-t', tmuxName, 'C-m'], sessionPath);
      } catch {
        // Ignore prompt preload failures; session is already running.
      }
    }

    if (AGENT_KINDS.has(kind)) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      const alive = await tmuxSessionExists(project, tmuxName);
      if (!alive) {
        const where = project.sshHost ? `${project.sshHost}:${project.path}` : project.path;
        const error = new Error(
          `${kind} exited immediately after launch in ${where}. Run "${kind}" manually in that directory and fix the remote agent install/auth/environment.`
        );
        error.code = 'AGENT_EXITED_EARLY';
        error.kind = kind;
        throw error;
      }
    }
  } catch (error) {
    await trackAlert('session.launch_failed', {
      projectId: project.id,
      projectName: project.name,
      kind,
      command,
      error: error.message
    }, 'critical');
    throw error;
  }

  const session = {
    id: sessionIdFrom(project.sshHost, tmuxName),
    projectId: project.id,
    projectName: project.name,
    kind,
    command,
    tmuxName,
    sshHost: project.sshHost || null,
    workspacePath: sessionPath,
    workspaceName: sessionWorkspaceName,
    lastInput: initialLastInput,
    startedAt: new Date().toISOString()
  };
  sessions.unshift(session);

  await trackEvent('session.started', {
    projectId: project.id,
    projectName: project.name,
    kind,
    tmuxName,
    command,
    workspacePath: sessionPath,
    workspaceName: sessionWorkspaceName,
    sshHost: project.sshHost || null
  });

  return session;
}

export async function stopSession(sessionId) {
  const index = sessions.findIndex((item) => item.id === sessionId);
  if (index === -1) {
    return null;
  }
  const session = sessions[index];
  try {
    await runTmuxForSession(session, ['kill-session', '-t', session.tmuxName]);
  } catch {
    // Ignore stale tmux sessions and continue cleanup.
  }
  sessions.splice(index, 1);

  await trackEvent('session.stopped', {
    projectId: session.projectId,
    projectName: session.projectName,
    kind: session.kind,
    tmuxName: session.tmuxName,
    sshHost: session.sshHost || null
  });

  return session;
}

export async function stopSessionsForProject(projectId) {
  const matches = sessions.filter((item) => item.projectId === projectId);
  for (const session of matches) {
    await stopSession(session.id);
  }
  return matches.length;
}
