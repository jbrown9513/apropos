import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import {
  CONFIG_PATH,
  DEFAULT_MCP_CATALOG,
  DEFAULT_MCP_REPOSITORIES,
  DEFAULT_PROXY_TARGETS,
  EVENT_LOG_PATH,
  APROPOS_HOME,
  PROJECT_COLORS
} from './constants.js';

const DEFAULT_STATE = {
  settings: {
    mcpRepositoryBase: '',
    mcpRepositories: DEFAULT_MCP_REPOSITORIES,
    proxyTargets: DEFAULT_PROXY_TARGETS
  },
  projects: [],
  projectFolders: [],
  projectFolderByProject: {},
  activeFolderId: null
};

let state = structuredClone(DEFAULT_STATE);

function normalizeMcpTool(item) {
  const id = String(item?.id || '').trim();
  const command = String(item?.command || '').trim();
  if (!id || !command) {
    return null;
  }
  return {
    id,
    name: String(item?.name || id).trim() || id,
    repo: String(item?.repo || '').trim(),
    command,
    args: Array.isArray(item?.args) ? item.args.map((arg) => String(arg)) : [],
    description: String(item?.description || '').trim()
  };
}

function normalizeMcpRepository(item) {
  const id = String(item?.id || '').trim();
  const gitUrl = String(item?.gitUrl || item?.repo || '').trim();
  if (!id || !gitUrl) {
    return null;
  }
  const tools = Array.isArray(item?.tools)
    ? item.tools.map((tool) => normalizeMcpTool({ ...tool, repo: tool?.repo || gitUrl })).filter(Boolean)
    : [];
  return {
    id,
    name: String(item?.name || id).trim() || id,
    gitUrl,
    tools
  };
}

function normalizeMcpRepositories(input) {
  const list = Array.isArray(input) ? input : DEFAULT_MCP_REPOSITORIES;
  const normalized = list.map((item) => normalizeMcpRepository(item)).filter(Boolean);
  if (normalized.length) {
    return normalized;
  }
  return structuredClone(DEFAULT_MCP_REPOSITORIES);
}

export async function ensureHome() {
  await fs.mkdir(APROPOS_HOME, { recursive: true });
}

export function currentState() {
  return state;
}

export async function loadState() {
  await ensureHome();
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    state = {
      ...DEFAULT_STATE,
      ...parsed,
      settings: {
        ...DEFAULT_STATE.settings,
        ...parsed.settings,
        mcpRepositories: normalizeMcpRepositories(parsed.settings?.mcpRepositories),
        proxyTargets: {
          ...DEFAULT_PROXY_TARGETS,
          ...(parsed.settings?.proxyTargets || {})
        }
      },
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      projectFolders: Array.isArray(parsed.projectFolders)
        ? parsed.projectFolders
          .map((item) => ({
            id: String(item?.id || '').trim(),
            name: String(item?.name || '').trim()
          }))
          .filter((item) => item.id && item.name)
        : [],
      projectFolderByProject: parsed.projectFolderByProject && typeof parsed.projectFolderByProject === 'object' && !Array.isArray(parsed.projectFolderByProject)
        ? Object.fromEntries(
          Object.entries(parsed.projectFolderByProject)
            .map(([projectId, folderId]) => [String(projectId || '').trim(), String(folderId || '').trim()])
            .filter(([projectId, folderId]) => projectId && folderId)
        )
        : {},
      activeFolderId: parsed.activeFolderId ? String(parsed.activeFolderId).trim() : null
    };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    await persistState();
  }
}

