const { Terminal } = window;
const { FitAddon } = window;


const state = {
  dashboard: null,
  activeProjectId: null,
  workspaceEditorKind: null,
  terminals: new Map(),
  sessionOrderByProject: loadSessionOrder(),
  sessionSizeByProject: loadSessionSizeByProject(),
  projectOrder: loadProjectOrder(),
  projectFolders: [],
  projectFolderByProject: {},
  activeFolderId: null,
  draggingSessionId: null,
  draggingProjectId: null,
  highlightedSessionId: null,
  highlightTimer: null,
  notificationsOpen: false,
  notificationsSeenAt: loadNotificationSeenAt(),
  toastTimer: null,
  mcpLogsSocket: null,
  mcpLogLines: []
};

const WORKSPACE_TERM_COLS = 80;
const WORKSPACE_TERM_ROWS = 20;
const SESSION_ORDER_STORAGE_KEY = 'apropos.session-order.v1';
const SESSION_SIZE_STORAGE_KEY = 'apropos.session-size.v1';
const PROJECT_ORDER_STORAGE_KEY = 'apropos.project-order.v1';
const NOTIFICATION_SEEN_AT_STORAGE_KEY = 'apropos.notifications.seen-at.v1';

const els = {
  homePath: document.querySelector('#homePath'),
  projects: document.querySelector('#projects'),
  folderTabs: document.querySelector('#folderTabs'),
  removeFolderBtn: document.querySelector('#removeFolderBtn'),
  addFolderBtn: document.querySelector('#addFolderBtn'),
  addProjectFab: document.querySelector('#addProjectFab'),
  mainMcpAddRepoBtn: document.querySelector('#mainMcpAddRepoBtn'),
  projectTemplate: document.querySelector('#projectTemplate'),
  projectSwitcherWrap: document.querySelector('[data-project-switcher]'),
  projectSwitcher: document.querySelector('#projectSwitcher'),
  workspace: document.querySelector('#workspace'),
  workspaceTitle: document.querySelector('#workspaceTitle'),
  workspaceEditor: document.querySelector('#workspaceEditor'),
  workspaceEditorTitle: document.querySelector('#workspaceEditorTitle'),
  workspaceEditorInput: document.querySelector('#workspaceEditorInput'),
  workspaceEditorSkillSelectWrap: document.querySelector('[data-editor-skill-select]'),
  workspaceEditorSkillSelect: document.querySelector('#workspaceEditorSkillSelect'),
  workspaceEditorSkillActions: document.querySelector('[data-editor-skill-actions]'),
  workspaceEditorDocsFileWrap: document.querySelector('[data-editor-docs-file]'),
  workspaceEditorDocsFile: document.querySelector('#workspaceEditorDocsFile'),
  workspaceLogs: document.querySelector('#workspaceLogs'),
  workspaceLogsOutput: document.querySelector('#workspaceLogsOutput'),
  workspaceSplit: document.querySelector('#workspaceSplit'),
  workspaceLogsPane: document.querySelector('#workspaceLogsPane'),
  workspaceLogsOutputPane: document.querySelector('#workspaceLogsOutputPane'),
  terminalGridSplit: document.querySelector('#terminalGridSplit'),
  notificationCenter: document.querySelector('#notificationCenter'),
  notificationToggle: document.querySelector('#notificationToggle'),
  notificationBadge: document.querySelector('#notificationBadge'),
  notificationDismissAll: document.querySelector('#notificationDismissAll'),
  terminalGrid: document.querySelector('#terminalGrid'),
  terminalGridEmpty: document.querySelector('#terminalGridEmpty'),
  notificationGroups: document.querySelector('#notificationGroups'),
  notificationEmpty: document.querySelector('#notificationEmpty'),
  toast: document.querySelector('#toast'),
  stopAllSessionsBtn: document.querySelector('#stopAllSessionsBtn'),
  closeWorkspace: document.querySelector('#closeWorkspace'),
  appModal: document.querySelector('#appModal'),
  appModalForm: document.querySelector('#appModalForm'),
  appModalTitle: document.querySelector('#appModalTitle'),
  appModalBody: document.querySelector('#appModalBody'),
  appModalSubmit: document.querySelector('#appModalSubmit'),
  appModalCancel: document.querySelector('#appModalCancel'),
  appModalClose: document.querySelector('#appModalClose')
};

function showToast(message, timeoutMs = 1800) {
  const text = String(message || '').trim();
  if (!text) {
    return;
  }
  if (!els.toast) {
    console.log('[toast]', text);
    return;
  }
  els.toast.textContent = text;
  els.toast.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, timeoutMs);
}

let activeModalResolver = null;

function closeActiveModal(result) {
  if (activeModalResolver) {
    const resolve = activeModalResolver;
    activeModalResolver = null;
    try {
      els.appModal.close();
    } catch {
      // no-op
    }
    resolve(result);
  }
}

function openModalBase({ title, submitLabel = 'OK', cancelLabel = 'Cancel', hideCancel = false, bodyBuilder }) {
  if (activeModalResolver) {
    closeActiveModal(null);
  }
  els.appModalTitle.textContent = title;
  els.appModalSubmit.textContent = submitLabel;
  els.appModalCancel.textContent = cancelLabel;
  els.appModalCancel.hidden = hideCancel;
  els.appModalBody.innerHTML = '';
  if (typeof bodyBuilder === 'function') {
    bodyBuilder(els.appModalBody);
  }

  return new Promise((resolve) => {
    activeModalResolver = resolve;
    els.appModal.showModal();
  });
}

async function modalMessage(message, { title = 'Notice' } = {}) {
  const result = await openModalBase({
    title,
    submitLabel: 'OK',
    hideCancel: true,
    bodyBuilder: (body) => {
      const p = document.createElement('p');
      p.textContent = String(message || '');
      body.appendChild(p);
    }
  });
  return result;
}

async function modalConfirm(message, { title = 'Confirm', confirmLabel = 'Confirm', cancelLabel = 'Cancel' } = {}) {
  const result = await openModalBase({
    title,
    submitLabel: confirmLabel,
    cancelLabel,
    bodyBuilder: (body) => {
      const p = document.createElement('p');
      p.textContent = String(message || '');
      body.appendChild(p);
    }
  });
  return result === 'submit';
}

async function modalForm({ title, submitLabel = 'Save', cancelLabel = 'Cancel', fields = [], description = '' }) {
  let fieldMap = new Map();
  const result = await openModalBase({
    title,
    submitLabel,
    cancelLabel,
    bodyBuilder: (body) => {
      if (description) {
        const p = document.createElement('p');
        p.textContent = description;
        body.appendChild(p);
      }
      const map = new Map();
      for (const field of fields) {
        const label = document.createElement('label');
        label.textContent = field.label || field.id;
        let input;
        if (field.type === 'select') {
          input = document.createElement('select');
          for (const option of field.options || []) {
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.textContent = option.label;
            input.appendChild(opt);
          }
        } else {
          input = document.createElement('input');
          input.type = field.type || 'text';
          if (field.placeholder) {
            input.placeholder = field.placeholder;
          }
        }
        input.value = field.value || '';
        input.dataset.fieldId = field.id;
        label.appendChild(input);
        body.appendChild(label);
        map.set(field.id, { config: field, input });
      }
      fieldMap = map;
    }
  });

  if (result !== 'submit') {
    return null;
  }

  const values = {};
  for (const [id, data] of fieldMap.entries()) {
    const value = String(data.input.value || '');
    if (data.config.required && !value.trim()) {
      await modalMessage(`${data.config.label || id} is required.`, { title: 'Missing field' });
      return null;
    }
    values[id] = value;
  }
  return values;
}

function setWorkspaceEditorSaveLabel(label) {
  for (const button of document.querySelectorAll('button[data-editor-save]')) {
    button.textContent = label;
  }
}

function workspacePath(projectId) {
  const project = projectById(projectId);
  const slug = projectSlugFromProject(project);
  return `/projects/${encodeURIComponent(slug)}`;
}

els.appModalForm.addEventListener('submit', (event) => {
  event.preventDefault();
  closeActiveModal('submit');
});

els.appModalCancel.addEventListener('click', () => {
  closeActiveModal('cancel');
});

els.appModalClose.addEventListener('click', () => {
  closeActiveModal('cancel');
});

els.appModal.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeActiveModal('cancel');
});

function projectSlugFromPathname() {
  const match = window.location.pathname.match(/^\/projects\/([^/]+)$/);
  if (!match) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
      return null;
  }
}

function projectIdFromSlug(slug) {
  if (!slug || !state.dashboard?.projects?.length) {
    return null;
  }
  const normalized = String(slug).trim().toLowerCase();
  const target = state.dashboard.projects.find((project) => {
    const projectSlug = projectSlugFromProject(project);
    return projectSlug === normalized;
  });
  return target?.id || null;
}

function projectSlugFromProject(project) {
  const routeKey = project?.sshHost
    ? `${String(project.sshHost).trim()}:${String(project.path || '').trim()}`
    : String(project?.path || '').trim();
  return routeKey
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';
}

