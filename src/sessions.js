import { execFile } from 'node:child_process';
import { nanoid } from 'nanoid';
import { trackAlert, trackEvent } from './events.js';
import { buildVcsRulesContentForWorkspace, ensureSessionRulesFiles } from './plugins/vcs-mappings.js';

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
const AGENT_INSTALL_DOCS = {
  codex: 'https://github.com/openai/codex',
  claude: 'https://docs.anthropic.com/en/docs/claude-code/quickstart',
  cursor: 'https://cursor.com/cli',
  opencode: 'https://opencode.ai/'
};
const AGENT_BREW_PACKAGES = {
  codex: ['codex'],
  claude: ['claude-code'],
  cursor: ['cursor-cli', 'cursor-agent', '--cask cursor'],
  opencode: ['opencode']
};
const SSH_SHARED_ARGS = [
  '-o', 'ControlMaster=no',
  '-o', 'ControlPath=none',
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
  const script = cwd ? `cd ${shellQuote(cwd)} && ${command}` : String(command || '');
  const encoded = Buffer.from(script, 'utf8').toString('base64');
  const bootstrap = [
    'tmp_file="$(mktemp /tmp/apropos-cmd-XXXXXX.sh 2>/dev/null || mktemp)"',
    `if printf %s QQ== | base64 -d >/dev/null 2>&1; then printf %s ${encoded} | base64 -d > "$tmp_file"; else printf %s ${encoded} | base64 -D > "$tmp_file"; fi`,
    '/bin/sh "$tmp_file"',
    'status=$?',
    'rm -f -- "$tmp_file"',
    'exit "$status"'
  ].join('; ');
  const wrapped = `/bin/sh -c ${shellQuote(bootstrap)}`;
  return new Promise((resolve, reject) => {
    execFile('ssh', [...SSH_SHARED_ARGS, sshHost, wrapped], (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function ensureSessionRulesFilesRemote(workspacePath, sshHost) {
  const content = await buildVcsRulesContentForWorkspace(workspacePath);
  const targets = [
    `${workspacePath.replace(/[\\]+/g, '/')}/codex/rules/apropos-vcs.md`,
    `${workspacePath.replace(/[\\]+/g, '/')}/.codex/rules/apropos-vcs.md`,
    `${workspacePath.replace(/[\\]+/g, '/')}/.claude/rules/apropos-vcs.md`
  ];
  const commands = ['set -e'];
  for (const target of targets) {
    const dir = target.slice(0, target.lastIndexOf('/'));
    commands.push(`mkdir -p ${shellQuote(dir)}`);
    commands.push(`printf %s ${shellQuote(content + '\n')} > ${shellQuote(target)}`);
  }
  await runSsh(sshHost, commands.join('; '));
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
  ].join('\n');
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
    if (isRemote) {
      return `cd ${shellQuote(projectPath)} && exec "\${SHELL:-/bin/sh}"`;
    }
    const shell = process.env.SHELL || 'zsh';
    return `cd ${shellQuote(projectPath)} && exec ${shellQuote(shell)}`;
  }
  if (kind === 'codex') {
    return rawCommand || 'codex';
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

async function resolveRemoteCommandPath(project, command, cwd) {
  if (!project?.sshHost) {
    return command;
  }
  const executable = commandName(command);
  if (!executable || executable.includes('/')) {
    return command;
  }
  const trimmed = String(command || '').trim();
  if (!trimmed.startsWith(executable)) {
    return command;
  }
  const suffix = trimmed.slice(executable.length);
  if (suffix && !/^\s/.test(suffix)) {
    return command;
  }

  const resolveScript = [
    `if command -v ${shellQuote(executable)} >/dev/null 2>&1; then command -v ${shellQuote(executable)}; exit 0; fi`,
    `for candidate_dir in "$HOME/.local/bin" "/usr/dev_infra/generic/bin" "/usr/local/bin" "/usr/bin" "/bin"; do`,
    `  if [ -x "$candidate_dir/${executable}" ]; then printf '%s\\n' "$candidate_dir/${executable}"; exit 0; fi`,
    'done',
    "printf '\\n'"
  ].join('\n');

  let resolved = '';
  try {
    resolved = String(await runSsh(project.sshHost, resolveScript, cwd))
      .split('\n')
      .map((line) => String(line || '').trim())
      .find(Boolean) || '';
  } catch {
    resolved = '';
  }
  if (!resolved) {
    return command;
  }
  return `${shellQuote(resolved)}${suffix}`;
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

function buildInstallerCommand(kind, executable) {
  const binary = String(executable || kind || '').trim() || kind;
  const docsUrl = AGENT_INSTALL_DOCS[kind] || '';
  const packageAttempts = (AGENT_BREW_PACKAGES[kind] || [binary])
    .map((name) => `brew install ${name}`)
    .join(' || ');
  return [
    `echo ${shellQuote(`Missing CLI: ${binary}`)}`,
    'if command -v brew >/dev/null 2>&1; then',
    `  ${packageAttempts} || true`,
    'else',
    '  echo "Homebrew is not installed. Install Homebrew first: https://brew.sh"',
    'fi',
    `echo ${shellQuote(`Verify availability: command -v ${binary}`)}`,
    docsUrl ? `echo ${shellQuote(`Docs: ${docsUrl}`)}` : 'true',
    'exec "${SHELL:-zsh}"'
  ].join('\n');
}

async function spawnInstallerSession({
  project,
  kind,
  executable,
  sessionPath,
  sessionWorkspaceName,
  tmuxWidth,
  tmuxHeight
}) {
  const tmuxName = `${project.id}-tmux-${nanoid(5)}`;
  const installCommand = buildInstallerCommand(kind, executable);
  const newSessionArgs = ['new-session', '-d', '-s', tmuxName];
  if (tmuxWidth) {
    newSessionArgs.push('-x', tmuxWidth);
  }
  if (tmuxHeight) {
    newSessionArgs.push('-y', tmuxHeight);
  }
  newSessionArgs.push('-c', sessionPath, installCommand);
  await runTmuxForProject(project, newSessionArgs, sessionPath);

  try {
    await runTmuxForProject(project, ['set-window-option', '-g', 'history-limit', TMUX_HISTORY_LIMIT_LINES], sessionPath);
    await runTmuxForProject(project, ['set-option', '-s', 'escape-time', '0'], sessionPath);
    await runTmuxForProject(project, ['set-option', '-t', tmuxName, 'mouse', 'off'], sessionPath);
    await runTmuxForProject(project, ['set-option', '-t', tmuxName, 'status', 'off'], sessionPath);
    await runTmuxForProject(project, ['set-window-option', '-t', tmuxName, 'history-limit', TMUX_HISTORY_LIMIT_LINES], sessionPath);
  } catch {
    // Ignore optional tmux UI setting failures.
  }

  if (tmuxWidth || tmuxHeight) {
    const resizeArgs = ['resize-window', '-t', tmuxName];
    if (tmuxWidth) {
      resizeArgs.push('-x', tmuxWidth);
    }
    if (tmuxHeight) {
      resizeArgs.push('-y', tmuxHeight);
    }
    await runTmuxForProject(project, resizeArgs, sessionPath);
  }

  const session = {
    id: sessionIdFrom(project.sshHost, tmuxName),
    projectId: project.id,
    projectName: project.name,
    kind: 'tmux',
    command: installCommand,
    tmuxName,
    sshHost: project.sshHost || null,
    workspacePath: sessionPath,
    workspaceName: sessionWorkspaceName,
    lastInput: '',
    startedAt: new Date().toISOString()
  };
  sessions.unshift(session);

  await trackEvent('session.started', {
    projectId: project.id,
    projectName: project.name,
    kind: 'tmux',
    tmuxName,
    command: installCommand,
    workspacePath: sessionPath,
    workspaceName: sessionWorkspaceName,
    sshHost: project.sshHost || null
  });
  await trackAlert('session.cli_missing_installer_opened', {
    projectId: project.id,
    projectName: project.name,
    missingKind: kind,
    executable,
    sshHost: project.sshHost || null,
    workspacePath: sessionPath
  }, 'warning');
  return session;
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

export async function spawnSession({ project, kind, rawCommand, prompt, setupScript, workspacePath, workspaceName }) {
  const sessionPath = String(workspacePath || project.path || '').trim() || project.path;
  const sessionWorkspaceName = String(workspaceName || 'main').trim() || 'main';
  const setup = String(setupScript || '').trim();
  const defaultTmuxShell = kind === 'tmux' && !String(rawCommand || '').trim();
  const baseCommand = defaultTmuxShell ? '' : buildCommand(kind, rawCommand, sessionPath, Boolean(project.sshHost));
  let command = buildPromptCommand(kind, baseCommand, prompt);
  if (project.sshHost && AGENT_KINDS.has(kind) && command) {
    command = await resolveRemoteCommandPath(project, command, sessionPath);
  }
  const promptInjectedInCommand = command !== baseCommand;
  const normalizedPrompt = String(prompt ?? '').trim();
  const initialLastInput = deriveInitialLastInput({ prompt });
  const tmuxName = `${project.id}-${kind}-${nanoid(5)}`;
  const tmuxWidth = normalizeTmuxSize(process.env.TMUX_COLS);
  const tmuxHeight = normalizeTmuxSize(process.env.TMUX_ROWS);
  if (AGENT_KINDS.has(kind)) {
    // Remote hosts can expose agent CLIs through shell-specific PATH setup
    // that does not reliably appear in non-interactive probes. Launch directly
    // on remote and let runtime startup checks report real failures.
    if (!project.sshHost) {
      const executable = commandName(command);
      const available = await commandExists(command, { ...project, path: sessionPath });
      if (!available) {
        return spawnInstallerSession({
          project,
          kind,
          executable,
          sessionPath,
          sessionWorkspaceName,
          tmuxWidth,
          tmuxHeight
        });
      }
    }
  }

  try {
    if (AGENT_KINDS.has(kind)) {
      if (project.sshHost) {
        await ensureSessionRulesFilesRemote(sessionPath, project.sshHost);
      } else {
        await ensureSessionRulesFiles(sessionPath);
      }
    }
    const newSessionArgs = ['new-session', '-d', '-s', tmuxName];
    if (tmuxWidth) {
      newSessionArgs.push('-x', tmuxWidth);
    }
    if (tmuxHeight) {
      newSessionArgs.push('-y', tmuxHeight);
    }
    // Remote sessions should run inside the user's native interactive shell.
    // Start a plain tmux shell and inject startup commands via send-keys so
    // csh/zsh/bash environments behave consistently.
    if (defaultTmuxShell) {
      // Let tmux launch its own default shell in the target directory.
      newSessionArgs.push('-c', sessionPath);
    } else {
      if (project.sshHost) {
        newSessionArgs.push('-c', sessionPath);
      } else {
        const launchScript = setup ? `${setup}\nexec ${command}` : `exec ${command}`;
        const tmuxCommand = `/bin/sh -lc ${shellQuote(launchScript)}`;
        newSessionArgs.push('-c', sessionPath, tmuxCommand);
      }
    }
    await runTmuxForProject(project, newSessionArgs, sessionPath);
    if (project.sshHost) {
      const startupLines = [];
      if (setup) {
        startupLines.push(
          ...setup
            .split('\n')
            .map((line) => String(line || '').trim())
            .filter(Boolean)
        );
      }
      if (!defaultTmuxShell) {
        startupLines.push(command);
      }
      if (startupLines.length) {
        await new Promise((resolve) => setTimeout(resolve, 180));
        for (const line of startupLines) {
          await runTmuxForProject(project, ['send-keys', '-t', tmuxName, '-l', line], sessionPath);
          await runTmuxForProject(project, ['send-keys', '-t', tmuxName, 'C-m'], sessionPath);
        }
      }
    }
    try {
      // Reinforce global tmux history depth in case user config overrides it low.
      await runTmuxForProject(project, ['set-window-option', '-g', 'history-limit', TMUX_HISTORY_LIMIT_LINES], sessionPath);
      // Eliminate escape-time delay so arrow key escape sequences are recognized
      // immediately rather than being split into Escape + literal text.
      await runTmuxForProject(project, ['set-option', '-s', 'escape-time', '0'], sessionPath);
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

    if (kind === 'tmux') {
      await new Promise((resolve) => setTimeout(resolve, project.sshHost ? 900 : 300));
      let alive = await tmuxSessionExists(project, tmuxName);
      if (!alive && project.sshHost) {
        await new Promise((resolve) => setTimeout(resolve, 900));
        alive = await tmuxSessionExists(project, tmuxName);
      }
      if (!alive) {
        const where = project.sshHost ? `${project.sshHost}:${project.path}` : project.path;
        const error = new Error(
          `tmux exited immediately after launch in ${where}. Verify the default shell and environment in that directory.`
        );
        error.code = 'TMUX_EXITED_EARLY';
        error.kind = kind;
        throw error;
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