export async function updateFolderState(nextState) {
  const folders = Array.isArray(nextState?.projectFolders)
    ? nextState.projectFolders
      .map((item) => ({
        id: String(item?.id || '').trim(),
        name: String(item?.name || '').trim()
      }))
      .filter((item) => item.id && item.name)
    : [];
  const folderIds = new Set(folders.map((item) => item.id));
  const projectIds = new Set((state.projects || []).map((item) => item.id));

  const assignmentsInput = nextState?.projectFolderByProject;
  const projectFolderByProject = assignmentsInput && typeof assignmentsInput === 'object' && !Array.isArray(assignmentsInput)
    ? Object.fromEntries(
      Object.entries(assignmentsInput)
        .map(([projectId, folderId]) => [String(projectId || '').trim(), String(folderId || '').trim()])
        .filter(([projectId, folderId]) => projectId && folderId && projectIds.has(projectId) && folderIds.has(folderId))
    )
    : {};

  const activeFolderIdRaw = nextState?.activeFolderId ? String(nextState.activeFolderId).trim() : '';
  const activeFolderId = activeFolderIdRaw && folderIds.has(activeFolderIdRaw) ? activeFolderIdRaw : null;

  state.projectFolders = folders;
  state.projectFolderByProject = projectFolderByProject;
  state.activeFolderId = activeFolderId;
  await persistState();
  return {
    projectFolders: state.projectFolders,
    projectFolderByProject: state.projectFolderByProject,
    activeFolderId: state.activeFolderId
  };
}

export async function persistState() {
  await ensureHome();
  await fs.writeFile(CONFIG_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

export function sanitizeProject(project) {
  return {
    id: project.id,
    name: project.name,
    path: project.path,
    sshHost: project.sshHost || null,
    isRemote: Boolean(project.sshHost),
    color: project.color,
    isGit: project.isGit,
    docsDir: path.join(project.path, 'docs'),
    agentsSymlinkOk: project.agentsSymlinkOk,
    mcpTools: project.mcpTools || [],
    skills: project.skills || [],
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}

export async function addProject({ name, projectPath, isGit, sshHost = null }) {
  const color = PROJECT_COLORS[state.projects.length % PROJECT_COLORS.length];
  const now = new Date().toISOString();
  const project = {
    id: nanoid(10),
    name,
    path: projectPath,
    sshHost: sshHost || null,
    isGit: Boolean(isGit),
    color,
    mcpTools: [],
    skills: [],
    agentsSymlinkOk: false,
    createdAt: now,
    updatedAt: now
  };
  state.projects.push(project);
  await persistState();
  return project;
}

export async function updateSettings(updateFn) {
  const base = {
    ...state.settings,
    mcpRepositories: normalizeMcpRepositories(state.settings?.mcpRepositories),
    proxyTargets: {
      ...DEFAULT_PROXY_TARGETS,
      ...(state.settings?.proxyTargets || {})
    }
  };
  const next = typeof updateFn === 'function' ? updateFn(base) || base : base;
  state.settings = {
    ...base,
    ...next,
    mcpRepositories: normalizeMcpRepositories(next?.mcpRepositories),
    proxyTargets: {
      ...DEFAULT_PROXY_TARGETS,
      ...(next?.proxyTargets || {})
    }
  };
  await persistState();
  return state.settings;
}

export async function updateProject(projectId, updateFn) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) {
    return null;
  }
  updateFn(project);
  project.updatedAt = new Date().toISOString();
  await persistState();
  return project;
}

export function getProject(projectId) {
  return state.projects.find((item) => item.id === projectId) || null;
}

export async function removeProject(projectId) {
  const index = state.projects.findIndex((item) => item.id === projectId);
  if (index === -1) {
    return null;
  }
  const [removed] = state.projects.splice(index, 1);
  await persistState();
  return removed;
}

export function getMcpCatalog() {
  const byId = new Map();
  const repositories = normalizeMcpRepositories(state.settings?.mcpRepositories);
  for (const repository of repositories) {
    for (const tool of repository.tools || []) {
      const normalized = normalizeMcpTool({
        ...tool,
        repo: tool?.repo || repository.gitUrl
      });
      if (!normalized) {
        continue;
      }
      if (!byId.has(normalized.id)) {
        byId.set(normalized.id, normalized);
      }
    }
  }
  if (!byId.size) {
    for (const tool of DEFAULT_MCP_CATALOG) {
      byId.set(tool.id, tool);
    }
  }
  return [...byId.values()];
}

export async function appendEventLog(event) {
  await ensureHome();
  await fs.appendFile(EVENT_LOG_PATH, JSON.stringify(event) + '\n', 'utf8');
}

export async function clearEventLog() {
  await ensureHome();
  try {
    await fs.unlink(EVENT_LOG_PATH);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}