function loadSessionOrder() {
  try {
    const raw = localStorage.getItem(SESSION_ORDER_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function saveSessionOrder() {
  try {
    localStorage.setItem(SESSION_ORDER_STORAGE_KEY, JSON.stringify(state.sessionOrderByProject));
  } catch {
    // Ignore storage write failures and continue with in-memory ordering.
  }
}

function loadSessionSizeByProject() {
  try {
    const raw = localStorage.getItem(SESSION_SIZE_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function saveSessionSizeByProject() {
  try {
    localStorage.setItem(SESSION_SIZE_STORAGE_KEY, JSON.stringify(state.sessionSizeByProject));
  } catch {
    // Ignore storage write failures and continue with in-memory sizing.
  }
}

function maxTileCols() {
  if (window.matchMedia('(max-width: 1100px)').matches) {
    return 1;
  }
  if (window.matchMedia('(max-width: 2000px)').matches) {
    return 2;
  }
  return 3;
}

function getSessionTileSize(projectId, sessionId) {
  const projectSizes = state.sessionSizeByProject[projectId] || {};
  const raw = projectSizes[sessionId];
  const width = Math.min(maxTileCols(), Math.max(1, Number(raw?.width || 1)));
  const height = Math.min(4, Math.max(1, Number(raw?.height || 1)));
  return { width, height };
}

function setSessionTileSize(projectId, sessionId, size) {
  if (!projectId || !sessionId) {
    return;
  }
  const width = Math.min(maxTileCols(), Math.max(1, Number(size?.width || 1)));
  const height = Math.min(4, Math.max(1, Number(size?.height || 1)));
  const nextProject = {
    ...(state.sessionSizeByProject[projectId] || {}),
    [sessionId]: { width, height }
  };
  state.sessionSizeByProject = {
    ...state.sessionSizeByProject,
    [projectId]: nextProject
  };
  saveSessionSizeByProject();
}

function cleanupSessionTileSizes(projectId, activeSessionIds) {
  const current = state.sessionSizeByProject[projectId];
  if (!current || typeof current !== 'object') {
    return;
  }
  const cleaned = {};
  for (const [sessionId, size] of Object.entries(current)) {
    if (activeSessionIds.has(sessionId)) {
      cleaned[sessionId] = size;
    }
  }
  state.sessionSizeByProject = {
    ...state.sessionSizeByProject,
    [projectId]: cleaned
  };
  saveSessionSizeByProject();
}

function loadProjectOrder() {
  try {
    const raw = localStorage.getItem(PROJECT_ORDER_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item) => typeof item === 'string' && item);
  } catch {
    return [];
  }
}

function saveProjectOrder() {
  try {
    localStorage.setItem(PROJECT_ORDER_STORAGE_KEY, JSON.stringify(state.projectOrder));
  } catch {
    // Ignore storage write failures and continue with in-memory ordering.
  }
}

async function persistFolderState() {
  const response = await api('/api/folders/state', {
    method: 'POST',
    body: JSON.stringify({
      projectFolders: state.projectFolders,
      projectFolderByProject: state.projectFolderByProject,
      activeFolderId: state.activeFolderId
    })
  });
  state.projectFolders = Array.isArray(response.projectFolders) ? response.projectFolders : [];
  state.projectFolderByProject = response.projectFolderByProject && typeof response.projectFolderByProject === 'object'
    ? response.projectFolderByProject
    : {};
  state.activeFolderId = response.activeFolderId || null;
}

function loadNotificationSeenAt() {
  try {
    const raw = localStorage.getItem(NOTIFICATION_SEEN_AT_STORAGE_KEY);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return parsed;
  } catch {
    return 0;
  }
}

function saveNotificationSeenAt() {
  try {
    localStorage.setItem(NOTIFICATION_SEEN_AT_STORAGE_KEY, String(state.notificationsSeenAt || 0));
  } catch {
    // Ignore storage write failures and continue.
  }
}

function orderedProjects(projects) {
  const projectIds = new Set(projects.map((item) => item.id));
  const nextOrder = state.projectOrder.filter((id) => projectIds.has(id));
  const missing = projects.map((item) => item.id).filter((id) => !nextOrder.includes(id));
  nextOrder.push(...missing);

  const changed = nextOrder.length !== state.projectOrder.length
    || nextOrder.some((id, index) => id !== state.projectOrder[index]);
  if (changed) {
    state.projectOrder = nextOrder;
    saveProjectOrder();
  }

  const rank = new Map(nextOrder.map((id, index) => [id, index]));
  return projects.slice().sort((a, b) => {
    const aRank = rank.has(a.id) ? rank.get(a.id) : Number.MAX_SAFE_INTEGER;
    const bRank = rank.has(b.id) ? rank.get(b.id) : Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) {
      return aRank - bRank;
    }
    return a.name.localeCompare(b.name);
  });
}

function reconcileFolderState(projects = []) {
  const projectIds = new Set(projects.map((item) => item.id));
  const folderIds = new Set(state.projectFolders.map((folder) => folder.id));

  let foldersChanged = false;
  const nextFolders = [];
  for (const folder of state.projectFolders) {
    const id = String(folder.id || '').trim();
    const name = String(folder.name || '').trim();
    if (!id || !name) {
      foldersChanged = true;
      continue;
    }
    nextFolders.push({ id, name });
  }
  if (foldersChanged || nextFolders.length !== state.projectFolders.length) {
    state.projectFolders = nextFolders;
  }

  let assignmentsChanged = false;
  const nextAssignments = {};
  for (const [projectId, folderId] of Object.entries(state.projectFolderByProject || {})) {
    if (!projectIds.has(projectId) || !folderIds.has(folderId)) {
      assignmentsChanged = true;
      continue;
    }
    nextAssignments[projectId] = folderId;
  }
  if (assignmentsChanged || Object.keys(nextAssignments).length !== Object.keys(state.projectFolderByProject || {}).length) {
    state.projectFolderByProject = nextAssignments;
  }

  if (state.activeFolderId && !folderIds.has(state.activeFolderId)) {
    state.activeFolderId = null;
  }
}

function folderById(folderId) {
  return state.projectFolders.find((item) => item.id === folderId) || null;
}

function activeProjectIds() {
  return new Set((state.dashboard?.sessions || []).map((session) => session.projectId));
}

function projectsForHomeView() {
  const projects = orderedProjects(state.dashboard?.projects || []);
  if (!state.activeFolderId) {
    return projects;
  }
  const activeIds = activeProjectIds();
  return projects.filter((project) => {
    const folderId = state.projectFolderByProject[project.id];
    return folderId === state.activeFolderId && activeIds.has(project.id);
  });
}

function persistProjectOrderFromGrid() {
  const visibleOrdered = [...els.projects.querySelectorAll('[data-project-id]')]
    .map((card) => card.dataset.projectId)
    .filter(Boolean);
  const visibleSet = new Set(visibleOrdered);
  const trailing = state.projectOrder.filter((projectId) => !visibleSet.has(projectId));
  state.projectOrder = [...visibleOrdered, ...trailing];
  saveProjectOrder();
}

function compareSessionsStable(a, b) {
  const aTime = Date.parse(a.startedAt || '');
  const bTime = Date.parse(b.startedAt || '');
  if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
    return aTime - bTime;
  }
  return a.tmuxName.localeCompare(b.tmuxName);
}

function orderedSessions(projectId, sessions) {
  const activeIds = new Set(sessions.map((item) => item.id));
  const previous = Array.isArray(state.sessionOrderByProject[projectId]) ? state.sessionOrderByProject[projectId] : [];
  const nextOrder = previous.filter((id) => activeIds.has(id));

  const missing = sessions
    .filter((session) => !nextOrder.includes(session.id))
    .sort(compareSessionsStable)
    .map((session) => session.id);
  nextOrder.push(...missing);

  const changed = nextOrder.length !== previous.length || nextOrder.some((id, index) => id !== previous[index]);
  if (changed) {
    state.sessionOrderByProject[projectId] = nextOrder;
    saveSessionOrder();
  }

  const rank = new Map(nextOrder.map((id, index) => [id, index]));
  return sessions.slice().sort((a, b) => {
    const aRank = rank.has(a.id) ? rank.get(a.id) : Number.MAX_SAFE_INTEGER;
    const bRank = rank.has(b.id) ? rank.get(b.id) : Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) {
      return aRank - bRank;
    }
    return compareSessionsStable(a, b);
  });
}

function persistOrderFromGrid() {
  if (!state.activeProjectId) {
    return;
  }
  const orderedIds = [...els.terminalGrid.querySelectorAll('[data-session-id]')].map((tile) => tile.dataset.sessionId);
  state.sessionOrderByProject[state.activeProjectId] = orderedIds;
  saveSessionOrder();
}

function pathBasename(rawPath) {
  if (!rawPath) {
    return '';
  }
  const normalized = String(rawPath).replace(/[\\\/]+$/, '');
  const parts = normalized.split(/[\\\/]/);
  return parts[parts.length - 1] || '';
}

function formatProjectPath(project) {
  if (!project) {
    return '';
  }
  if (project.sshHost) {
    return `${project.sshHost}:${project.path}`;
  }
  return String(project.path || '').replace(/\/\/+$/, '');
}

function defaultMcpGithubRepoPlaceholder() {
  return 'git@github.com:your-org/apropos_mcp.git';
}

function alertsByProject() {
  const grouped = new Map();
  for (const alert of state.dashboard.alerts || []) {
    const projectId = alert.payload?.projectId;
    if (!projectId) {
      continue;
    }
    const list = grouped.get(projectId) || [];
    list.push(alert);
    grouped.set(projectId, list);
  }
  return grouped;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...options
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed');
    error.status = response.status;
    error.code = data.code;
    error.kind = data.kind;
    throw error;
  }
  return data;
}

async function pickDirectory() {
  return api('/api/system/pick-directory', { method: 'POST', body: '{}' });
}

function projectById(projectId) {
  return (state.dashboard.projects || []).find((item) => item.id === projectId) || null;
}

function sessionsForActiveProject() {
  const sessions = (state.dashboard.sessions || []).filter((item) => item.projectId === state.activeProjectId);
  if (!state.activeProjectId) {
    return sessions;
  }
  return orderedSessions(state.activeProjectId, sessions);
}

function notificationAlerts() {
  return (state.dashboard?.alerts || []).filter((item) => {
    if (!item?.type || !String(item.type).startsWith('session.')) {
      return false;
    }
    return Boolean(item.payload?.projectId || item.payload?.projectName);
  });
}

function groupedNotifications() {
  const alerts = notificationAlerts();
  const grouped = new Map();
  for (const alert of alerts) {
    const projectId = alert.payload?.projectId || '';
    const projectName = alert.payload?.projectName || projectById(projectId)?.name || 'Unknown project';
    const groupKey = projectId || `name:${projectName}`;
    const project = projectId ? projectById(projectId) : null;
    const bucket = grouped.get(groupKey) || {
      projectId: projectId || project?.id || '',
      projectName,
      items: []
    };
    bucket.items.push(alert);
    grouped.set(groupKey, bucket);
  }

  return [...grouped.values()]
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
    }))
    .sort((a, b) => {
      if (b.items.length !== a.items.length) {
        return b.items.length - a.items.length;
      }
      return a.projectName.localeCompare(b.projectName);
    });
}

function latestNotificationTimeMs(alerts) {
  let latest = 0;
  for (const alert of alerts) {
    const createdAtMs = Date.parse(alert.createdAt || 0);
    if (Number.isFinite(createdAtMs) && createdAtMs > latest) {
      latest = createdAtMs;
    }
  }
  return latest;
}

function markNotificationsRead() {
  const alerts = notificationAlerts();
  const latest = latestNotificationTimeMs(alerts);
  if (latest > state.notificationsSeenAt) {
    state.notificationsSeenAt = latest;
    saveNotificationSeenAt();
  }
}

function notificationMessage(alert) {
  if (alert.type === 'session.agent_question') {
    return String(alert.payload?.question || '').trim() || 'Agent needs input.';
  }
  if (alert.type === 'session.agent_idle') {
    const kind = String(alert.payload?.kind || 'agent');
    const lastInput = String(alert.payload?.lastInput || '').trim();
    if (lastInput) {
      return `${kind} completed: ${lastInput}`;
    }
    return `${kind} completed and is waiting.`;
  }
  return JSON.stringify(alert.payload || {});
}

function isEditableTarget(target) {
  if (!target || !(target instanceof Element)) {
    return false;
  }
  if (target.closest('.terminal-instance')) {
    return true;
  }
  const tagName = target.tagName;
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true;
  }
  return target.isContentEditable;
}

