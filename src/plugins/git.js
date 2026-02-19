import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

function shellQuote(value) {
  return `'${String(value ?? '').replace(/'/g, `'\\''`)}'`;
}

function runGitLocal(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(String(stdout || '').trim());
    });
  });
}

async function runGitForProject(project, args, { runRemote, cwd } = {}) {
  const workdir = String(cwd || project.path || '').trim() || project.path;
  if (project.sshHost) {
    if (typeof runRemote !== 'function') {
      throw new Error('runRemote callback is required for remote git operations');
    }
    const gitArgs = args.map((arg) => shellQuote(arg)).join(' ');
    const command = `cd ${shellQuote(workdir)} && git ${gitArgs}`;
    return runRemote(project.sshHost, command);
  }
  return runGitLocal(args, workdir);
}

async function detectIsGitRepo(project) {
  if (!project?.sshHost) {
    try {
      await fs.access(path.join(project.path, '.git'));
      return true;
    } catch {
      // Continue to command check.
    }
  }
  try {
    const result = await runGitForProject(project, ['rev-parse', '--is-inside-work-tree']);
    return result === 'true';
  } catch {
    return false;
  }
}

function parseWorktreeListPorcelain(raw) {
  const lines = String(raw || '').split('\n');
  const items = [];
  let current = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current?.path) {
        items.push(current);
      }
      current = null;
      continue;
    }
    if (trimmed.startsWith('worktree ')) {
      if (current?.path) {
        items.push(current);
      }
      current = {
        path: trimmed.slice('worktree '.length).trim(),
        branch: '',
        head: '',
        detached: false
      };
      continue;
    }
    if (!current) {
      continue;
    }
    if (trimmed.startsWith('branch ')) {
      current.branch = trimmed.slice('branch '.length).replace(/^refs\/heads\//, '').trim();
      continue;
    }
    if (trimmed.startsWith('HEAD ')) {
      current.head = trimmed.slice('HEAD '.length).trim();
      continue;
    }
    if (trimmed === 'detached') {
      current.detached = true;
    }
  }
  if (current?.path) {
    items.push(current);
  }
  return items;
}

async function listGitWorktrees(project, { runRemote, worktreeRoot } = {}) {
  const output = await runGitForProject(project, ['worktree', 'list', '--porcelain'], { runRemote });
  const parsed = parseWorktreeListPorcelain(output);
  const normalizedRoot = String(worktreeRoot || '').trim();
  const separator = project?.sshHost ? '/' : path.sep;
  const filtered = normalizedRoot
    ? parsed.filter((item) => item.path === project.path || item.path.startsWith(`${normalizedRoot}${separator}`))
    : parsed;
  const named = [];
  for (const item of filtered) {
    if (item.path === project.path) {
      continue;
    }
    const name = path.basename(item.path);
    named.push({
      id: name,
      name,
      path: item.path,
      branch: item.branch || '',
      detached: Boolean(item.detached)
    });
  }
  named.sort((a, b) => a.name.localeCompare(b.name));
  return named;
}

async function createGitWorktree(project, { name, rootDir, baseRef = 'HEAD', runRemote } = {}) {
  const worktreeName = String(name || '').trim();
  if (!worktreeName || !/^[A-Za-z0-9._-]+$/.test(worktreeName)) {
    throw new Error('Worktree name must contain only letters, numbers, ".", "_" or "-".');
  }
  const targetPath = path.join(rootDir, worktreeName);
  if (project?.sshHost) {
    if (typeof runRemote !== 'function') {
      throw new Error('runRemote callback is required for remote worktree creation');
    }
    await runRemote(project.sshHost, `mkdir -p ${shellQuote(rootDir)}`);
  } else {
    await fs.mkdir(rootDir, { recursive: true });
  }
  await runGitForProject(project, ['worktree', 'add', '--force', targetPath, String(baseRef || 'HEAD').trim() || 'HEAD'], { runRemote });
  return {
    id: worktreeName,
    name: worktreeName,
    path: targetPath,
    branch: String(baseRef || 'HEAD').trim() || 'HEAD'
  };
}

async function listGitRefs(project, { runRemote, max = 200 } = {}) {
  const output = await runGitForProject(
    project,
    ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/tags'],
    { runRemote }
  );
  const unique = new Set(['HEAD']);
  for (const line of String(output || '').split('\n')) {
    const ref = String(line || '').trim();
    if (!ref) {
      continue;
    }
    unique.add(ref);
    if (unique.size >= max + 1) {
      break;
    }
  }
  return Array.from(unique);
}

export {
  shellQuote,
  runGitLocal,
  runGitForProject,
  detectIsGitRepo,
  listGitWorktrees,
  createGitWorktree,
  listGitRefs
};
