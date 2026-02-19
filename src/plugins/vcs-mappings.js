import fs from 'node:fs/promises';
import path from 'node:path';
import { APROPOS_HOME } from '../constants.js';

const GLOBAL_MAPPINGS_PATH = path.join(APROPOS_HOME, 'plugins', 'vcs-mappings.json');
const PROJECT_MAPPINGS_RELATIVE = path.join('.apropos', 'vcs-mappings.json');
const GLOBAL_PLUGIN_DIR = path.join(APROPOS_HOME, 'plugins');

function normalizeMappings(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input)
    ? (input.mappings && typeof input.mappings === 'object' ? input.mappings : input)
    : {};
  const entries = Object.entries(source);
  const normalized = [];
  for (const [fromRaw, toRaw] of entries) {
    const from = String(fromRaw || '').trim();
    const to = String(toRaw || '').trim();
    if (!from || !to) {
      continue;
    }
    normalized.push({ from, to });
  }
  normalized.sort((a, b) => a.from.localeCompare(b.from));
  return normalized;
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

async function findPluginMappingFiles(rootDir, maxDepth = 4) {
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
      if (!entry.isFile()) {
        continue;
      }
      if (entry.name === 'vcs-mappings.json') {
        results.push(nextPath);
      }
    }
  }
  await walk(rootDir, 0);
  results.sort((a, b) => a.localeCompare(b));
  return results;
}

async function loadVcsMappingsForWorkspace(workspacePath) {
  const projectPath = path.join(workspacePath, PROJECT_MAPPINGS_RELATIVE);
  const pluginMappingFiles = (await findPluginMappingFiles(GLOBAL_PLUGIN_DIR))
    .filter((filePath) => filePath !== GLOBAL_MAPPINGS_PATH);
  const [globalConfig, projectConfig, ...pluginConfigs] = await Promise.all([
    readJsonIfExists(GLOBAL_MAPPINGS_PATH),
    readJsonIfExists(projectPath),
    ...pluginMappingFiles.map((filePath) => readJsonIfExists(filePath))
  ]);
  const globalMappings = normalizeMappings(globalConfig);
  const projectMappings = normalizeMappings(projectConfig);
  const bySource = new Map(globalMappings.map((item) => [item.from, item.to]));
  for (const config of pluginConfigs) {
    for (const item of normalizeMappings(config)) {
      bySource.set(item.from, item.to);
    }
  }
  for (const item of projectMappings) {
    bySource.set(item.from, item.to);
  }
  const merged = [...bySource.entries()]
    .map(([from, to]) => ({ from, to }))
    .sort((a, b) => a.from.localeCompare(b.from));
  return {
    mappings: merged,
    sources: {
      globalPath: GLOBAL_MAPPINGS_PATH,
      projectPath,
      pluginMappingFiles
    }
  };
}

function renderVcsRules({ mappings, sources }) {
  const lines = [
    '# Apropos VCS Command Mapping',
    '',
    'Apropos generated this file for session startup.',
    'Use these command mappings when operating on repository actions.',
    ''
  ];
  if (!mappings.length) {
    lines.push('No custom mappings were configured.', '');
  } else {
    lines.push('## Mappings', '');
    for (const item of mappings) {
      lines.push(`- \`${item.from}\` => \`${item.to}\``);
    }
    lines.push('');
  }
  lines.push('## Mapping Sources', '');
  lines.push(`- Global: \`${sources.globalPath}\``);
  if (Array.isArray(sources.pluginMappingFiles) && sources.pluginMappingFiles.length) {
    for (const filePath of sources.pluginMappingFiles) {
      lines.push(`- Plugin: \`${filePath}\``);
    }
  }
  lines.push(`- Project: \`${sources.projectPath}\``);
  lines.push('');
  return lines.join('\n');
}

async function ensureSessionRulesFiles(workspacePath) {
  const loaded = await loadVcsMappingsForWorkspace(workspacePath);
  const content = renderVcsRules(loaded);
  const ruleFiles = [
    path.join(workspacePath, 'codex', 'rules', 'apropos-vcs.md'),
    path.join(workspacePath, '.codex', 'rules', 'apropos-vcs.md'),
    path.join(workspacePath, '.claude', 'rules', 'apropos-vcs.md')
  ];
  for (const filePath of ruleFiles) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${content}\n`, 'utf8');
  }
  return {
    mappings: loaded.mappings,
    files: ruleFiles
  };
}

export {
  GLOBAL_MAPPINGS_PATH,
  ensureSessionRulesFiles,
  loadVcsMappingsForWorkspace
};