function currentWorkspaceTab() {
  if (!els.workspaceLogs.hidden || (els.workspaceSplit && !els.workspaceSplit.hidden)) {
    return 'logs';
  }
  if (els.workspaceEditor.hidden) {
    return null;
  }
  return state.workspaceEditorKind || null;
}

async function cycleWorkspaceTab(direction) {
  if (!state.activeProjectId) {
    return false;
  }
  const tabs = ['agents', 'docs', 'skills', 'logs'];
  const current = currentWorkspaceTab();
  const currentIndex = tabs.indexOf(current);
  const baseIndex = currentIndex === -1 ? (direction > 0 ? -1 : 0) : currentIndex;
  const nextIndex = (baseIndex + direction + tabs.length) % tabs.length;
  const nextTab = tabs[nextIndex];
  if (nextTab === 'logs') {
    openWorkspaceLogs();
    return true;
  }
  await openWorkspaceEditor(nextTab);
  return true;
}

async function cycleProject(direction) {
  const projects = orderedProjects(state.dashboard?.projects || []);
  if (!projects.length) {
    return false;
  }
  const currentIndex = projects.findIndex((project) => project.id === state.activeProjectId);
  const baseIndex = currentIndex === -1 ? (direction > 0 ? -1 : 0) : currentIndex;
  const nextIndex = (baseIndex + direction + projects.length) % projects.length;
  const nextProject = projects[nextIndex];
  if (!nextProject || nextProject.id === state.activeProjectId) {
    return false;
  }
  await openWorkspace(nextProject.id);
  return true;
}

function setNotificationsOpen(open) {
  state.notificationsOpen = Boolean(open);
  if (state.notificationsOpen) {
    markNotificationsRead();
  }
  els.notificationCenter.hidden = !state.notificationsOpen;
  els.notificationToggle.setAttribute('aria-expanded', state.notificationsOpen ? 'true' : 'false');
  renderNotifications();
}

function renderNotifications() {
  if (!state.dashboard) {
    return;
  }
  const alerts = notificationAlerts();
  const groups = groupedNotifications();
  const unreadCount = alerts.filter((alert) => Date.parse(alert.createdAt || 0) > state.notificationsSeenAt).length;
  if (unreadCount > 0) {
    els.notificationBadge.hidden = false;
    els.notificationBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    els.notificationToggle.classList.add('has-unread');
  } else {
    els.notificationBadge.hidden = true;
    els.notificationBadge.textContent = '0';
    els.notificationToggle.classList.remove('has-unread');
  }
  if (els.notificationDismissAll) {
    els.notificationDismissAll.hidden = alerts.length === 0;
  }
  els.notificationGroups.innerHTML = '';

  if (!groups.length) {
    els.notificationEmpty.hidden = false;
    return;
  }
  els.notificationEmpty.hidden = true;

  for (const group of groups) {
    const block = document.createElement('section');
    block.className = 'notification-group';
    const head = document.createElement('div');
    head.className = 'notification-group-head';
    const projectName = document.createElement('div');
    const projectNameStrong = document.createElement('b');
    projectNameStrong.textContent = group.projectName;
    projectName.appendChild(projectNameStrong);
    const count = document.createElement('div');
    count.className = 'mono';
    count.textContent = String(group.items.length);
    head.append(projectName, count);
    block.appendChild(head);

    for (const alert of group.items.slice(0, 8)) {
      const item = document.createElement('article');
      item.className = 'notification-item';
      item.dataset.openNotification = 'true';
      item.dataset.alertId = alert.id;
      item.dataset.projectId = group.projectId;
      item.dataset.sessionId = alert.payload?.sessionId || '';
      item.tabIndex = 0;
      const header = document.createElement('div');
      header.className = 'notification-title';
      header.textContent = group.projectName;
      const subheader = document.createElement('div');
      subheader.className = 'notification-subheader mono';
      subheader.textContent = notificationMessage(alert);
      const meta = document.createElement('div');
      meta.className = 'notification-meta mono';
      meta.textContent = new Date(alert.createdAt).toLocaleTimeString();
      const dismiss = document.createElement('button');
      dismiss.className = 'notification-dismiss';
      dismiss.type = 'button';
      dismiss.title = 'Dismiss';
      dismiss.dataset.dismissAlert = alert.id;
      dismiss.textContent = 'X';
      item.append(header, subheader, meta, dismiss);
      block.appendChild(item);
    }

    els.notificationGroups.appendChild(block);
  }
}

function renderFolderTabs() {
  const folderTabs = [];
  folderTabs.push({
    id: null,
    name: 'All',
    count: (state.dashboard?.projects || []).length
  });
  for (const folder of state.projectFolders) {
    let count = 0;
    for (const project of state.dashboard?.projects || []) {
      if (state.projectFolderByProject[project.id] === folder.id) {
        count += 1;
      }
    }
    folderTabs.push({
      id: folder.id,
      name: folder.name,
      count
    });
  }

  els.folderTabs.innerHTML = '';
  for (const tab of folderTabs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `small alt folder-tab${tab.id === state.activeFolderId ? ' active' : ''}`;
    button.dataset.folderId = tab.id || '';
    button.textContent = `${tab.name} (${tab.count})`;
    els.folderTabs.appendChild(button);
  }

  if (els.removeFolderBtn) {
    const hasFolders = state.projectFolders.length > 0;
    els.removeFolderBtn.disabled = !hasFolders;
    els.removeFolderBtn.title = hasFolders ? 'Remove a folder' : 'No folders to remove';
  }
}

function renderProjects() {
  const projects = projectsForHomeView();
  const groupedAlerts = alertsByProject();
  renderFolderTabs();

  if (!projects.length) {
    if (state.activeFolderId) {
      const folder = folderById(state.activeFolderId);
      const label = folder?.name || 'selected folder';
      els.projects.innerHTML = `<p class="mono">No active sessions in ${label}.</p>`;
    } else {
      els.projects.innerHTML = '<p class="mono">No projects yet.</p>';
    }
    return;
  }

  els.projects.innerHTML = '';

  for (const project of projects) {
    const node = els.projectTemplate.content.firstElementChild.cloneNode(true);
    node.classList.add('interactive');
    node.draggable = true;
    node.dataset.projectId = project.id;
    node.style.setProperty('--accent', project.color);

    const projectAlerts = groupedAlerts.get(project.id) || [];

    node.querySelector('.project-name').textContent = project.name;
    node.querySelector('.project-path').textContent = formatProjectPath(project);
    const docsStatus = project.structure?.docsExists ? 'present' : 'missing';
    const agentsStatus = project.structure?.agents?.healthy ? 'ok' : 'needs-fix';
    node.querySelector('.project-meta').textContent = `docs: ${project.docsDir} (${docsStatus}) | agents: ${agentsStatus}`;
    const assignedFolderId = state.projectFolderByProject[project.id] || null;
    const assignedFolder = folderById(assignedFolderId);
    if (assignedFolder) {
      node.querySelector('.project-meta').textContent += ` | folder: ${assignedFolder.name}`;
    }
    if (project.sshHost) {
      node.querySelector('.git-badge').textContent = project.isGit ? 'remote git' : 'remote non-git';
    } else {
      node.querySelector('.git-badge').textContent = project.isGit ? 'git' : 'non-git';
    }

    const alertIcon = node.querySelector('.alert-icon');
    if (projectAlerts.length > 0) {
      alertIcon.hidden = false;
      alertIcon.title = `${projectAlerts.length} project alerts require input`;
      alertIcon.textContent = String(projectAlerts.length);
    }

    const removeBtn = node.querySelector('[data-remove-project]');
    removeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteProject(project);
    });

    const setFolderBtn = document.createElement('button');
    setFolderBtn.type = 'button';
    setFolderBtn.className = 'small alt';
    setFolderBtn.textContent = assignedFolder ? `folder: ${assignedFolder.name}` : 'set folder';
    setFolderBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      await promptProjectFolder(project.id);
    });
    node.querySelector('.project-badges').appendChild(setFolderBtn);

    const mcp = project.mcpTools.map((tool) => tool.id).join(', ') || 'none';
    node.querySelector('.mcp-list').innerHTML = `<b>MCP tools</b><span class="mono">${mcp}</span>`;

    const skills = project.skills.map((skill) => `${skill.name} (${skill.target})`).join(', ') || 'none';
    node.querySelector('.skills-list').innerHTML = `<b>Skills</b><span class="mono">${skills}</span>`;
    const docsEntries = (project.structure?.docsEntries || [])
      .map((entry) => `${entry.kind === 'dir' ? '[dir]' : '[file]'} ${entry.name}`)
      .join(', ') || 'none';
    const agents = project.structure?.agents;
    const agentsText = !agents?.exists
      ? 'missing'
      : agents.isSymlink
        ? `symlink -> ${agents.symlinkTarget || 'unknown'} (${agents.healthy ? 'ok' : 'mismatch'})`
        : 'plain file';
    node.querySelector('.structure-list').innerHTML =
      `<b>Structure</b><span class="mono">AGENTS: ${agentsText}</span><span class="mono">docs entries: ${docsEntries}</span>`;

    node.addEventListener('click', async () => {
      await openWorkspace(project.id);
    });

    els.projects.appendChild(node);
  }
}

function applySessionHighlight() {
  for (const tile of els.terminalGrid.querySelectorAll('.terminal-tile.session-highlight')) {
    tile.classList.remove('session-highlight');
  }
  if (!state.highlightedSessionId) {
    return;
  }
  const tile = els.terminalGrid.querySelector(`[data-session-id="${state.highlightedSessionId}"]`);
  if (!tile) {
    return;
  }
  tile.classList.add('session-highlight');
  tile.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

  if (state.highlightTimer) {
    clearTimeout(state.highlightTimer);
  }
  state.highlightTimer = setTimeout(() => {
    tile.classList.remove('session-highlight');
    state.highlightedSessionId = null;
    state.highlightTimer = null;
  }, 2800);
}

