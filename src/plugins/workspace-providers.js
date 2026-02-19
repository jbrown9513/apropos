import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { APROPOS_HOME } from '../constants.js';

const GLOBAL_PLUGIN_DIR = path.join(APROPOS_HOME, 'plugins');

function shellQuote(value) {
  return `'${String(value ?? '').replace(/'/g, `'\\''`)}'`;
}

async function readJsonIfExists(filePath) {
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

async function findProviderFiles(rootDir, maxDepth = 4) {
  const results = [];
  async function walk(currentPath, depth) {
    if (depth > maxDepth) {
      return;
    }
    let entries = [];
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const nextPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') {
          continue;
        }
        await walk(nextPath, depth + 1);
        continue;
      }
      if (entry.isFile() && entry.name === 'workspace-provider.json') {
        results.push(nextPath);
      }
    }
  }
  await walk(rootDir, 0);
  results.sort((a, b) => a.localeCompare(b));
  return results;
}

function normalizeProvider(raw) {
  const provider = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const id = String(provider.id || '').trim().toLowerCase();
  const detectCommand = String(provider.detectCommand || '').trim();
  const listViewsCommand = String(provider.listViewsCommand || '').trim();
  if (!id || !detectCommand) {
    return null;
  }
  return {
    id,
    name: String(provider.name || id).trim() || id,
    detectCommand,
    listViewsCommand,
    useViewCommand: String(provider.useViewCommand || '').trim(),
    createViewCommand: String(provider.createViewCommand || '').trim(),
    defaultCheckoutCommand: String(provider.defaultCheckoutCommand || '').trim()
  };
}

let providersCache = { loadedAt: 0, providers: [] };

export async function loadWorkspaceProviders() {
  const now = Date.now();
  if (now - providersCache.loadedAt < 15000) {
    return providersCache.providers;
  }
  const files = await findProviderFiles(GLOBAL_PLUGIN_DIR);
  const configs = await Promise.all(files.map((filePath) => readJsonIfExists(filePath)));
  const providers = configs
    .map((raw) => normalizeProvider(raw))
    .filter(Boolean);
  providersCache = {
    loadedAt: now,
    providers
  };
  return providers;
}

function renderTemplate(template, variables) {
  return String(template || '').replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key) => {
    return String(variables[key] ?? '');
  });
}

function runLocalShell(command, cwd) {
  return new Promise((resolve, reject) => {
    const wrapped = cwd ? `cd ${shellQuote(cwd)} && ${command}` : command;
    execFile('/bin/sh', ['-lc', wrapped], (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(String(stdout || '').trim());
    });
  });
}

async function runProviderCommand(project, command, runRemote) {
  const variables = {
    projectPath: String(project?.path || '').trim()
  };
  const rendered = renderTemplate(command, variables);
  if (project?.sshHost) {
    if (typeof runRemote !== 'function') {
      throw new Error('runRemote callback is required for remote provider commands');
    }
    return runRemote(project.sshHost, rendered);
  }
  return runLocalShell(rendered, project.path);
}

export async function detectWorkspaceProviderForProject(project, runRemote) {
  const providers = await loadWorkspaceProviders();
  for (const provider of providers) {
    try {
      await runProviderCommand(project, provider.detectCommand, runRemote);
      return provider;
    } catch {
      // Keep scanning.
    }
  }
  return null;
}

export async function listWorkspaceProviderViews(project, provider, runRemote) {
  if (!provider?.listViewsCommand) {
    return [];
  }
  const output = await runProviderCommand(project, provider.listViewsCommand, runRemote).catch(() => '');
  return String(output || '')
    .split('\n')
    .map((line) => {
      const raw = String(line || '').trim();
      if (!raw) {
        return '';
      }
      const left = raw.includes('|') ? raw.split('|')[0] : raw;
      return String(left || '').trim().split(/\s+/)[0] || '';
    })
    .filter(Boolean);
}

export function buildWorkspaceProviderSetupScript(provider, payload, projectPath) {
  const mode = String(payload?.mode || 'main').trim().toLowerCase();
  const viewName = String(payload?.name || '').trim();
  const variables = {
    projectPath: String(projectPath || '').trim(),
    viewName
  };
  const steps = [];
  const enteredView = mode === 'provider-view' || mode === 'provider-create';
  if (mode === 'provider-view') {
    if (!provider?.useViewCommand || !viewName) {
      throw new Error('workspace view name is required.');
    }
    steps.push(renderTemplate(provider.useViewCommand, variables));
  } else if (mode === 'provider-create') {
    if (!provider?.createViewCommand || !viewName) {
      throw new Error('workspace view name is required.');
    }
    steps.push(renderTemplate(provider.createViewCommand, variables));
  }
  if (enteredView && provider?.defaultCheckoutCommand) {
    steps.push(renderTemplate(provider.defaultCheckoutCommand, variables));
  }
  return steps.filter(Boolean).join('\n');
}