function actionBtn(label, onClick) {
  const button = document.createElement('button');
  button.className = 'small';
  button.textContent = label;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function teardownTerminal(sessionId) {
  const item = state.terminals.get(sessionId);
  if (!item) {
    return;
  }
  if (item.resizeObserver) {
    item.resizeObserver.disconnect();
  }
  try {
    item.ws.close();
  } catch {
    // no-op
  }
  item.term.dispose();
  state.terminals.delete(sessionId);
}

function teardownAllTerminals() {
  for (const sessionId of state.terminals.keys()) {
    teardownTerminal(sessionId);
  }
}

function openLiveTerminal(session, mount) {
  teardownTerminal(session.id);

  const fitAddon = new FitAddon.FitAddon();
  const term = new Terminal({
    cols: WORKSPACE_TERM_COLS,
    rows: WORKSPACE_TERM_ROWS,
    fontSize: 13,
    fontFamily: 'IBM Plex Mono, Menlo, monospace',
    cursorBlink: true,
    convertEol: true,
    minimumContrastRatio: 4.5,
    theme: {
      background: '#020617',
      foreground: '#e2e8f0',
      cursor: '#e2e8f0',
      cursorAccent: '#020617',
      black: '#64748b',
      red: '#f87171',
      green: '#4ade80',
      yellow: '#facc15',
      blue: '#60a5fa',
      magenta: '#f472b6',
      cyan: '#22d3ee',
      white: '#e2e8f0',
      brightBlack: '#94a3b8',
      brightRed: '#fca5a5',
      brightGreen: '#86efac',
      brightYellow: '#fde047',
      brightBlue: '#93c5fd',
      brightMagenta: '#f9a8d4',
      brightCyan: '#67e8f9',
      brightWhite: '#f8fafc'
    }
  });
  term.loadAddon(fitAddon);
  term.open(mount);
  term.focus();

  // Route native clipboard events directly through the xterm textarea.
  // This keeps Cmd/Ctrl+C and Cmd/Ctrl+V reliable without permission prompts.
  const terminalTextarea = term.textarea;
  if (terminalTextarea) {
    terminalTextarea.addEventListener('copy', (event) => {
      const selection = term.getSelection();
      if (!selection) {
        return;
      }
      if (!event.clipboardData) {
        return;
      }
      event.preventDefault();
      event.clipboardData.setData('text/plain', selection);
      showToast('Copied selection to clipboard');
    });

    terminalTextarea.addEventListener('paste', (event) => {
      const pastedText = event.clipboardData?.getData('text/plain');
      if (typeof pastedText !== 'string') {
        return;
      }
      event.preventDefault();
      if (pastedText) {
        term.paste(pastedText);
      }
    });
  }

  term.attachCustomKeyEventHandler((event) => {
    if (event.type !== 'keydown') {
      return true;
    }
    const isCopyShortcut = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'c';
    if (isCopyShortcut && typeof term.hasSelection === 'function' && term.hasSelection()) {
      // Let the browser copy the selection. Do not send Ctrl+C to tmux in this case.
      return false;
    }
    return true;
  });

  if (typeof term.attachCustomWheelEventHandler === 'function') {
    term.attachCustomWheelEventHandler((event) => {
      const deltaY = Number(event.deltaY || 0);
      if (!deltaY) {
        return false;
      }
      event.preventDefault();
      const lines = Math.max(1, Math.round(Math.abs(deltaY) / 40));
      term.scrollLines(deltaY > 0 ? lines : -lines);
      return false;
    });
  }

  let hasActiveSelection = false;
  const pendingTerminalFrames = [];
  const MAX_PENDING_TERMINAL_FRAMES = 200;
  const queueTerminalFrame = (frame) => {
    if (pendingTerminalFrames.length >= MAX_PENDING_TERMINAL_FRAMES) {
      pendingTerminalFrames.shift();
    }
    pendingTerminalFrames.push(frame);
  };
  const flushTerminalFrames = () => {
    if (!pendingTerminalFrames.length) {
      return;
    }
    for (const frame of pendingTerminalFrames.splice(0)) {
      if (frame.type === 'output') {
        term.write(frame.data || '');
      } else if (frame.type === 'screen') {
        term.write('\u001b[H\u001b[2J' + (frame.data || ''));
      }
    }
  };
  term.onSelectionChange(() => {
    hasActiveSelection = typeof term.hasSelection === 'function' && term.hasSelection();
    if (!hasActiveSelection) {
      flushTerminalFrames();
    }
  });

  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${location.host}/ws/terminal?sessionId=${encodeURIComponent(session.id)}`);

  // Send terminal input (keystrokes, paste) to the server as JSON.
  term.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data }));
    }
  });

  ws.addEventListener('open', () => {
    try {
      fitAddon.fit();
    } catch {
      // no-op
    }
    ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
  });

  ws.addEventListener('error', () => {
    term.writeln('\r\n[connection error]');
  });

  // Handle all structured server messages.
  ws.addEventListener('message', (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    if (payload.type === 'output') {
      if (hasActiveSelection) {
        queueTerminalFrame({ type: 'output', data: payload.data || '' });
        return;
      }
      term.write(payload.data || '');
      return;
    }
    if (payload.type === 'screen') {
      if (hasActiveSelection) {
        queueTerminalFrame({ type: 'screen', data: payload.data || '' });
        return;
      }
      term.write('\u001b[H\u001b[2J' + (payload.data || ''));
      return;
    }
    if (payload.type === 'error') {
      term.writeln(`\r\n[error] ${payload.message}`);
      return;
    }
    if (payload.type === 'closed') {
      const detail = payload.exitCode ? ` (exit code ${payload.exitCode})` : '';
      term.writeln(`\r\n[session disconnected${detail}]`);
    }
  });

  const resizeObserver = new ResizeObserver(() => {
    try {
      fitAddon.fit();
    } catch {
      return;
    }
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    }
  });
  resizeObserver.observe(mount);

  requestAnimationFrame(() => {
    try {
      fitAddon.fit();
    } catch {
      // no-op
    }
  });

  state.terminals.set(session.id, { term, ws, resizeObserver });
}

function renderWorkspace() {
  const project = projectById(state.activeProjectId);
  if (!project) {
    closeWorkspace();
    return;
  }

  const splitActive = Boolean(els.terminalGridSplit && els.workspaceSplit && !els.workspaceSplit.hidden);
  const gridRoot = splitActive ? els.terminalGridSplit : els.terminalGrid;
  const hiddenGridRoot = splitActive ? els.terminalGrid : els.terminalGridSplit;
  if (hiddenGridRoot) {
    for (const tile of hiddenGridRoot.querySelectorAll('[data-session-id]')) {
      tile.remove();
    }
  }

  const sessions = sessionsForActiveProject();
  els.workspaceTitle.textContent = `${project.name} workspace`;
  renderProjectSwitcher();

  const activeSessionIds = new Set(sessions.map((s) => s.id));
  cleanupSessionTileSizes(project.id, activeSessionIds);
  const existingTiles = new Map();
  for (const tile of gridRoot.querySelectorAll('[data-session-id]')) {
    existingTiles.set(tile.dataset.sessionId, tile);
  }

  for (const [sessionId, tile] of existingTiles.entries()) {
    if (!activeSessionIds.has(sessionId)) {
      teardownTerminal(sessionId);
      tile.remove();
    }
  }

  if (!sessions.length) {
    els.terminalGridEmpty.hidden = false;
    return;
  }

  els.terminalGridEmpty.hidden = true;
  for (const session of sessions) {
    const lastInputText = session.lastInput ? session.lastInput : '(no input yet)';
    const kindClass = `terminal-kind-${session.kind}`;
    let tile = gridRoot.querySelector(`[data-session-id=\"${session.id}\"]`);
    if (!tile) {
      tile = document.createElement('article');
      tile.className = `terminal-tile ${kindClass}`;
      tile.classList.add('has-tile-actions');
      tile.dataset.sessionId = session.id;
      tile.dataset.sessionKind = session.kind;
      tile.draggable = false;
      const sizeControls = `
            <button class="small alt tile-size-btn" type="button" data-resize-session="${session.id}" data-axis="x" data-delta="1" title="Add width span">+W</button>
            <button class="small alt tile-size-btn" type="button" data-resize-session="${session.id}" data-axis="x" data-delta="-1" title="Remove width span">-W</button>
            <button class="small alt tile-size-btn" type="button" data-resize-session="${session.id}" data-axis="y" data-delta="1" title="Add height span">+H</button>
            <button class="small alt tile-size-btn" type="button" data-resize-session="${session.id}" data-axis="y" data-delta="-1" title="Remove height span">-H</button>
          `;
      tile.innerHTML = `
        <div class="tile-size-controls" data-size-controls>
          <button class="small alt tile-size-btn" type="button" data-stop-session="${session.id}" title="Stop session">Stop</button>
          ${sizeControls}
        </div>
        <div><b>${session.kind}</b></div>
        <div class="mono">${session.sshHost ? `host: ${session.sshHost}` : 'host: local'}</div>
        <div class="mono">tmux: ${session.tmuxName}</div>
        <div class="mono" data-last-input>last: ${lastInputText}</div>
        <div class="terminal-instance" data-terminal-mount="${session.id}"></div>
      `;
      gridRoot.appendChild(tile);
    }
    tile.classList.remove('terminal-kind-tmux', 'terminal-kind-codex', 'terminal-kind-claude');
    tile.classList.add(kindClass);
    tile.dataset.sessionKind = session.kind;
    tile.draggable = false;
    const tileSize = getSessionTileSize(project.id, session.id);
    tile.style.gridColumn = `span ${tileSize.width}`;
    tile.style.gridRow = `span ${tileSize.height}`;
    tile.style.setProperty('--tile-height-multiplier', String(tileSize.height));
    const label = tile.querySelector('[data-last-input]');
    if (label) {
      label.textContent = `last: ${lastInputText}`;
    }
    const mount = tile.querySelector('[data-terminal-mount]');
    if (!state.terminals.has(session.id)) {
      openLiveTerminal(session, mount);
    }
  }
  applySessionHighlight();
}

function renderProjectSwitcher() {
  if (!els.projectSwitcherWrap || !els.projectSwitcher) {
    return;
  }

  const projects = (state.dashboard?.projects || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const enabled = Boolean(state.activeProjectId) && projects.length > 1;
  els.projectSwitcherWrap.hidden = !enabled;
  if (!enabled) {
    return;
  }

  const currentValue = state.activeProjectId;
  els.projectSwitcher.innerHTML = '';
  for (const project of projects) {
    const option = document.createElement('option');
    option.value = project.id;
    option.textContent = project.name;
    els.projectSwitcher.appendChild(option);
  }
  els.projectSwitcher.value = currentValue;
}

function hideEditorMetaFields() {
  els.workspaceEditorSkillSelectWrap.hidden = true;
  els.workspaceEditorSkillActions.hidden = true;
  els.workspaceEditorDocsFileWrap.hidden = true;
}

function formatMcpLogEvent(event) {
  const ts = new Date(event.createdAt || Date.now()).toLocaleTimeString();
  const payload = event.payload || {};
  const target = payload.targetName || payload.target || 'unknown';
  const method = payload.method || 'method?';
  const status = payload.status || 'error';
  const duration = payload.durationMs != null ? `${payload.durationMs}ms` : '-';
  const reqId = payload.requestId || event.id || '';
  return `[${ts}] ${target} ${method} status=${status} duration=${duration} id=${reqId}`;
}

function renderMcpLogs() {
  els.workspaceLogsOutput.textContent = state.mcpLogLines.join('\n');
  els.workspaceLogsOutput.scrollTop = els.workspaceLogsOutput.scrollHeight;

  if (els.workspaceLogsOutputPane) {
    els.workspaceLogsOutputPane.textContent = state.mcpLogLines.join('\n');
    els.workspaceLogsOutputPane.scrollTop = els.workspaceLogsOutputPane.scrollHeight;
  }
}

function appendMcpLogLine(line) {
  state.mcpLogLines.push(String(line || '').trim());
  if (state.mcpLogLines.length > 500) {
    state.mcpLogLines = state.mcpLogLines.slice(-500);
  }
  renderMcpLogs();
}

function disconnectMcpLogs() {
  if (state.mcpLogsSocket) {
    try {
      state.mcpLogsSocket.close();
    } catch {
      // no-op
    }
    state.mcpLogsSocket = null;
  }
}

function connectMcpLogs() {
  if (state.mcpLogsSocket || !state.activeProjectId) {
    return;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws/mcp-logs`);
  socket.addEventListener('message', (event) => {
    let parsed = null;
    try {
      parsed = JSON.parse(String(event.data || '{}'));
    } catch {
      return;
    }
    if (parsed.type === 'mcp-log-bootstrap') {
      const lines = (parsed.events || []).map((item) => formatMcpLogEvent(item));
      state.mcpLogLines = lines.slice(-500);
      renderMcpLogs();
      return;
    }
    if (parsed.type === 'mcp-log' && parsed.event) {
      appendMcpLogLine(formatMcpLogEvent(parsed.event));
    }
  });
  socket.addEventListener('close', () => {
    if (state.mcpLogsSocket === socket) {
      state.mcpLogsSocket = null;
    }
  });
  state.mcpLogsSocket = socket;
}

function closeWorkspaceLogs() {
  els.workspaceLogs.hidden = true;
  if (els.workspaceSplit) {
    els.workspaceSplit.hidden = true;
  }
  if (els.workspaceLogsPane) {
    els.workspaceLogsPane.hidden = true;
  }
  if (els.terminalGrid) {
    els.terminalGrid.hidden = false;
  }
  disconnectMcpLogs();
}

function openWorkspaceLogs() {
  closeWorkspaceEditor();

  // Ultra-wide layout: show logs as a right-side pane and keep sessions in a left grid.
  const useSplit = window.matchMedia('(min-width: 2000px)').matches;
  if (els.workspaceSplit && els.terminalGridSplit) {
    els.workspaceSplit.hidden = !useSplit;
    if (useSplit) {
      els.workspaceLogs.hidden = true;
      els.terminalGrid.hidden = true;
      if (els.workspaceLogsPane) {
        els.workspaceLogsPane.hidden = false;
      }
    } else {
      els.workspaceLogs.hidden = false;
      els.terminalGrid.hidden = false;
      if (els.workspaceLogsPane) {
        els.workspaceLogsPane.hidden = true;
      }
    }
  } else {
    els.workspaceLogs.hidden = false;
  }

  if (!state.mcpLogLines.length) {
    state.mcpLogLines = ['Streaming MCP proxy interactions...'];
  }
  renderMcpLogs();
  connectMcpLogs();
  renderWorkspace();
}

function sortedSkills(project) {
  return (Array.isArray(project?.skills) ? project.skills : [])
    .slice()
    .sort((a, b) => String(a.name || a.id || '').localeCompare(String(b.name || b.id || '')));
}

function skillLabel(skill) {
  const name = String(skill?.name || skill?.id || '').trim() || 'skill';
  const target = String(skill?.target || 'codex').trim();
  return `${name} [${target}]`;
}

function populateSkillSelect(project, selectedSkillId = '') {
  const skills = sortedSkills(project);
  els.workspaceEditorSkillSelect.innerHTML = '';
  for (const skill of skills) {
    const option = document.createElement('option');
    option.value = String(skill.id || '').trim();
    option.textContent = skillLabel(skill);
    els.workspaceEditorSkillSelect.appendChild(option);
  }
  if (!skills.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No skills yet';
    els.workspaceEditorSkillSelect.appendChild(option);
    return;
  }
  const selected = skills.find((skill) => skill.id === selectedSkillId)?.id || skills[0].id;
  els.workspaceEditorSkillSelect.value = selected;
}

function setDocsFileOptions(files, selectedFile = '') {
  els.workspaceEditorDocsFile.innerHTML = '';
  const unique = Array.from(new Set((files || []).map((item) => String(item || '').trim()).filter(Boolean)));
  if (!unique.length) {
    unique.push('README.md');
  }
  if (selectedFile && !unique.includes(selectedFile)) {
    unique.unshift(selectedFile);
  }
  for (const file of unique) {
    const option = document.createElement('option');
    option.value = file;
    option.textContent = file;
    els.workspaceEditorDocsFile.appendChild(option);
  }
  const fallback = unique[0];
  els.workspaceEditorDocsFile.value = selectedFile && unique.includes(selectedFile) ? selectedFile : fallback;
}

async function loadDocsEditorFile(projectId, relativePath) {
  const payload = await api(`/api/projects/${projectId}/editor?kind=docs&relativePath=${encodeURIComponent(relativePath)}`);
  els.workspaceEditorInput.value = payload.content || '# Notes\n\n';
}

async function openWorkspaceEditor(kind, options = {}) {
  const project = projectById(state.activeProjectId);
  if (!project) {
    return;
  }

  closeWorkspaceLogs();
  state.workspaceEditorKind = kind;
  els.workspaceEditor.hidden = false;
  hideEditorMetaFields();
  els.workspaceEditorInput.hidden = false;
  setWorkspaceEditorSaveLabel('Save');

  if (kind === 'skills') {
    els.workspaceEditorTitle.textContent = 'SKILLS Launcher';
    els.workspaceEditorSkillSelectWrap.hidden = false;
    els.workspaceEditorSkillActions.hidden = false;
    els.workspaceEditorInput.hidden = true;
    els.workspaceEditorInput.value = '';
    populateSkillSelect(project);
    setWorkspaceEditorSaveLabel('Launch');
  } else if (kind === 'agents') {
    els.workspaceEditorTitle.textContent = 'AGENTS';
    const payload = await api(`/api/projects/${project.id}/editor?kind=agents`);
    els.workspaceEditorInput.value = payload.content || '# Claude Project Context\n\n- Add project-specific notes here.\n';
  } else if (kind === 'docs') {
    els.workspaceEditorTitle.textContent = 'DOCS';
    els.workspaceEditorDocsFileWrap.hidden = false;
    const preferredDocsFile = String(options.docsFile || '').trim();
    const current = preferredDocsFile || String(els.workspaceEditorDocsFile.value || '').trim();
    const filesPayload = await api(`/api/projects/${project.id}/editor?kind=docs-files`);
    setDocsFileOptions(filesPayload.files || [], current || 'README.md');
    const relativePath = els.workspaceEditorDocsFile.value;
    await loadDocsEditorFile(project.id, relativePath);
  }
  if (!els.workspaceEditorInput.hidden) {
    els.workspaceEditorInput.focus();
  }
}

function normalizeDocsRelativePath(value) {
  return String(value || '')
    .trim()
    .replace(/^\/+/, '');
}

async function openDocsPicker(projectId) {
  const project = projectById(projectId);
  if (!project) {
    return;
  }

  const filesPayload = await api(`/api/projects/${project.id}/editor?kind=docs-files`);
  const files = (filesPayload.files || []).map((item) => String(item || '').trim()).filter(Boolean);
  const chooser = await modalForm({
    title: 'Open Docs File',
    description: `${formatProjectPath(project)}/docs`,
    submitLabel: 'Open',
    fields: [
      {
        id: 'relativePath',
        label: 'File',
        type: 'select',
        value: files[0] || '__new__',
        options: [
          ...files.map((file) => ({ value: file, label: file })),
          { value: '__new__', label: '+ Create new file...' }
        ],
        required: true
      }
    ]
  });
  if (!chooser) {
    return;
  }

  let relativePath = String(chooser.relativePath || '').trim();
  if (relativePath === '__new__') {
    const created = await modalForm({
      title: 'Create Docs File',
      description: `${formatProjectPath(project)}/docs`,
      submitLabel: 'Create',
      fields: [
        {
          id: 'relativePath',
          label: 'New file path',
          type: 'text',
          value: 'README.md',
          placeholder: 'notes.md',
          required: true
        }
      ]
    });
    if (!created) {
      return;
    }
    relativePath = String(created.relativePath || '').trim();
  }

  relativePath = normalizeDocsRelativePath(relativePath);
  if (!relativePath) {
    await modalMessage('docs file path is required.', { title: 'Missing file path' });
    return;
  }

  await openWorkspaceEditor('docs', { docsFile: relativePath });
}

function closeWorkspaceEditor() {
  state.workspaceEditorKind = null;
  els.workspaceEditor.hidden = true;
  els.workspaceEditorInput.hidden = false;
  setWorkspaceEditorSaveLabel('Save');
}

async function saveWorkspaceEditor() {
  if (!state.activeProjectId || !state.workspaceEditorKind) {
    return;
  }

  const projectId = state.activeProjectId;
  const kind = state.workspaceEditorKind;
  const content = els.workspaceEditorInput.value;

  if (kind === 'agents') {
    if (!content.trim()) {
      await modalMessage('AGENTS content is required.', { title: 'Missing content' });
      return;
    }
    await api(`/api/projects/${projectId}/agents`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });
  } else if (kind === 'docs') {
    const relativePath = String(els.workspaceEditorDocsFile.value || '').trim();
    if (!relativePath) {
      await modalMessage('docs file is required.', { title: 'Missing file' });
      return;
    }
    await api(`/api/projects/${projectId}/docs`, {
      method: 'POST',
      body: JSON.stringify({ relativePath, content })
    });
  } else if (kind === 'skills') {
    const selectedSkillId = String(els.workspaceEditorSkillSelect.value || '').trim();
    await launchSkillSession(projectId, selectedSkillId);
    closeWorkspaceEditor();
    return;
  }

  await loadDashboard();
  closeWorkspaceEditor();
}

async function launchSkillSession(projectId, skillId) {
  const project = projectById(projectId);
  const selectedSkill = (project?.skills || []).find((skill) => skill.id === skillId);
  if (!selectedSkill) {
    await modalMessage('Select a skill first.', { title: 'No skill selected' });
    return false;
  }
  const orchestrator = String(selectedSkill.target || '').trim().toLowerCase();
  if (!['codex', 'claude'].includes(orchestrator)) {
    await modalMessage('Skill target must be codex or claude.', { title: 'Invalid target' });
    return false;
  }

  const launched = await api(`/api/projects/${projectId}/skills/authoring-session`, {
    method: 'POST',
    body: JSON.stringify({
      mode: 'existing',
      skillId: selectedSkill.id
    })
  });
  state.highlightedSessionId = launched.session?.id || null;
  await loadDashboard();
  return true;
}

async function startNewSkillBuilderSession(projectId, orchestrator) {
  const launched = await api(`/api/projects/${projectId}/skills/authoring-session`, {
    method: 'POST',
    body: JSON.stringify({
      mode: 'add',
      orchestrator
    })
  });
  state.highlightedSessionId = launched.session?.id || null;
  await loadDashboard();
}

async function openSkillsLauncherModal(projectId) {
  const project = projectById(projectId);
  if (!project) {
    return;
  }
  const skills = sortedSkills(project);
  let controls = null;
  const result = await openModalBase({
    title: 'Skills',
    submitLabel: 'Launch',
    cancelLabel: 'Cancel',
    bodyBuilder: (body) => {
      const skillLabelEl = document.createElement('label');
      skillLabelEl.textContent = 'Skill';
      const skillSelect = document.createElement('select');
      const createCodexOption = document.createElement('option');
      createCodexOption.value = '__new_codex__';
      createCodexOption.textContent = '+ Create new codex skill';
      skillSelect.appendChild(createCodexOption);
      const createClaudeOption = document.createElement('option');
      createClaudeOption.value = '__new_claude__';
      createClaudeOption.textContent = '+ Create new claude skill';
      skillSelect.appendChild(createClaudeOption);
      if (skills.length) {
        for (const skill of skills) {
          const option = document.createElement('option');
          option.value = String(skill.id || '').trim();
          option.textContent = skillLabel(skill);
          skillSelect.appendChild(option);
        }
      } else {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No skills available';
        skillSelect.appendChild(option);
      }
      skillLabelEl.appendChild(skillSelect);
      body.appendChild(skillLabelEl);

      controls = {
        skillSelect
      };
    }
  });

  if (result !== 'submit' || !controls) {
    return;
  }

  const skillId = String(controls.skillSelect.value || '').trim();
  if (skillId === '__new_codex__') {
    await startNewSkillBuilderSession(projectId, 'codex');
    return;
  }
  if (skillId === '__new_claude__') {
    await startNewSkillBuilderSession(projectId, 'claude');
    return;
  }
  if (!skillId) {
    await modalMessage('No skill selected.', { title: 'Skills' });
    return;
  }
  await launchSkillSession(projectId, skillId);
}

async function openWorkspace(projectId, options = {}) {
  const { pushHistory = true } = options;
  if (state.activeProjectId === projectId && document.body.classList.contains('workspace-open')) {
    if (pushHistory && window.location.pathname !== workspacePath(projectId)) {
      window.history.pushState({ projectId }, '', workspacePath(projectId));
    }
    return;
  }
  closeWorkspaceEditor();
  closeWorkspaceLogs();
  state.activeProjectId = projectId;
  els.workspace.hidden = false;
  document.body.classList.add('workspace-open');
  document.body.style.overflow = 'hidden';
  if (pushHistory && window.location.pathname !== workspacePath(projectId)) {
    window.history.pushState({ projectId }, '', workspacePath(projectId));
  }
  await loadDashboard();
}

function closeWorkspace(options = {}) {
  const { pushHistory = true } = options;
  els.workspace.hidden = true;
  closeWorkspaceEditor();
  closeWorkspaceLogs();
  document.body.classList.remove('workspace-open');
  document.body.style.overflow = '';
  state.activeProjectId = null;
  teardownAllTerminals();
  els.terminalGrid.innerHTML = '';
  els.terminalGridEmpty.hidden = false;
  if (pushHistory && window.location.pathname.startsWith('/projects/')) {
    window.history.pushState({}, '', '/');
  }
}

async function loadDashboard() {
  const data = await api('/api/dashboard');
  state.dashboard = data;
  state.projectFolders = Array.isArray(data.projectFolders) ? data.projectFolders : [];
  state.projectFolderByProject = data.projectFolderByProject && typeof data.projectFolderByProject === 'object'
    ? data.projectFolderByProject
    : {};
  state.activeFolderId = data.activeFolderId || null;
  reconcileFolderState(state.dashboard.projects || []);
  const configuredRepo = String(data?.settings?.mcpRepositoryBase || '').trim();
  els.homePath.textContent = configuredRepo
    ? `MCP repo URL: ${configuredRepo}`
    : 'MCP repo URL: set a GitHub SSH URL with push access';
  renderProjects();
  renderNotifications();
  renderProjectSwitcher();

  if (state.activeProjectId && projectById(state.activeProjectId)) {
    renderWorkspace();
    return;
  }
  if (state.activeProjectId && !projectById(state.activeProjectId)) {
    closeWorkspace({ pushHistory: true });
  }
}

async function spawnSession(projectId, kind) {
  try {
    await api(`/api/projects/${projectId}/sessions`, {
      method: 'POST',
      body: JSON.stringify({ kind })
    });
    await loadDashboard();
  } catch (error) {
    if (error.code === 'MISSING_CLI') {
      const tool = kind === 'codex' ? 'Codex' : 'Claude';
      const defaultUrl = kind === 'codex'
        ? 'https://github.com/openai/codex'
        : 'https://docs.anthropic.com/en/docs/claude-code/quickstart';
      const openDocs = await modalConfirm(
        `${tool} is not installed. Open download/setup instructions?`,
        { title: `${tool} Missing`, confirmLabel: 'Open docs' }
      );
      if (openDocs) {
        window.open(defaultUrl, '_blank', 'noopener,noreferrer');
      }
      await modalMessage(error.message, { title: 'Launch failed' });
      return;
    }
    await modalMessage(error.message, { title: 'Launch failed' });
  }
}

async function promptRunAutomation(projectId) {
  try {
    const payload = await api(`/api/projects/${projectId}/automations`);
    const automations = (payload.automations || []).filter((item) => !item.invalid);
    if (!automations.length) {
      await modalMessage('No valid automations found in .automations/*.json', { title: 'No automations' });
      return;
    }

    const fields = [
      {
        id: 'automationId',
        label: 'Automation',
        type: 'select',
        value: automations[0].id,
        options: automations.map((item) => ({
          value: item.id,
          label: `${item.name} (${item.sessionCount})`
        })),
        required: true
      }
    ];
    const selected = await modalForm({
      title: 'Run Automation',
      submitLabel: 'Run',
      fields
    });
    if (!selected) {
      return;
    }
    const normalized = String(selected.automationId || '').trim();
    const chosen = automations.find((item) => item.id === normalized) || null;
    if (!chosen) {
      await modalMessage('Automation not found.', { title: 'Invalid automation' });
      return;
    }

    const runResult = await api(`/api/projects/${projectId}/automations/run`, {
      method: 'POST',
      body: JSON.stringify({ automationId: chosen.id })
    });
    await loadDashboard();
    const launchedCount = Array.isArray(runResult.launched) ? runResult.launched.length : 0;
    await modalMessage(`Ran ${chosen.name} (${launchedCount} sessions launched).`, { title: 'Automation complete' });
  } catch (error) {
    await modalMessage(error.message, { title: 'Automation failed' });
  }
}

async function addSkillFromLauncher(projectId) {
  const values = await modalForm({
    title: 'Add Skill',
    submitLabel: 'Add',
    fields: [
      { id: 'name', label: 'Skill name', type: 'text', value: '', required: true },
      {
        id: 'target',
        label: 'Skill type',
        type: 'select',
        value: 'codex',
        options: [
          { value: 'codex', label: 'codex' },
          { value: 'claude', label: 'claude' }
        ],
        required: true
      }
    ]
  });
  if (!values) {
    return;
  }
  const name = String(values.name || '').trim();
  const targetInput = String(values.target || '').trim().toLowerCase();
  const target = ['codex', 'claude'].includes(targetInput) ? targetInput : '';
  if (!target) {
    await modalMessage('Skill type must be codex or claude.', { title: 'Invalid type' });
    return;
  }
  const content = `# ${name}\n\nDescribe the workflow steps.\n`;
  await api(`/api/projects/${projectId}/skills`, {
    method: 'POST',
    body: JSON.stringify({ name, target, content })
  });
  await loadDashboard();
  const project = projectById(projectId);
  if (project && state.workspaceEditorKind === 'skills') {
    populateSkillSelect(project);
    const added = (project.skills || []).find((skill) => String(skill.name || '').trim() === name || String(skill.id || '').trim() === name);
    if (added) {
      els.workspaceEditorSkillSelect.value = added.id;
    }
  }
}

async function removeSkillFromLauncher(projectId) {
  const skillId = String(els.workspaceEditorSkillSelect.value || '').trim();
  const project = projectById(projectId);
  const skill = (project?.skills || []).find((item) => item.id === skillId);
  if (!skill) {
    await modalMessage('Select a skill to remove.', { title: 'No skill selected' });
    return;
  }
  const confirmed = await modalConfirm(`Remove skill "${skill.name || skill.id}" from this project?`, {
    title: 'Remove Skill',
    confirmLabel: 'Remove'
  });
  if (!confirmed) {
    return;
  }
  await api(`/api/projects/${projectId}/skills/remove`, {
    method: 'POST',
    body: JSON.stringify({ skillId })
  });
  await loadDashboard();
  const nextProject = projectById(projectId);
  if (nextProject && state.workspaceEditorKind === 'skills') {
    populateSkillSelect(nextProject);
  }
}

async function addMcpRepositoryFromMainMenu() {
  const values = await modalForm({
    title: 'Set MCP Repo URL',
    submitLabel: 'Add',
    description: 'Use a GitHub SSH URL with push access. Example: git@github.com:your-org/apropos_mcp.git',
    fields: [
      { id: 'gitUrl', label: 'GitHub repo URL', type: 'text', value: '', required: true, placeholder: defaultMcpGithubRepoPlaceholder() }
    ]
  });
  if (!values) {
    return;
  }
  await api('/api/mcp/repositories', {
    method: 'POST',
    body: JSON.stringify({
      gitUrl: String(values.gitUrl || '').trim()
    })
  });
  await loadDashboard();
}

async function quickSetupMcpForProject(projectId) {
  const values = await modalForm({
    title: 'MCP Quick Setup',
    submitLabel: 'Setup',
    description: 'Set a GitHub SSH repo URL with push access. The repo is cloned under ~/.apropos/mcp/<repo-id>.',
    fields: [
      { id: 'gitUrl', label: 'GitHub repo URL', type: 'text', value: '', required: true, placeholder: defaultMcpGithubRepoPlaceholder() },
      { id: 'name', label: 'Name (optional)', type: 'text', value: '', required: false }
    ]
  });
  if (!values) {
    return;
  }

  const gitUrl = String(values.gitUrl || '').trim();
  const name = String(values.name || '').trim();
  const repoPayload = await api('/api/mcp/repositories', {
    method: 'POST',
    body: JSON.stringify({ gitUrl, name })
  });
  const clonePath = String(repoPayload?.repository?.clonePath || '~/.apropos/mcp').trim();

  const tools = Array.isArray(repoPayload?.repository?.tools) ? repoPayload.repository.tools : [];
  if (!tools.length) {
    await loadDashboard();
    await modalMessage(`Repository cloned to ${clonePath} but no MCP tools were discovered.`, { title: 'No tools found' });
    return;
  }

  let toolId = String(tools[0]?.id || '').trim();
  if (tools.length > 1) {
    const picked = await modalForm({
      title: 'Select MCP Tool',
      submitLabel: 'Setup',
      fields: [
        {
          id: 'toolId',
          label: 'Tool',
          type: 'select',
          value: toolId,
          options: tools.map((tool) => ({
            value: String(tool.id || ''),
            label: `${String(tool.name || tool.id || '')} (${String(tool.id || '')})`
          })),
          required: true
        }
      ]
    });
    if (!picked) {
      return;
    }
    toolId = String(picked.toolId || '').trim();
  }

  const result = await api(`/api/projects/${projectId}/mcp-tools/setup`, {
    method: 'POST',
    body: JSON.stringify({ toolId })
  });
  await loadDashboard();
  const launchedCount = Array.isArray(result.launched) ? result.launched.length : 0;
  const skippedCount = Array.isArray(result.skipped) ? result.skipped.length : 0;
  await modalMessage(
    `Repo cloned in ${clonePath}, tool "${toolId}" configured, setup launched ${launchedCount} session(s). Skipped: ${skippedCount}.`,
    { title: 'MCP setup started' }
  );
}

async function deleteProject(project) {
  const confirmRemove = await modalConfirm(`Remove project "${project.name}" from Apropos?`, {
    title: 'Remove Project',
    confirmLabel: 'Remove'
  });
  if (!confirmRemove) {
    return;
  }
  await api(`/api/projects/${project.id}`, { method: 'DELETE' });
  if (state.activeProjectId === project.id) {
    closeWorkspace();
  }
  if (state.projectFolderByProject[project.id]) {
    delete state.projectFolderByProject[project.id];
    await persistFolderState();
  }
  await loadDashboard();
}

function createFolderId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `folder-${crypto.randomUUID()}`;
  }
  return `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function addFolderFromPrompt() {
  const values = await modalForm({
    title: 'Add Folder',
    submitLabel: 'Add',
    fields: [
      { id: 'name', label: 'Folder name', type: 'text', value: '', required: true }
    ]
  });
  if (!values) {
    return;
  }
  const normalized = String(values.name || '').trim();
  if (!normalized) {
    return;
  }
  const duplicate = state.projectFolders.find((folder) => folder.name.toLowerCase() === normalized.toLowerCase());
  if (duplicate) {
    state.activeFolderId = duplicate.id;
    await persistFolderState();
    renderProjects();
    return;
  }
  const folder = { id: createFolderId(), name: normalized };
  state.projectFolders.push(folder);
  state.activeFolderId = folder.id;
  await persistFolderState();
  renderProjects();
}

async function removeFolderFromPrompt() {
  const folders = state.projectFolders || [];
  if (!folders.length) {
    await modalMessage('No folders to remove.', { title: 'No folders' });
    return;
  }

  const defaultFolderId = folderById(state.activeFolderId) ? state.activeFolderId : folders[0].id;
  const values = await modalForm({
    title: 'Remove Folder',
    submitLabel: 'Continue',
    fields: [
      {
        id: 'folder',
        label: 'Folder',
        type: 'select',
        value: defaultFolderId,
        options: folders.map((folder) => ({ value: folder.id, label: folder.name }))
      }
    ]
  });
  if (!values) {
    return;
  }

  const folderId = String(values.folder || '').trim();
  const targetFolder = folders.find((folder) => folder.id === folderId);
  if (!targetFolder) {
    await modalMessage('Folder not found.', { title: 'Invalid folder' });
    return;
  }

  const assignedCount = Object.values(state.projectFolderByProject || {})
    .filter((id) => id === targetFolder.id)
    .length;
  const confirmMessage = assignedCount > 0
    ? `Remove folder "${targetFolder.name}"? ${assignedCount} project assignment(s) will be cleared.`
    : `Remove folder "${targetFolder.name}"?`;
  const confirmed = await modalConfirm(confirmMessage, {
    title: 'Remove Folder',
    confirmLabel: 'Remove'
  });
  if (!confirmed) {
    return;
  }

  state.projectFolders = folders.filter((folder) => folder.id !== targetFolder.id);
  for (const [projectId, assignedFolderId] of Object.entries(state.projectFolderByProject || {})) {
    if (assignedFolderId === targetFolder.id) {
      delete state.projectFolderByProject[projectId];
    }
  }
  if (state.activeFolderId === targetFolder.id) {
    state.activeFolderId = null;
  }

  await persistFolderState();
  renderProjects();
  showToast(`Removed folder "${targetFolder.name}".`);
}

async function promptProjectFolder(projectId) {
  const folders = state.projectFolders || [];
  if (!folders.length) {
    await modalMessage('Create a folder first.', { title: 'No folders' });
    return;
  }
  const currentFolderId = state.projectFolderByProject[projectId] || '';
  const currentFolder = folderById(currentFolderId);
  const values = await modalForm({
    title: 'Assign Folder',
    submitLabel: 'Apply',
    fields: [
      {
        id: 'folder',
        label: 'Folder',
        type: 'select',
        value: currentFolder?.id || '',
        options: [
          { value: '', label: '(none)' },
          ...folders.map((folder) => ({ value: folder.id, label: folder.name }))
        ]
      }
    ]
  });
  if (!values) {
    return;
  }
  const normalized = String(values.folder || '').trim();
  if (!normalized) {
    delete state.projectFolderByProject[projectId];
    await persistFolderState();
    renderProjects();
    return;
  }
  const targetFolder = folders.find((folder) => folder.id === normalized);
  if (!targetFolder) {
    await modalMessage('Folder not found.', { title: 'Invalid folder' });
    return;
  }
  state.projectFolderByProject[projectId] = targetFolder.id;
  await persistFolderState();
  renderProjects();
}

async function addProjectFromPicker() {
  try {
    const picked = await pickDirectory();
    const projectPath = String(picked.path || '').trim();
    if (!projectPath) {
      return;
    }
    const derivedName = pathBasename(projectPath);
    await api('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        path: projectPath,
        name: derivedName
      })
    });
    await loadDashboard();
  } catch (error) {
    await modalMessage(error.message, { title: 'Add project failed' });
  }
}

async function addRemoteProject({ sshHost, projectPath, name }) {
  try {
    await api('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        path: String(projectPath).trim(),
        name: String(name || '').trim(),
        sshHost: String(sshHost).trim()
      })
    });
    await loadDashboard();
  } catch (error) {
    await modalMessage(error.message, { title: 'Add project failed' });
  }
}

async function showAddProjectModal() {
  let mode = 'local';
  const result = await openModalBase({
    title: 'Add Project',
    submitLabel: 'Continue',
    cancelLabel: 'Cancel',
    bodyBuilder: (body) => {
      const picker = document.createElement('div');
      picker.className = 'mode-picker';
      const localCard = document.createElement('button');
      localCard.type = 'button';
      localCard.className = 'mode-card active';
      localCard.dataset.mode = 'local';
      localCard.innerHTML = '<b>Local</b><div class="mono">Pick a folder on this machine</div>';
      const remoteCard = document.createElement('button');
      remoteCard.type = 'button';
      remoteCard.className = 'mode-card';
      remoteCard.dataset.mode = 'remote';
      remoteCard.innerHTML = '<b>Remote</b><div class="mono">Connect via SSH host + path</div>';

      const setMode = (nextMode) => {
        mode = nextMode;
        localCard.classList.toggle('active', nextMode === 'local');
        remoteCard.classList.toggle('active', nextMode === 'remote');
      };
      localCard.addEventListener('click', () => setMode('local'));
      remoteCard.addEventListener('click', () => setMode('remote'));
      picker.append(localCard, remoteCard);
      body.appendChild(picker);
    }
  });

  if (result !== 'submit') {
    return null;
  }

  if (mode === 'local') {
    return { mode: 'local' };
  }

  const remoteValues = await modalForm({
    title: 'Add Remote Project',
    submitLabel: 'Add Project',
    fields: [
      { id: 'sshHost', label: 'SSH host', type: 'text', value: '', required: true, placeholder: 'devbox or user@devbox' },
      { id: 'projectPath', label: 'Remote project path', type: 'text', value: '~/code/my-project', required: true },
      { id: 'name', label: 'Project name', type: 'text', value: '', required: false }
    ]
  });
  if (!remoteValues) {
    return null;
  }
  const pathValue = String(remoteValues.projectPath || '').trim();
  return {
    mode: 'remote',
    sshHost: String(remoteValues.sshHost || '').trim(),
    projectPath: pathValue,
    name: String(remoteValues.name || '').trim() || pathBasename(pathValue)
  };
}

els.addProjectFab.addEventListener('click', async () => {
  const selection = await showAddProjectModal();
  if (!selection) {
    return;
  }
  if (selection.mode === 'remote') {
    await addRemoteProject(selection);
    return;
  }
  await addProjectFromPicker();
});

els.addFolderBtn.addEventListener('click', async () => {
  await addFolderFromPrompt();
});

els.removeFolderBtn.addEventListener('click', async () => {
  await removeFolderFromPrompt();
});

els.mainMcpAddRepoBtn.addEventListener('click', async () => {
  try {
    await addMcpRepositoryFromMainMenu();
  } catch (error) {
    await modalMessage(error.message, { title: 'Add repo failed' });
  }
});

els.folderTabs.addEventListener('click', async (event) => {
  const tab = event.target.closest('button[data-folder-id]');
  if (!tab) {
    return;
  }
  const folderId = String(tab.dataset.folderId || '').trim() || null;
  state.activeFolderId = folderId;
  await persistFolderState();
  renderProjects();
});

els.notificationGroups.addEventListener('click', async (event) => {
  const dismissButton = event.target.closest('button[data-dismiss-alert]');
  if (dismissButton) {
    event.stopPropagation();
    await api(`/api/alerts/${dismissButton.dataset.dismissAlert}`, { method: 'DELETE' });
    await loadDashboard();
    return;
  }

  const item = event.target.closest('[data-open-notification]');
  if (!item) {
    return;
  }
  const alertId = item.dataset.alertId || '';
  const projectId = item.dataset.projectId;
  const sessionId = item.dataset.sessionId || null;
  if (!projectId) {
    return;
  }
  if (alertId) {
    try {
      await api(`/api/alerts/${alertId}`, { method: 'DELETE' });
    } catch {
      // Ignore stale alerts and continue navigation.
    }
  }
  state.highlightedSessionId = sessionId;
  await openWorkspace(projectId);
  setNotificationsOpen(false);
});

els.notificationGroups.addEventListener('keydown', async (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }
  const item = event.target.closest('[data-open-notification]');
  if (!item) {
    return;
  }
  event.preventDefault();
  const alertId = item.dataset.alertId || '';
  const projectId = item.dataset.projectId;
  const sessionId = item.dataset.sessionId || null;
  if (!projectId) {
    return;
  }
  if (alertId) {
    try {
      await api(`/api/alerts/${alertId}`, { method: 'DELETE' });
    } catch {
      // Ignore stale alerts and continue navigation.
    }
  }
  state.highlightedSessionId = sessionId;
  await openWorkspace(projectId);
  setNotificationsOpen(false);
});

els.notificationToggle.addEventListener('click', () => {
  setNotificationsOpen(!state.notificationsOpen);
});

els.notificationDismissAll?.addEventListener('click', async () => {
  await api('/api/alerts', { method: 'DELETE' });
  await loadDashboard();
});

els.projectSwitcher?.addEventListener('change', async (event) => {
  const nextProjectId = String(event.target?.value || '').trim();
  if (!nextProjectId || nextProjectId === state.activeProjectId) {
    return;
  }
  await openWorkspace(nextProjectId);
});

document.addEventListener('click', (event) => {
  if (!state.notificationsOpen) {
    return;
  }
  if (event.target.closest('.notification-shell')) {
    return;
  }
  setNotificationsOpen(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.notificationsOpen) {
    setNotificationsOpen(false);
  }
});

document.addEventListener('keydown', async (event) => {
  if (!event.metaKey) {
    return;
  }
  if (event.repeat) {
    return;
  }
  if (isEditableTarget(event.target)) {
    return;
  }
  const code = String(event.code || '');
  const key = String(event.key || '');
  const isBack = code === 'BracketLeft' || key === '[' || code === 'Comma' || key === ',';
  const isForward = code === 'BracketRight' || key === ']' || code === 'Period' || key === '.';
  if (!isBack && !isForward) {
    return;
  }
  const direction = isForward ? 1 : -1;
  try {
    if (event.ctrlKey && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      await cycleWorkspaceTab(direction);
      return;
    }
    if (event.altKey && !event.shiftKey && !event.ctrlKey) {
      event.preventDefault();
      await cycleProject(direction);
    }
  } catch (error) {
    await modalMessage(error.message, { title: 'Shortcut failed' });
  }
});

els.terminalGrid.addEventListener('click', async (event) => {
  const resizeButton = event.target.closest('button[data-resize-session]');
  if (resizeButton && state.activeProjectId) {
    event.stopPropagation();
    const sessionId = resizeButton.dataset.resizeSession;
    const axis = resizeButton.dataset.axis;
    const delta = Number(resizeButton.dataset.delta || 0);
    const current = getSessionTileSize(state.activeProjectId, sessionId);
    const next = {
      width: axis === 'x' ? current.width + delta : current.width,
      height: axis === 'y' ? current.height + delta : current.height
    };
    setSessionTileSize(state.activeProjectId, sessionId, next);
    renderWorkspace();
    return;
  }
  const stopButton = event.target.closest('button[data-stop-session]');
  if (stopButton) {
    await api(`/api/sessions/${stopButton.dataset.stopSession}`, { method: 'DELETE' });
    await loadDashboard();
  }
});

els.terminalGridSplit?.addEventListener('click', async (event) => {
  const stopButton = event.target.closest('button[data-stop-session]');
  if (stopButton) {
    await api(`/api/sessions/${stopButton.dataset.stopSession}`, { method: 'DELETE' });
    await loadDashboard();
    return;
  }
  const resizeButton = event.target.closest('button[data-resize-session]');
  if (resizeButton && state.activeProjectId) {
    event.stopPropagation();
    const sessionId = resizeButton.dataset.resizeSession;
    const axis = resizeButton.dataset.axis;
    const delta = Number(resizeButton.dataset.delta || 0);
    const current = getSessionTileSize(state.activeProjectId, sessionId);
    const next = {
      width: axis === 'x' ? current.width + delta : current.width,
      height: axis === 'y' ? current.height + delta : current.height
    };
    setSessionTileSize(state.activeProjectId, sessionId, next);
    renderWorkspace();
  }
});

els.terminalGrid.addEventListener('dragstart', (event) => {
  if (event.target.closest('.terminal-instance')) {
    event.preventDefault();
    return;
  }
  if (event.target.closest('button')) {
    return;
  }
  const tile = event.target.closest('[data-session-id]');
  if (!tile) {
    return;
  }
  state.draggingSessionId = tile.dataset.sessionId;
  tile.classList.add('dragging');
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', state.draggingSessionId);
  }
});

els.terminalGrid.addEventListener('dragover', (event) => {
  if (!state.draggingSessionId) {
    return;
  }
  const draggingTile = els.terminalGrid.querySelector(`[data-session-id="${state.draggingSessionId}"]`);
  const targetTile = event.target.closest('[data-session-id]');
  if (!draggingTile || !targetTile || draggingTile === targetTile) {
    return;
  }
  event.preventDefault();
  const rect = targetTile.getBoundingClientRect();
  const verticalLayout = window.matchMedia('(max-width: 1100px)').matches;
  const shouldInsertBefore = verticalLayout
    ? event.clientY < rect.top + rect.height / 2
    : event.clientX < rect.left + rect.width / 2;
  els.terminalGrid.insertBefore(draggingTile, shouldInsertBefore ? targetTile : targetTile.nextSibling);
});

els.terminalGrid.addEventListener('drop', (event) => {
  if (!state.draggingSessionId) {
    return;
  }
  event.preventDefault();
  persistOrderFromGrid();
});

els.terminalGrid.addEventListener('dragend', () => {
  for (const tile of els.terminalGrid.querySelectorAll('.terminal-tile.dragging')) {
    tile.classList.remove('dragging');
  }
  state.draggingSessionId = null;
});

els.projects.addEventListener('dragstart', (event) => {
  const card = event.target.closest('[data-project-id]');
  if (!card) {
    return;
  }
  state.draggingProjectId = card.dataset.projectId;
  card.classList.add('dragging');
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', state.draggingProjectId);
  }
});

els.projects.addEventListener('dragover', (event) => {
  if (!state.draggingProjectId) {
    return;
  }
  const draggingCard = els.projects.querySelector(`[data-project-id="${state.draggingProjectId}"]`);
  const targetCard = event.target.closest('[data-project-id]');
  if (!draggingCard || !targetCard || draggingCard === targetCard) {
    return;
  }
  event.preventDefault();
  const rect = targetCard.getBoundingClientRect();
  const shouldInsertBefore = event.clientY < rect.top + rect.height / 2;
  els.projects.insertBefore(draggingCard, shouldInsertBefore ? targetCard : targetCard.nextSibling);
});

els.projects.addEventListener('drop', (event) => {
  if (!state.draggingProjectId) {
    return;
  }
  event.preventDefault();
  persistProjectOrderFromGrid();
});

els.projects.addEventListener('dragend', () => {
  for (const card of els.projects.querySelectorAll('.project-card.dragging')) {
    card.classList.remove('dragging');
  }
  state.draggingProjectId = null;
});

els.workspace.addEventListener('click', async (event) => {
  const editorCloseButton = event.target.closest('button[data-editor-close]');
  if (editorCloseButton) {
    closeWorkspaceEditor();
    return;
  }

  const editorSaveButton = event.target.closest('button[data-editor-save]');
  if (editorSaveButton) {
    await saveWorkspaceEditor();
    return;
  }

  const skillAddButton = event.target.closest('button[data-skill-add]');
  if (skillAddButton && state.activeProjectId && state.workspaceEditorKind === 'skills') {
    await addSkillFromLauncher(state.activeProjectId);
    return;
  }

  const skillRemoveButton = event.target.closest('button[data-skill-remove]');
  if (skillRemoveButton && state.activeProjectId && state.workspaceEditorKind === 'skills') {
    await removeSkillFromLauncher(state.activeProjectId);
    return;
  }

  const logsClearButton = event.target.closest('button[data-logs-clear]');
  if (logsClearButton) {
    try {
      await api('/api/logs/clear', { method: 'POST' });
    } catch {
      // If the backend clear fails, still clear the UI.
    }
    state.mcpLogLines = [];
    renderMcpLogs();
    return;
  }

  const actionButton = event.target.closest('button[data-workspace-action]');
  if (actionButton && state.activeProjectId) {
    const { workspaceAction } = actionButton.dataset;
    if (workspaceAction === 'run-automation') {
      await promptRunAutomation(state.activeProjectId);
      return;
    }
    if (workspaceAction === 'skills') {
      await openSkillsLauncherModal(state.activeProjectId);
      return;
    }
    if (workspaceAction === 'logs') {
      if (!els.workspaceLogs.hidden || (els.workspaceSplit && !els.workspaceSplit.hidden)) {
        closeWorkspaceLogs();
      } else {
        openWorkspaceLogs();
      }
      return;
    }
    if (workspaceAction === 'mcp') {
      await quickSetupMcpForProject(state.activeProjectId);
      return;
    }
    if (workspaceAction === 'agents') {
      if (!els.workspaceEditor.hidden && state.workspaceEditorKind === 'agents') {
        closeWorkspaceEditor();
        return;
      }
      try {
        await openWorkspaceEditor(workspaceAction);
      } catch (error) {
        await modalMessage(error.message, { title: 'Editor error' });
      }
      return;
    }
  }

  const launchButton = event.target.closest('button[data-workspace-launch]');
  if (!launchButton || !state.activeProjectId) {
    return;
  }
  await spawnSession(state.activeProjectId, launchButton.dataset.workspaceLaunch);
});

els.workspaceEditorDocsFile?.addEventListener('change', async () => {
  if (!state.activeProjectId || state.workspaceEditorKind !== 'docs') {
    return;
  }
  const relativePath = String(els.workspaceEditorDocsFile.value || '').trim();
  if (!relativePath) {
    return;
  }
  try {
    await loadDocsEditorFile(state.activeProjectId, relativePath);
  } catch (error) {
    await modalMessage(error.message, { title: 'Docs load failed' });
  }
});

els.closeWorkspace?.addEventListener('click', () => {
  closeWorkspace({ pushHistory: true });
});


setInterval(() => {
  loadDashboard().catch((error) => {
    console.error(error);
  });
}, 12000);

window.addEventListener('popstate', async () => {
  const slug = projectSlugFromPathname();
  const projectId = projectIdFromSlug(slug);
  if (projectId) {
    await openWorkspace(projectId, { pushHistory: false });
    return;
  }
  closeWorkspace({ pushHistory: false });
});

loadDashboard()
  .then(async () => {
    const slug = projectSlugFromPathname();
    const projectId = projectIdFromSlug(slug);
    if (projectId) {
      await openWorkspace(projectId, { pushHistory: false });
    }
  })
  .catch((error) => {
    console.error(error);
    modalMessage(error.message, { title: 'Load failed' }).catch(() => {});
  });

window.addEventListener('error', (event) => {
  try {
    if (event?.error?.stack) {
      console.error(event.error.stack);
    }
  } catch {
    // ignore
  }
});

window.addEventListener('unhandledrejection', (event) => {
  try {
    if (event?.reason?.stack) {
      console.error(event.reason.stack);
    }
  } catch {
    // ignore
  }
});
