const { Terminal } = window;
const { FitAddon } = window;
const { WebLinksAddon } = window;


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
  dragHoverSessionId: '',
  dragLastSwapAt: 0,
  draggingProjectId: null,
  highlightedSessionId: null,
  highlightTimer: null,
  notificationsOpen: false,
  rouletteModeEnabled: loadRouletteModePreference(),
  rouletteIndexByProject: {},
  focusQueueIndex: 0,
  focusFallbackSessionId: '',
  focusFallbackSessionIdByProject: {},
  focusPinnedSessionIdByProject: {},
  projectSwitcherOpen: false,
  mobileContextOpen: false,
  notificationsSeenAt: loadNotificationSeenAt(),
  theme: 'dark',
  toastTimer: null,
  mcpLogsSocket: null,
  mcpLogEvents: [],
  logsFilter: 'all',
  logsView: 'mcp',
  diffLogEntries: [],
  diffLogLoading: false,
  diffLogError: '',
  diffLogGeneratedAt: ''
};

const WORKSPACE_TERM_COLS = 80;
const WORKSPACE_TERM_ROWS = 20;
const SESSION_ORDER_STORAGE_KEY = 'apropos.session-order.v1';
const SESSION_SIZE_STORAGE_KEY = 'apropos.session-size.v1';
const PROJECT_ORDER_STORAGE_KEY = 'apropos.project-order.v1';
const NOTIFICATION_SEEN_AT_STORAGE_KEY = 'apropos.notifications.seen-at.v1';
const ROULETTE_MODE_STORAGE_KEY = 'apropos.roulette-mode.v1';
const ACTIVE_PROJECT_STORAGE_KEY = 'apropos.active-project.v1';
const THEME_STORAGE_KEY = 'apropos.theme.v1';
const TERMINAL_THEME_DARK = {
  background: '#131c2c',
  foreground: '#dfe5ee',
  cursor: '#d7deea',
  cursorAccent: '#131c2c',
  black: '#5f6f86',
  red: '#c78886',
  green: '#7ea88f',
  yellow: '#c1ab7a',
  blue: '#7e97bf',
  magenta: '#b497bb',
  cyan: '#79a8b2',
  white: '#dfe5ee',
  brightBlack: '#7d8da5',
  brightRed: '#ddb0af',
  brightGreen: '#9fc0ab',
  brightYellow: '#d7c49a',
  brightBlue: '#9fb3d2',
  brightMagenta: '#c5afca',
  brightCyan: '#9bc0c8',
  brightWhite: '#f0f3f7'
};
const TERMINAL_THEME_LIGHT = {
  background: '#f2e6d1',
  foreground: '#352d23',
  cursor: '#5d4f3e',
  cursorAccent: '#f2e6d1',
  black: '#5f5a50',
  red: '#9f4b40',
  green: '#466a4f',
  yellow: '#876c2d',
  blue: '#3f5f8a',
  magenta: '#75507a',
  cyan: '#3e6f78',
  white: '#d8c7ab',
  brightBlack: '#726a5f',
  brightRed: '#b75a4f',
  brightGreen: '#578061',
  brightYellow: '#9f8136',
  brightBlue: '#4b73a6',
  brightMagenta: '#8a6090',
  brightCyan: '#4c858f',
  brightWhite: '#f7efe2'
};
const LUCIDE_ICON_PATHS = {
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  moveHorizontalPlus: '<path d="M5 12h14"/><path d="m5 12 3-3"/><path d="m5 12 3 3"/><path d="m19 12-3-3"/><path d="m19 12-3 3"/>',
  moveHorizontalMinus: '<path d="M5 12h14"/><path d="m5 12 3-3"/><path d="m5 12 3 3"/><path d="m19 12-3-3"/><path d="m19 12-3 3"/>',
  moveVerticalPlus: '<path d="M12 5v14"/><path d="m12 5-3 3"/><path d="m12 5 3 3"/><path d="m12 19-3-3"/><path d="m12 19 3-3"/>',
  moveVerticalMinus: '<path d="M12 5v14"/><path d="m12 5-3 3"/><path d="m12 5 3 3"/><path d="m12 19-3-3"/><path d="m12 19 3-3"/>'
};
const INTERNAL_MARKDOWN_LINK_RE = /\b(?:\.\/)?[^\s`"'()<>]+\.md(?::\d+)?(?:#L\d+)?\b/g;

const els = {
  homePath: document.querySelector('#homePath'),
  projects: document.querySelector('#projects'),
  folderTabs: document.querySelector('#folderTabs'),
  removeFolderBtn: document.querySelector('#removeFolderBtn'),
  addFolderBtn: document.querySelector('#addFolderBtn'),
  addProjectFab: document.querySelector('#addProjectFab'),
  projectTemplate: document.querySelector('#projectTemplate'),
  projectSwitcherWrap: document.querySelector('[data-project-switcher]'),
  projectSwitcherTrigger: document.querySelector('#projectSwitcherTrigger'),
  projectSwitcherMenu: document.querySelector('#projectSwitcherMenu'),
  workspace: document.querySelector('#workspace'),
  workspaceTitle: document.querySelector('#workspaceTitle'),
  workspaceMcpDropdown: document.querySelector('#workspaceMcpDropdown'),
  workspaceMcpMenu: document.querySelector('#workspaceMcpMenu'),
  workspaceEditor: document.querySelector('#workspaceEditor'),
  workspaceEditorMeta: document.querySelector('#workspaceEditorMeta'),
  workspaceEditorTitle: document.querySelector('#workspaceEditorTitle'),
  workspaceEditorInput: document.querySelector('#workspaceEditorInput'),
  workspaceEditorSkillSelectWrap: document.querySelector('[data-editor-skill-select]'),
  workspaceEditorSkillSelect: document.querySelector('#workspaceEditorSkillSelect'),
  workspaceEditorSkillActions: document.querySelector('[data-editor-skill-actions]'),
  workspaceEditorDocsFileWrap: document.querySelector('[data-editor-docs-file]'),
  workspaceEditorDocsFile: document.querySelector('#workspaceEditorDocsFile'),
  workspaceEditorAgentsSystem: document.querySelector('[data-editor-agents-system]'),
  workspaceEditorAgentsSystemSelect: document.querySelector('#workspaceEditorAgentsSystem'),
  workspaceLogs: document.querySelector('#workspaceLogs'),
  workspaceLogsOutput: document.querySelector('#workspaceLogsOutput'),
  workspaceSplit: document.querySelector('#workspaceSplit'),
  workspaceLogsPane: document.querySelector('#workspaceLogsPane'),
  workspaceLogsOutputPane: document.querySelector('#workspaceLogsOutputPane'),
  terminalGridSplit: document.querySelector('#terminalGridSplit'),
  notificationShell: document.querySelector('.notification-shell'),
  notificationToolbarContent: document.querySelector('[data-context-content]'),
  mobileContextToggle: document.querySelector('#mobileContextToggle'),
  mobileContextBadge: document.querySelector('#mobileContextBadge'),
  notificationCenter: document.querySelector('#notificationCenter'),
  notificationToggle: document.querySelector('#notificationToggle'),
  rouletteModeToggle: document.querySelector('#rouletteModeToggle'),
  themeToggle: document.querySelector('#themeToggle'),
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

function lucideIcon(name, className = '') {
  const paths = LUCIDE_ICON_PATHS[name];
  if (!paths) {
    return '';
  }
  const classes = ['lucide', className].filter(Boolean).join(' ');
  return `<svg class="${classes}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
}

function loadThemePreference() {
  try {
    const value = String(localStorage.getItem(THEME_STORAGE_KEY) || '').trim().toLowerCase();
    if (value === 'light' || value === 'dark') {
      return value;
    }
  } catch {
    // Ignore storage read issues and fall back.
  }
  return 'dark';
}

function saveThemePreference(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage write issues and continue.
  }
}

function applyTheme(theme, { persist = true } = {}) {
  const nextTheme = theme === 'light' ? 'light' : 'dark';
  state.theme = nextTheme;
  document.body.dataset.theme = nextTheme;
  updateLiveTerminalThemes(nextTheme);
  if (els.themeToggle) {
    const isDark = nextTheme === 'dark';
    els.themeToggle.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
    els.themeToggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    els.themeToggle.title = isDark ? 'Dark mode' : 'Light mode';
  }
  if (persist) {
    saveThemePreference(nextTheme);
  }
}

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

function isMobileViewport() {
  return window.matchMedia('(max-width: 900px)').matches;
}

function setMobileContextOpen(open) {
  const next = Boolean(open);
  state.mobileContextOpen = next;
  document.body.classList.toggle('mobile-context-open', next);
  if (els.mobileContextToggle) {
    els.mobileContextToggle.setAttribute('aria-expanded', next ? 'true' : 'false');
  }
  if (!next) {
    setProjectSwitcherOpen(false);
    if (state.notificationsOpen) {
      setNotificationsOpen(false);
    }
  }
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

function openModalBase({ title, submitLabel = 'OK', cancelLabel = 'Cancel', hideCancel = false, hideSubmit = false, bodyBuilder }) {
  if (activeModalResolver) {
    closeActiveModal(null);
  }
  els.appModalTitle.textContent = title;
  els.appModalSubmit.textContent = submitLabel;
  els.appModalSubmit.hidden = hideSubmit;
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
      let datalistCount = 0;
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
          if (Array.isArray(field.suggestions) && field.suggestions.length > 0) {
            datalistCount += 1;
            const listId = `modal-form-list-${datalistCount}`;
            const datalist = document.createElement('datalist');
            datalist.id = listId;
            for (const suggestion of field.suggestions) {
              const value = String(suggestion || '').trim();
              if (!value) {
                continue;
              }
              const option = document.createElement('option');
              option.value = value;
              datalist.appendChild(option);
            }
            input.setAttribute('list', listId);
            body.appendChild(datalist);
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

function setWorkspaceEditorPlainMode(enabled) {
  const next = Boolean(enabled);
  if (els.workspaceEditor) {
    els.workspaceEditor.classList.toggle('plain-mode', next);
  }
  if (els.workspaceEditorMeta) {
    els.workspaceEditorMeta.hidden = next;
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

applyTheme(loadThemePreference(), { persist: false });
setMobileContextOpen(false);

els.themeToggle?.addEventListener('click', () => {
  const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
});

function projectSlugFromPathname() {
  const match = window.location.pathname.match(/^\/projects\/([^/]+)\/?$/);
  if (!match) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
      return null;
  }
}

function loadActiveProjectId() {
  try {
    const raw = localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
    const value = String(raw || '').trim();
    return value || null;
  } catch {
    return null;
  }
}

function saveActiveProjectId(projectId) {
  try {
    const value = String(projectId || '').trim();
    if (!value) {
      localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
      return;
    }
    localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, value);
  } catch {
    // Ignore storage write failures and continue.
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

let sessionSizePersistTimer = null;
function persistSessionSizeByProject() {
  if (sessionSizePersistTimer) {
    clearTimeout(sessionSizePersistTimer);
  }
  sessionSizePersistTimer = setTimeout(async () => {
    sessionSizePersistTimer = null;
    try {
      await api('/api/workspace/session-sizes', {
        method: 'POST',
        body: JSON.stringify({ sessionTileSizesByProject: state.sessionSizeByProject })
      });
    } catch {
      // Ignore persistence failures; local state still applies for this session.
    }
  }, 160);
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

function sessionSizeStorageKey(projectId, sessionId) {
  const session = (state.dashboard?.sessions || []).find((item) => item.id === sessionId && item.projectId === projectId);
  if (session?.tmuxName) {
    const host = String(session.sshHost || 'local').trim() || 'local';
    return `tmux:${host}:${session.tmuxName}`;
  }
  return `session:${sessionId}`;
}

function sessionKindStorageKey(projectId, sessionId) {
  const session = (state.dashboard?.sessions || []).find((item) => item.id === sessionId && item.projectId === projectId);
  if (!session?.kind) {
    return '';
  }
  return `kind:${String(session.kind).trim().toLowerCase()}`;
}

function getSessionTileSize(projectId, sessionId) {
  const projectSizes = state.sessionSizeByProject[projectId] || {};
  const storageKey = sessionSizeStorageKey(projectId, sessionId);
  const kindKey = sessionKindStorageKey(projectId, sessionId);
  const raw = projectSizes[storageKey] || projectSizes[sessionId] || (kindKey ? projectSizes[kindKey] : null);
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
  const storageKey = sessionSizeStorageKey(projectId, sessionId);
  const kindKey = sessionKindStorageKey(projectId, sessionId);
  const nextProject = {
    ...(state.sessionSizeByProject[projectId] || {}),
    [storageKey]: { width, height }
  };
  if (kindKey) {
    nextProject[kindKey] = { width, height };
  }
  // Clean up old session-id key if present after migrating to tmux-scoped key.
  if (storageKey !== sessionId && Object.prototype.hasOwnProperty.call(nextProject, sessionId)) {
    delete nextProject[sessionId];
  }
  state.sessionSizeByProject = {
    ...state.sessionSizeByProject,
    [projectId]: nextProject
  };
  saveSessionSizeByProject();
  persistSessionSizeByProject();
}

function cleanupSessionTileSizes(projectId, sessions) {
  if (!Array.isArray(sessions) || !sessions.length) {
    return;
  }
  const current = state.sessionSizeByProject[projectId];
  if (!current || typeof current !== 'object') {
    return;
  }
  const activeKeys = new Set();
  for (const session of sessions) {
    const host = String(session.sshHost || 'local').trim() || 'local';
    activeKeys.add(`tmux:${host}:${session.tmuxName}`);
    activeKeys.add(session.id);
    activeKeys.add(`session:${session.id}`);
  }
  const entries = Object.entries(current);
  const cleaned = {};
  let changed = false;
  for (const [storageKey, size] of entries) {
    if (activeKeys.has(storageKey)) {
      cleaned[storageKey] = size;
    } else {
      changed = true;
    }
  }
  if (!changed) {
    return;
  }
  state.sessionSizeByProject = {
    ...state.sessionSizeByProject,
    [projectId]: cleaned
  };
  saveSessionSizeByProject();
  persistSessionSizeByProject();
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

function loadRouletteModePreference() {
  try {
    const raw = String(localStorage.getItem(ROULETTE_MODE_STORAGE_KEY) || '').trim().toLowerCase();
    return raw === '1' || raw === 'true';
  } catch {
    return false;
  }
}

function saveRouletteModePreference() {
  try {
    localStorage.setItem(ROULETTE_MODE_STORAGE_KEY, state.rouletteModeEnabled ? '1' : '0');
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

function projectsForHomeView() {
  const projects = orderedProjects(state.dashboard?.projects || []);
  if (!state.activeFolderId) {
    return projects;
  }
  return projects.filter((project) => {
    const folderId = state.projectFolderByProject[project.id];
    return folderId === state.activeFolderId;
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

function sessionOrderKey(session) {
  if (!session) {
    return '';
  }
  if (session.tmuxName) {
    const host = String(session.sshHost || 'local').trim() || 'local';
    return `tmux:${host}:${session.tmuxName}`;
  }
  return `session:${session.id}`;
}

function orderedSessions(projectId, sessions) {
  const sessionByKey = new Map();
  const sessionById = new Map();
  for (const session of sessions) {
    sessionByKey.set(sessionOrderKey(session), session);
    sessionById.set(session.id, session);
  }

  const previous = Array.isArray(state.sessionOrderByProject[projectId]) ? state.sessionOrderByProject[projectId] : [];
  const nextOrder = [];
  for (const token of previous) {
    if (sessionByKey.has(token) && !nextOrder.includes(token)) {
      nextOrder.push(token);
      continue;
    }
    // Migrate legacy id-based ordering entries to stable tmux-scoped keys.
    if (sessionById.has(token)) {
      const migratedKey = sessionOrderKey(sessionById.get(token));
      if (migratedKey && !nextOrder.includes(migratedKey)) {
        nextOrder.push(migratedKey);
      }
    }
  }

  const missing = sessions
    .filter((session) => !nextOrder.includes(sessionOrderKey(session)))
    .sort(compareSessionsStable)
    .map((session) => sessionOrderKey(session));
  nextOrder.push(...missing);

  const changed = nextOrder.length !== previous.length || nextOrder.some((id, index) => id !== previous[index]);
  if (changed) {
    state.sessionOrderByProject[projectId] = nextOrder;
    saveSessionOrder();
  }

  const rank = new Map(nextOrder.map((id, index) => [id, index]));
  return sessions.slice().sort((a, b) => {
    const aKey = sessionOrderKey(a);
    const bKey = sessionOrderKey(b);
    const aRank = rank.has(aKey) ? rank.get(aKey) : Number.MAX_SAFE_INTEGER;
    const bRank = rank.has(bKey) ? rank.get(bKey) : Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) {
      return aRank - bRank;
    }
    return compareSessionsStable(a, b);
  });
}

function activeSessionGridRoot() {
  const splitActive = Boolean(els.workspaceSplit && !els.workspaceSplit.hidden && els.terminalGridSplit);
  return splitActive ? els.terminalGridSplit : els.terminalGrid;
}

function persistOrderFromGrid(gridRoot = activeSessionGridRoot()) {
  if (!state.activeProjectId) {
    return;
  }
  if (!gridRoot) {
    return;
  }
  const orderedKeys = [...gridRoot.querySelectorAll('[data-session-id]')]
    .map((tile) => {
      const session = sessionById(tile.dataset.sessionId);
      return sessionOrderKey(session);
    })
    .filter(Boolean);
  state.sessionOrderByProject[state.activeProjectId] = orderedKeys;
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

function sessionsForProject(projectId) {
  if (!projectId) {
    return [];
  }
  return (state.dashboard?.sessions || []).filter((item) => item.projectId === projectId);
}

function sessionById(sessionId) {
  if (!sessionId) {
    return null;
  }
  return (state.dashboard?.sessions || []).find((item) => item.id === sessionId) || null;
}

function dedupeKeyForNotificationAlert(alert) {
  const payload = alert?.payload || {};
  const sessionId = String(payload.sessionId || '').trim();
  const tmuxName = String(payload.tmuxName || '').trim();
  const sshHost = String(payload.sshHost || '').trim();
  const projectId = String(payload.projectId || '').trim();
  const kind = String(payload.kind || '').trim().toLowerCase();
  const type = String(alert?.type || '').trim();
  const sessionRef = sessionId || `${tmuxName}|${sshHost}`;
  if (sessionRef) {
    return `${type}|${projectId}|${kind}|${sessionRef}`;
  }
  return `${type}|${projectId}|${kind}`;
}

function notificationAlerts() {
  const source = (state.dashboard?.alerts || []).filter((item) => {
    const type = String(item?.type || '').trim();
    if (!type.startsWith('session.')) {
      return false;
    }
    return Boolean(item.payload?.projectId || item.payload?.projectName);
  });
  const sorted = source
    .slice()
    .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  const seen = new Set();
  const deduped = [];
  for (const alert of sorted) {
    const key = dedupeKeyForNotificationAlert(alert);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(alert);
  }
  return deduped;
}

function rouletteNotificationsForProject(projectId) {
  return notificationAlerts()
    .filter((alert) => String(alert.payload?.projectId || '') === String(projectId || ''))
    .sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0));
}

function rouletteIndexForProject(projectId, total) {
  if (!projectId || total <= 0) {
    return 0;
  }
  const current = Number(state.rouletteIndexByProject[projectId]);
  const normalized = Number.isFinite(current) ? ((current % total) + total) % total : 0;
  state.rouletteIndexByProject[projectId] = normalized;
  return normalized;
}

function focusFallbackTmuxSessionForProject(projectId, tmuxSessions = []) {
  if (!projectId || !tmuxSessions.length) {
    if (projectId) {
      delete state.focusFallbackSessionIdByProject[projectId];
    }
    return null;
  }

  const currentId = state.focusFallbackSessionIdByProject[projectId];
  if (currentId) {
    const existing = tmuxSessions.find((session) => session.id === currentId);
    if (existing) {
      return existing;
    }
  }

  const randomIndex = Math.floor(Math.random() * tmuxSessions.length);
  const chosen = tmuxSessions[randomIndex] || tmuxSessions[0] || null;
  if (chosen?.id) {
    state.focusFallbackSessionIdByProject[projectId] = chosen.id;
  }
  return chosen;
}

function rouletteSelectionForProject(projectId, sessions = []) {
  const tmuxSessions = sessions.filter((session) => session.kind === 'tmux');
  const items = rouletteNotificationsForProject(projectId);
  if (!items.length) {
    return {
      items,
      index: 0,
      alert: null,
      session: focusFallbackTmuxSessionForProject(projectId, tmuxSessions),
      hasNotificationMatch: true
    };
  }

  const total = items.length;
  const start = rouletteIndexForProject(projectId, total);
  for (let offset = 0; offset < total; offset += 1) {
    const index = (start + offset) % total;
    const alert = items[index];
    const payload = alert?.payload || {};
    const sessionId = String(payload.sessionId || '').trim();
    const payloadTmuxName = String(payload.tmuxName || '').trim();
    const payloadHost = String(payload.sshHost || '').trim();
    let match = null;
    if (sessionId) {
      match = tmuxSessions.find((session) => String(session.id) === sessionId) || null;
    }
    if (!match && payloadTmuxName) {
      match = tmuxSessions.find((session) => (
        session.tmuxName === payloadTmuxName
        && String(session.sshHost || '').trim() === payloadHost
      )) || tmuxSessions.find((session) => session.tmuxName === payloadTmuxName) || null;
    }
    if (match) {
      state.rouletteIndexByProject[projectId] = index;
      return {
        items,
        index,
        alert,
        session: match,
        hasNotificationMatch: true
      };
    }
  }

  return {
    items,
    index: start,
    alert: items[start] || null,
    session: focusFallbackTmuxSessionForProject(projectId, tmuxSessions),
    hasNotificationMatch: false
  };
}

function focusSessions(projectId = '') {
  const sessions = Array.isArray(state.dashboard?.sessions) ? state.dashboard.sessions.slice() : [];
  const sorted = sessions.sort(compareSessionsStable);
  const targetProjectId = String(projectId || '').trim();
  if (!targetProjectId) {
    return sorted;
  }
  const projectScoped = sorted.filter((session) => String(session.projectId || '') === targetProjectId);
  return projectScoped.length ? projectScoped : sorted;
}

function focusNotifications(projectId = '') {
  const priority = (alert) => {
    if (alert?.type === 'session.agent_question') {
      return 0;
    }
    if (alert?.type === 'session.agent_idle') {
      return 1;
    }
    return 2;
  };
  const sorted = notificationAlerts().slice().sort((a, b) => {
    const priorityDelta = priority(a) - priority(b);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0);
  });
  const targetProjectId = String(projectId || '').trim();
  if (!targetProjectId) {
    return sorted;
  }
  const projectScoped = sorted.filter((alert) => String(alert?.payload?.projectId || '') === targetProjectId);
  return projectScoped.length ? projectScoped : sorted;
}

function focusQueueIndex(total) {
  if (total <= 0) {
    state.focusQueueIndex = 0;
    return 0;
  }
  const current = Number(state.focusQueueIndex);
  const normalized = Number.isFinite(current) ? ((current % total) + total) % total : 0;
  state.focusQueueIndex = normalized;
  return normalized;
}

function sessionMatchForNotification(alert, sessions = []) {
  const payload = alert?.payload || {};
  const sessionId = String(payload.sessionId || '').trim();
  const payloadTmuxName = String(payload.tmuxName || '').trim();
  const payloadHost = String(payload.sshHost || '').trim();
  const payloadProjectId = String(payload.projectId || '').trim();
  const payloadKind = String(payload.kind || '').trim().toLowerCase();
  let match = null;
  if (sessionId) {
    match = sessions.find((session) => String(session.id) === sessionId) || null;
  }
  if (!match && payloadTmuxName) {
    match = sessions.find((session) => (
      session.tmuxName === payloadTmuxName
      && String(session.sshHost || '').trim() === payloadHost
    )) || sessions.find((session) => session.tmuxName === payloadTmuxName) || null;
  }
  if (!match && payloadProjectId) {
    const projectSessions = sessions.filter((session) => String(session.projectId || '') === payloadProjectId);
    if (projectSessions.length) {
      if (payloadKind) {
        match = projectSessions.find((session) => String(session.kind || '').toLowerCase() === payloadKind) || null;
      }
      if (!match) {
        match = projectSessions.slice().sort(compareSessionsStable).at(-1) || projectSessions[0] || null;
      }
    }
  }
  return match;
}

function pickRandomFocusSession(sessions = [], { avoidSessionId = '', projectId = '' } = {}) {
  const targetProjectId = String(projectId || '').trim();
  if (!sessions.length) {
    state.focusFallbackSessionId = '';
    if (targetProjectId) {
      delete state.focusFallbackSessionIdByProject[targetProjectId];
    }
    return null;
  }
  const current = String(avoidSessionId || '').trim();
  const pool = sessions.length > 1 && current
    ? sessions.filter((session) => session.id !== current)
    : sessions;
  const randomIndex = Math.floor(Math.random() * pool.length);
  const selected = pool[randomIndex] || pool[0] || null;
  state.focusFallbackSessionId = selected?.id || '';
  if (targetProjectId) {
    state.focusFallbackSessionIdByProject[targetProjectId] = selected?.id || '';
  }
  return selected;
}

function focusFallbackSession(sessions = [], projectId = '') {
  const targetProjectId = String(projectId || '').trim();
  if (!sessions.length) {
    state.focusFallbackSessionId = '';
    if (targetProjectId) {
      delete state.focusFallbackSessionIdByProject[targetProjectId];
    }
    return null;
  }
  const preferredId = targetProjectId
    ? String(state.focusFallbackSessionIdByProject[targetProjectId] || '').trim()
    : String(state.focusFallbackSessionId || '').trim();
  const existing = sessions.find((session) => session.id === preferredId);
  if (existing) {
    state.focusFallbackSessionId = existing.id;
    if (targetProjectId) {
      state.focusFallbackSessionIdByProject[targetProjectId] = existing.id;
    }
    return existing;
  }
  return pickRandomFocusSession(sessions, { projectId: targetProjectId });
}

function focusSelection(projectId = '', options = {}) {
  const { respectPinned = true } = options || {};
  const targetProjectId = String(projectId || '').trim();
  const sessions = focusSessions(targetProjectId);
  const items = focusNotifications(targetProjectId);
  let selection = null;
  if (!items.length) {
    selection = {
      items,
      index: 0,
      alert: null,
      session: focusFallbackSession(sessions, targetProjectId),
      hasNotificationMatch: true,
      source: 'random'
    };
  } else {
    const total = items.length;
    const start = focusQueueIndex(total);
    for (let offset = 0; offset < total; offset += 1) {
      const index = (start + offset) % total;
      const alert = items[index];
      const match = sessionMatchForNotification(alert, sessions);
      if (match) {
        state.focusQueueIndex = index;
        selection = {
          items,
          index,
          alert,
          session: match,
          hasNotificationMatch: true,
          source: 'notification'
        };
        break;
      }
    }
    if (!selection) {
      selection = {
        items,
        index: start,
        alert: items[start] || null,
        session: focusFallbackSession(sessions, targetProjectId),
        hasNotificationMatch: false,
        source: 'random'
      };
    }
  }

  if (targetProjectId && respectPinned) {
    const pinnedId = String(state.focusPinnedSessionIdByProject[targetProjectId] || '').trim();
    if (pinnedId) {
      const pinned = sessions.find((session) => session.id === pinnedId);
      if (pinned) {
        selection = { ...selection, session: pinned };
      }
    }
  }

  if (targetProjectId) {
    state.focusPinnedSessionIdByProject[targetProjectId] = selection?.session?.id || '';
  }
  return selection;
}

function advanceFocusModeSelection() {
  const targetProjectId = String(state.activeProjectId || '').trim();
  const sessions = focusSessions(targetProjectId);
  const items = focusNotifications(targetProjectId);
  if (items.length > 0) {
    const current = focusQueueIndex(items.length);
    state.focusQueueIndex = (current + 1) % items.length;
    const hasMappedSession = items.some((alert) => Boolean(sessionMatchForNotification(alert, sessions)));
    if (!hasMappedSession) {
      pickRandomFocusSession(sessions, {
        avoidSessionId: state.focusFallbackSessionIdByProject[targetProjectId] || state.focusFallbackSessionId,
        projectId: targetProjectId
      });
    }
  } else {
    pickRandomFocusSession(sessions, {
      avoidSessionId: state.focusFallbackSessionIdByProject[targetProjectId] || state.focusFallbackSessionId,
      projectId: targetProjectId
    });
  }
  const next = focusSelection(targetProjectId, { respectPinned: false });
  state.focusPinnedSessionIdByProject[targetProjectId] = next?.session?.id || '';
}

function retreatFocusModeSelection() {
  const targetProjectId = String(state.activeProjectId || '').trim();
  const sessions = focusSessions(targetProjectId);
  const items = focusNotifications(targetProjectId);
  if (items.length > 0) {
    const current = focusQueueIndex(items.length);
    state.focusQueueIndex = (current - 1 + items.length) % items.length;
    const hasMappedSession = items.some((alert) => Boolean(sessionMatchForNotification(alert, sessions)));
    if (!hasMappedSession) {
      const currentFallbackId = state.focusFallbackSessionIdByProject[targetProjectId] || state.focusFallbackSessionId;
      const picked = pickRandomFocusSession(sessions, { avoidSessionId: currentFallbackId, projectId: targetProjectId });
      state.focusFallbackSessionId = picked?.id || currentFallbackId || '';
      if (targetProjectId) {
        state.focusFallbackSessionIdByProject[targetProjectId] = picked?.id || currentFallbackId || '';
      }
    }
  } else if (sessions.length > 0) {
    const currentFallbackId = state.focusFallbackSessionIdByProject[targetProjectId] || state.focusFallbackSessionId;
    const picked = pickRandomFocusSession(sessions, { avoidSessionId: currentFallbackId, projectId: targetProjectId });
    state.focusFallbackSessionId = picked?.id || currentFallbackId || '';
    if (targetProjectId) {
      state.focusFallbackSessionIdByProject[targetProjectId] = picked?.id || currentFallbackId || '';
    }
  }
  const next = focusSelection(targetProjectId, { respectPinned: false });
  state.focusPinnedSessionIdByProject[targetProjectId] = next?.session?.id || '';
}

function setRouletteModeEnabled(enabled) {
  state.rouletteModeEnabled = Boolean(enabled);
  saveRouletteModePreference();
  if (els.rouletteModeToggle) {
    els.rouletteModeToggle.checked = state.rouletteModeEnabled;
  }
  if (state.rouletteModeEnabled) {
    setProjectSwitcherOpen(false);
    if (els.projectSwitcherWrap) {
      els.projectSwitcherWrap.hidden = true;
    }
  }
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
    const lastInput = formatLastInputPreview(alert.payload?.lastInput);
    if (lastInput) {
      return `${kind} completed: ${lastInput}`;
    }
    return `${kind} completed and is waiting.`;
  }
  return JSON.stringify(alert.payload || {});
}

function formatLastInputPreview(value, maxLength = 72) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}...`;
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
  if (open && isMobileViewport()) {
    setMobileContextOpen(true);
  }
  state.notificationsOpen = Boolean(open);
  if (state.notificationsOpen) {
    markNotificationsRead();
  }
  els.notificationCenter.hidden = !state.notificationsOpen;
  els.notificationToggle.setAttribute('aria-expanded', state.notificationsOpen ? 'true' : 'false');
  renderNotifications();
}

function renderRouletteToggle() {
  if (!els.rouletteModeToggle) {
    return;
  }
  els.rouletteModeToggle.checked = Boolean(state.rouletteModeEnabled);
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
    if (els.mobileContextBadge) {
      els.mobileContextBadge.hidden = false;
      els.mobileContextBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    }
    els.mobileContextToggle?.classList.add('has-unread');
  } else {
    els.notificationBadge.hidden = true;
    els.notificationBadge.textContent = '0';
    els.notificationToggle.classList.remove('has-unread');
    if (els.mobileContextBadge) {
      els.mobileContextBadge.hidden = true;
      els.mobileContextBadge.textContent = '0';
    }
    els.mobileContextToggle?.classList.remove('has-unread');
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
      dismiss.setAttribute('aria-label', 'Dismiss');
      dismiss.dataset.dismissAlert = alert.id;
      dismiss.innerHTML = lucideIcon('x', 'notification-dismiss-icon');
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
      if (project.workspaceContext?.type === 'provider' && project.workspaceContext?.provider?.name) {
        node.querySelector('.git-badge').textContent = `remote ${project.workspaceContext.provider.name}`;
      } else {
        node.querySelector('.git-badge').textContent = project.isGit ? 'remote git' : 'remote non-git';
      }
    } else {
      if (project.workspaceContext?.type === 'provider' && project.workspaceContext?.provider?.name) {
        node.querySelector('.git-badge').textContent = project.workspaceContext.provider.name;
      } else {
        node.querySelector('.git-badge').textContent = project.isGit ? 'git' : 'non-git';
      }
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
  if (typeof item.wheelCleanup === 'function') {
    item.wheelCleanup();
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

function refreshSessionTerminalConnection(sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) {
    return false;
  }
  const session = sessionById(id);
  if (!session) {
    return false;
  }
  const mount = document.querySelector(`[data-terminal-mount="${id}"]`);
  if (!mount) {
    return false;
  }
  teardownTerminal(id);
  openLiveTerminal(session, mount);
  return true;
}

function sanitizeTerminalStream(data) {
  const text = String(data || '');
  if (!text) {
    return '';
  }
  // Prevent terminal control sequences from wiping local scrollback/history.
  return text
    .replace(/\x1b\[\?1049[hl]/g, '')
    .replace(/\x1b\[\?1047[hl]/g, '')
    .replace(/\x1b\[\?47[hl]/g, '')
    .replace(/\x1b\[3J/g, '');
}

function terminalThemeFor(theme) {
  return theme === 'light' ? TERMINAL_THEME_LIGHT : TERMINAL_THEME_DARK;
}

function updateLiveTerminalThemes(theme) {
  const nextTheme = terminalThemeFor(theme);
  for (const item of state.terminals.values()) {
    if (!item?.term) {
      continue;
    }
    item.term.options.theme = nextTheme;
  }
}

function openLiveTerminal(session, mount) {
  teardownTerminal(session.id);

  const fitAddon = new FitAddon.FitAddon();
  const term = new Terminal({
    cols: WORKSPACE_TERM_COLS,
    rows: WORKSPACE_TERM_ROWS,
    scrollback: 50000,
    fontSize: 13,
    fontFamily: 'IBM Plex Mono, Menlo, monospace',
    cursorBlink: true,
    convertEol: true,
    minimumContrastRatio: 4.5,
    theme: terminalThemeFor(state.theme)
  });
  term.loadAddon(fitAddon);
  if (WebLinksAddon?.WebLinksAddon) {
    const webLinksAddon = new WebLinksAddon.WebLinksAddon((event, uri) => {
      event?.preventDefault?.();
      if (!uri) {
        return;
      }
      window.open(uri, '_blank', 'noopener,noreferrer');
    });
    term.loadAddon(webLinksAddon);
  }
  registerTerminalInternalMarkdownLinks(term, session);
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
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      if (pastedText) {
        term.paste(pastedText);
      }
    }, { capture: true });
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

  // Force wheel to local xterm scrollback so shell/tmux never interprets it as input.
  let wheelListener = null;
  if (mount && typeof mount.addEventListener === 'function') {
    wheelListener = (event) => {
      const deltaY = Number(event.deltaY || 0);
      if (!deltaY) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      const lines = Math.max(1, Math.round(Math.abs(deltaY) / 32));
      const signedLines = deltaY > 0 ? lines : -lines;
      term.scrollLines(signedLines);
    };
    mount.addEventListener('wheel', wheelListener, { passive: false, capture: true });
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
      const sanitized = sanitizeTerminalStream(payload.data);
      if (hasActiveSelection) {
        queueTerminalFrame({ type: 'output', data: sanitized });
        return;
      }
      term.write(sanitized);
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
    if (payload.type === 'history') {
      // Append captured tmux history directly so it becomes browser scrollback.
      // Avoid screen save/restore here; that can drop effective scrollback in
      // some terminal/PTY combinations.
      const historyText = String(payload.data || '');
      if (historyText) {
        term.write(`${historyText}\r\n`);
        term.scrollToBottom();
      }
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

  state.terminals.set(session.id, {
    term,
    ws,
    resizeObserver,
    fitAddon,
    wheelCleanup: wheelListener
      ? () => mount.removeEventListener('wheel', wheelListener)
      : null
  });
}

function refitLiveTerminals() {
  for (const item of state.terminals.values()) {
    if (!item || !item.fitAddon || !item.term || !item.ws) {
      continue;
    }
    try {
      item.fitAddon.fit();
    } catch {
      continue;
    }
    if (item.ws.readyState === WebSocket.OPEN) {
      item.ws.send(JSON.stringify({ type: 'resize', cols: item.term.cols, rows: item.term.rows }));
    }
  }
}

function refreshWorkspaceLayout() {
  renderWorkspace();
  requestAnimationFrame(() => {
    refitLiveTerminals();
  });
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
  if (hiddenGridRoot && hiddenGridRoot !== gridRoot) {
    for (const tile of hiddenGridRoot.querySelectorAll('[data-session-id]')) {
      gridRoot.appendChild(tile);
    }
  }

  const focusMode = state.rouletteModeEnabled;
  gridRoot.classList.toggle('focus-grid', focusMode);
  if (focusMode) {
    gridRoot.style.setProperty('--focus-grid-cols', String(maxTileCols()));
  } else {
    gridRoot.style.removeProperty('--focus-grid-cols');
  }
  const projectSessions = sessionsForActiveProject();
  const rouletteSelection = focusMode
    ? focusSelection(project.id)
    : rouletteSelectionForProject(project.id, projectSessions);
  const selectedSession = rouletteSelection.session;
  const visibleSessions = focusMode
    ? (selectedSession ? [selectedSession] : [])
    : projectSessions;
  const activeSessionIds = new Set(visibleSessions.map((session) => session.id));
  els.workspaceTitle.textContent = focusMode ? `${project.name} focus mode` : `${project.name} workspace`;
  renderMcpDropdownMenu();
  renderProjectSwitcher();

  if (!focusMode) {
    cleanupSessionTileSizes(project.id, visibleSessions);
  }
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

  if (!visibleSessions.length) {
    els.terminalGridEmpty.hidden = false;
    return;
  }

  els.terminalGridEmpty.hidden = true;
  for (const session of visibleSessions) {
    const lastInputPreview = formatLastInputPreview(session.lastInput);
    const lastInputText = lastInputPreview || '(no input yet)';
    const kindClass = `terminal-kind-${session.kind}`;
    let tile = gridRoot.querySelector(`[data-session-id=\"${session.id}\"]`);
    if (!tile) {
      tile = document.createElement('article');
      tile.className = `terminal-tile ${kindClass}`;
      tile.classList.add('has-tile-actions');
      tile.dataset.sessionId = session.id;
      tile.dataset.sessionKind = session.kind;
      tile.draggable = !focusMode;
      const sizeControls = `
            <button class="small alt tile-size-btn" type="button" data-resize-session="${session.id}" data-axis="x" data-delta="1" title="Add width span" data-tooltip="Add width" aria-label="Add width span">
              ${lucideIcon('moveHorizontalPlus', 'tile-icon')}
            </button>
            <button class="small alt tile-size-btn" type="button" data-resize-session="${session.id}" data-axis="x" data-delta="-1" title="Remove width span" data-tooltip="Remove width" aria-label="Remove width span">
              ${lucideIcon('moveHorizontalMinus', 'tile-icon')}
            </button>
            <button class="small alt tile-size-btn" type="button" data-resize-session="${session.id}" data-axis="y" data-delta="1" title="Add height span" data-tooltip="Add height" aria-label="Add height span">
              ${lucideIcon('moveVerticalPlus', 'tile-icon')}
            </button>
            <button class="small alt tile-size-btn" type="button" data-resize-session="${session.id}" data-axis="y" data-delta="-1" title="Remove height span" data-tooltip="Remove height" aria-label="Remove height span">
              ${lucideIcon('moveVerticalMinus', 'tile-icon')}
            </button>
            ${session.sshHost && session.kind === 'tmux'
    ? `<button class="small alt tile-size-btn tile-refresh-btn" type="button" data-refresh-session="${session.id}" title="Refresh terminal connection" data-tooltip="Refresh terminal" aria-label="Refresh terminal connection">↻</button>`
    : ''}
          `;
      tile.innerHTML = `
        <div class="tile-size-controls" data-size-controls>
          ${sizeControls}
          <button
            class="small alt tile-size-btn tile-close-btn"
            type="button"
            data-stop-session="${session.id}"
            title="Close session"
            data-tooltip="Close session"
            aria-label="Close session"
          >
            ${lucideIcon('x', 'tile-icon')}
          </button>
        </div>
        <div><b>${session.kind}</b></div>
        <div class="mono">${session.sshHost ? `host: ${session.sshHost}` : 'host: local'}</div>
        <div class="mono">tmux: ${session.tmuxName}</div>
        <div class="mono" data-workspace-info>workspace: ${session.workspaceName || 'main'}</div>
        <div class="mono" data-last-input>last: ${lastInputText}</div>
        <div class="terminal-instance" data-terminal-mount="${session.id}"></div>
        <div class="roulette-footer" data-roulette-footer hidden>
          <div class="mono roulette-message" data-roulette-message></div>
          <div class="roulette-controls" data-roulette-controls hidden>
            <button class="small alt" type="button" data-roulette-nav="prev">PREV</button>
            <button class="small alt" type="button" data-roulette-nav="next">NEXT</button>
          </div>
        </div>
      `;
      gridRoot.appendChild(tile);
    }
    tile.classList.remove('terminal-kind-tmux', 'terminal-kind-codex', 'terminal-kind-claude', 'terminal-kind-cursor', 'terminal-kind-opencode');
    tile.classList.add(kindClass);
    tile.dataset.sessionKind = session.kind;
    tile.draggable = !focusMode;
    const tileProjectId = session.projectId || project.id;
    const tileSize = getSessionTileSize(tileProjectId, session.id);
    tile.style.gridColumn = `span ${tileSize.width}`;
    tile.style.gridRow = `span ${tileSize.height}`;
    tile.style.setProperty('--tile-height-multiplier', String(tileSize.height));
    const label = tile.querySelector('[data-last-input]');
    if (label) {
      label.textContent = `last: ${lastInputText}`;
    }
    const workspaceInfo = tile.querySelector('[data-workspace-info]');
    if (workspaceInfo) {
      workspaceInfo.textContent = `workspace: ${session.workspaceName || 'main'}`;
    }
    const rouletteFooter = tile.querySelector('[data-roulette-footer]');
    const rouletteMessage = tile.querySelector('[data-roulette-message]');
    const rouletteControls = tile.querySelector('[data-roulette-controls]');
    if (rouletteFooter && rouletteMessage) {
      const enableRouletteFooter = focusMode;
      rouletteFooter.hidden = !enableRouletteFooter;
      if (rouletteControls) {
        rouletteControls.hidden = !enableRouletteFooter;
      }
      if (enableRouletteFooter) {
        if (!rouletteSelection.items.length) {
          rouletteMessage.textContent = 'Focus mode: no notifications yet for this project.';
        } else if (!rouletteSelection.hasNotificationMatch) {
          rouletteMessage.textContent = 'Focus mode: notification session for this project is no longer running.';
        } else {
          const labelPrefix = `${rouletteSelection.index + 1}/${rouletteSelection.items.length}`;
          const alert = rouletteSelection.alert;
          rouletteMessage.textContent = `${labelPrefix} ${new Date(alert.createdAt || Date.now()).toLocaleTimeString()} ${notificationMessage(alert)}`;
        }
      }
    }
    const mount = tile.querySelector('[data-terminal-mount]');
    if (!state.terminals.has(session.id)) {
      openLiveTerminal(session, mount);
    }
  }
  applySessionHighlight();
}

function setProjectSwitcherOpen(open) {
  if (open && isMobileViewport()) {
    setMobileContextOpen(true);
  }
  state.projectSwitcherOpen = Boolean(open);
  if (els.projectSwitcherMenu) {
    els.projectSwitcherMenu.hidden = !state.projectSwitcherOpen;
  }
  if (els.projectSwitcherTrigger) {
    els.projectSwitcherTrigger.setAttribute('aria-expanded', state.projectSwitcherOpen ? 'true' : 'false');
  }
}

function projectNotificationCountMap() {
  const map = new Map();
  for (const alert of notificationAlerts()) {
    const projectId = alert.payload?.projectId;
    if (!projectId) {
      continue;
    }
    map.set(projectId, (map.get(projectId) || 0) + 1);
  }
  return map;
}

function renderProjectSwitcher() {
  if (!els.projectSwitcherWrap || !els.projectSwitcherTrigger || !els.projectSwitcherMenu) {
    return;
  }

  const counts = projectNotificationCountMap();
  const projects = (state.dashboard?.projects || []).slice().sort((a, b) => {
    const aCount = counts.get(a.id) || 0;
    const bCount = counts.get(b.id) || 0;
    if (bCount !== aCount) {
      return bCount - aCount;
    }
    return a.name.localeCompare(b.name);
  });
  const enabled = Boolean(state.activeProjectId)
    && projects.length > 1
    && document.body.classList.contains('workspace-open')
    && !state.rouletteModeEnabled;
  els.projectSwitcherWrap.hidden = !enabled;
  if (!enabled) {
    setProjectSwitcherOpen(false);
    return;
  }

  const activeProject = projects.find((project) => project.id === state.activeProjectId) || projects[0];
  const activeCount = counts.get(activeProject.id) || 0;
  const triggerLabel = document.createElement('span');
  triggerLabel.className = 'project-switcher-trigger-label';
  triggerLabel.textContent = `${activeProject.name} (${activeCount})`;
  els.projectSwitcherTrigger.replaceChildren(triggerLabel);
  const triggerIconWrap = document.createElement('span');
  triggerIconWrap.innerHTML = lucideIcon('chevronDown', 'project-switcher-chevron');
  const triggerIcon = triggerIconWrap.firstElementChild;
  if (triggerIcon) {
    els.projectSwitcherTrigger.appendChild(triggerIcon);
  }

  els.projectSwitcherMenu.innerHTML = '';
  for (const project of projects) {
    const count = counts.get(project.id) || 0;
    const option = document.createElement('button');
    option.type = 'button';
    option.className = `project-switcher-option${project.id === activeProject.id ? ' active' : ''}`;
    option.dataset.projectSwitcherOption = project.id;
    const name = document.createElement('span');
    name.className = 'project-switcher-name';
    name.textContent = project.name;
    const badge = document.createElement('span');
    badge.className = `project-switcher-count${count > 0 ? ' has-items' : ''}`;
    badge.textContent = String(count);
    option.append(name, badge);
    els.projectSwitcherMenu.appendChild(option);
  }
}

function hideEditorMetaFields() {
  if (els.workspaceEditorMeta?.hidden) {
    return;
  }
  els.workspaceEditorSkillSelectWrap.hidden = true;
  els.workspaceEditorSkillActions.hidden = true;
  els.workspaceEditorDocsFileWrap.hidden = true;
  if (els.workspaceEditorAgentsSystem) {
    els.workspaceEditorAgentsSystem.hidden = true;
  }
}

function formatMcpLogEvent(event) {
  const ts = new Date(event.createdAt || Date.now()).toLocaleTimeString();
  const eventType = String(event?.type || '');
  const payload = event.payload || {};
  if (eventType.startsWith('memory.')) {
    const memoryId = payload.memoryId || '-';
    const type = payload.type || 'memory';
    const source = payload.source || 'unknown';
    const agent = payload.agentKind || 'unknown';
    return `[${ts}] ${eventType} type=${type} source=${source} agent=${agent} id=${memoryId}`;
  }
  const target = payload.targetName || payload.target || 'unknown';
  const method = payload.method || 'method?';
  const status = payload.status || 'error';
  const duration = payload.durationMs != null ? `${payload.durationMs}ms` : '-';
  const reqId = payload.requestId || event.id || '';
  return `[${ts}] ${target} ${method} status=${status} duration=${duration} id=${reqId}`;
}

function normalizeLogsView(value) {
  return String(value || '').trim().toLowerCase() === 'diff' ? 'diff' : 'mcp';
}

function normalizeMcpLogsFilter(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['codex', 'claude', 'memory', 'errors'].includes(normalized)) {
    return normalized;
  }
  return 'all';
}

function mcpLogsFilterLabel(filter) {
  const normalized = normalizeMcpLogsFilter(filter);
  if (normalized === 'codex') {
    return 'codex';
  }
  if (normalized === 'claude') {
    return 'claude';
  }
  if (normalized === 'errors') {
    return 'errors';
  }
  if (normalized === 'memory') {
    return 'memory';
  }
  return 'all';
}

function cycleMcpLogsFilter() {
  const order = ['all', 'codex', 'claude', 'memory', 'errors'];
  const current = normalizeMcpLogsFilter(state.logsFilter);
  const nextIndex = (order.indexOf(current) + 1) % order.length;
  state.logsFilter = order[nextIndex];
}

function mcpLogMatchesFilter(event) {
  const filter = normalizeMcpLogsFilter(state.logsFilter);
  if (filter === 'all') {
    return true;
  }

  const payload = event?.payload || {};
  const eventType = String(event?.type || '').trim().toLowerCase();
  const target = String(payload.targetName || payload.target || '').trim().toLowerCase();
  if (filter === 'codex' || filter === 'claude') {
    return target === filter;
  }
  if (filter === 'memory') {
    return eventType.startsWith('memory.');
  }
  if (filter === 'errors') {
    const status = Number(payload.status);
    return Number.isFinite(status) && status >= 400;
  }
  return true;
}

function formatMcpLogLines() {
  const events = Array.isArray(state.mcpLogEvents) ? state.mcpLogEvents : [];
  const filtered = events.filter((event) => mcpLogMatchesFilter(event));
  if (!events.length) {
    return ['Streaming MCP proxy interactions...'];
  }
  if (!filtered.length) {
    return [`No MCP events for filter "${mcpLogsFilterLabel(state.logsFilter)}".`];
  }
  return filtered.map((event) => formatMcpLogEvent(event));
}

function formatDiffLogs() {
  if (state.diffLogLoading && !state.diffLogEntries.length) {
    return ['Loading diff logs...'];
  }
  if (state.diffLogError) {
    return [`[error] ${state.diffLogError}`];
  }
  if (!state.diffLogEntries.length) {
    return ['No file changes detected.'];
  }
  const generatedAt = state.diffLogGeneratedAt
    ? ` (updated ${new Date(state.diffLogGeneratedAt).toLocaleTimeString()})`
    : '';
  const lines = [`Changed files: ${state.diffLogEntries.length}${generatedAt}`, ''];
  for (const entry of state.diffLogEntries) {
    const index = String(entry.order || 0).padStart(3, '0');
    const code = String(entry.code || '').padEnd(2, ' ');
    const filePath = String(entry.path || '');
    const previous = entry.previousPath ? ` (from ${entry.previousPath})` : '';
    lines.push(`${index}. [${code}] ${filePath}${previous}`);
  }
  return lines;
}

function renderLogsViewActions() {
  const isDiffView = state.logsView === 'diff';
  for (const button of document.querySelectorAll('button[data-logs-clear]')) {
    button.hidden = isDiffView;
  }
  for (const button of document.querySelectorAll('button[data-logs-refresh]')) {
    button.hidden = !isDiffView;
  }
  for (const button of document.querySelectorAll('button[data-logs-view]')) {
    const view = normalizeLogsView(button.dataset.logsView);
    button.setAttribute('aria-pressed', view === state.logsView ? 'true' : 'false');
  }
  for (const button of document.querySelectorAll('button[data-logs-filter]')) {
    button.hidden = isDiffView;
    button.textContent = `Filter: ${mcpLogsFilterLabel(state.logsFilter)}`;
  }
  for (const heading of document.querySelectorAll('#workspaceLogs .workspace-editor-head h3, #workspaceLogsPane .workspace-editor-head h3')) {
    heading.textContent = state.logsView === 'diff' ? 'Diff Logs' : 'Activity Logs';
  }
}

function renderWorkspaceLogsOutput() {
  const lines = state.logsView === 'diff' ? formatDiffLogs() : formatMcpLogLines();
  const output = lines.join('\n');
  els.workspaceLogsOutput.textContent = output;
  els.workspaceLogsOutput.scrollTop = els.workspaceLogsOutput.scrollHeight;
  if (els.workspaceLogsOutputPane) {
    els.workspaceLogsOutputPane.textContent = output;
    els.workspaceLogsOutputPane.scrollTop = els.workspaceLogsOutputPane.scrollHeight;
  }
  renderLogsViewActions();
}

function renderMcpLogs() {
  if (state.logsView === 'mcp') {
    renderWorkspaceLogsOutput();
  }
}

function appendMcpLogEvent(event) {
  if (!event || typeof event !== 'object') {
    return;
  }
  state.mcpLogEvents.push(event);
  if (state.mcpLogEvents.length > 500) {
    state.mcpLogEvents = state.mcpLogEvents.slice(-500);
  }
  if (state.logsView === 'mcp') {
    renderWorkspaceLogsOutput();
  }
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
      const events = Array.isArray(parsed.events) ? parsed.events : [];
      state.mcpLogEvents = events.slice(-500);
      if (state.logsView === 'mcp') {
        renderWorkspaceLogsOutput();
      }
      return;
    }
    if (parsed.type === 'mcp-log' && parsed.event) {
      appendMcpLogEvent(parsed.event);
    }
  });
  socket.addEventListener('close', () => {
    if (state.mcpLogsSocket === socket) {
      state.mcpLogsSocket = null;
    }
  });
  state.mcpLogsSocket = socket;
}

async function loadDiffLogs({ silent = false } = {}) {
  if (!state.activeProjectId) {
    return;
  }
  state.diffLogLoading = true;
  if (!silent) {
    state.diffLogError = '';
    renderWorkspaceLogsOutput();
  }
  try {
    const payload = await api(`/api/projects/${state.activeProjectId}/diff-logs`);
    state.diffLogEntries = Array.isArray(payload.entries) ? payload.entries : [];
    state.diffLogGeneratedAt = payload.generatedAt || new Date().toISOString();
    state.diffLogError = '';
  } catch (error) {
    state.diffLogError = error.message || 'Failed to load diff logs';
  } finally {
    state.diffLogLoading = false;
    if (state.logsView === 'diff') {
      renderWorkspaceLogsOutput();
    }
  }
}

function setLogsView(view) {
  const nextView = normalizeLogsView(view);
  if (state.logsView === nextView) {
    if (nextView === 'diff') {
      loadDiffLogs();
    }
    renderLogsViewActions();
    return;
  }
  state.logsView = nextView;
  if (nextView === 'diff') {
    disconnectMcpLogs();
    loadDiffLogs();
  } else {
    connectMcpLogs();
  }
  renderWorkspaceLogsOutput();
}

function closeWorkspaceLogs(options = {}) {
  const { refresh = true } = options;
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
  if (refresh) {
    refreshWorkspaceLayout();
  }
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

  if (state.logsView === 'diff') {
    loadDiffLogs({ silent: true });
  } else {
    connectMcpLogs();
  }
  renderWorkspaceLogsOutput();
  refreshWorkspaceLayout();
}

function sortedSkills(project) {
  return (Array.isArray(project?.skills) ? project.skills : [])
    .slice()
    .sort((a, b) => String(a.name || a.id || '').localeCompare(String(b.name || b.id || '')));
}

function normalizeSkillTarget(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['codex', 'claude', 'cursor'].includes(normalized) ? normalized : 'codex';
}

function skillLabel(skill) {
  const name = String(skill?.name || skill?.id || '').trim() || 'skill';
  const target = normalizeSkillTarget(skill?.target);
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

function moveEditorToLine(lineNumber) {
  if (!els.workspaceEditorInput) {
    return;
  }
  const raw = Number(lineNumber);
  if (!Number.isFinite(raw) || raw < 1) {
    return;
  }
  const content = String(els.workspaceEditorInput.value || '');
  if (!content) {
    els.workspaceEditorInput.focus();
    return;
  }
  const targetLine = Math.max(1, Math.trunc(raw));
  let currentLine = 1;
  let startIndex = 0;
  while (currentLine < targetLine) {
    const nextNewline = content.indexOf('\n', startIndex);
    if (nextNewline === -1) {
      break;
    }
    startIndex = nextNewline + 1;
    currentLine += 1;
  }
  let endIndex = content.indexOf('\n', startIndex);
  if (endIndex === -1) {
    endIndex = content.length;
  }
  els.workspaceEditorInput.focus();
  els.workspaceEditorInput.setSelectionRange(startIndex, endIndex);
  const lineHeight = Number.parseFloat(getComputedStyle(els.workspaceEditorInput).lineHeight) || 20;
  const top = Math.max(0, (currentLine - 2) * lineHeight);
  els.workspaceEditorInput.scrollTop = top;
}

async function openWorkspaceEditor(kind, options = {}) {
  const project = projectById(state.activeProjectId);
  if (!project) {
    return;
  }

  closeWorkspaceLogs();
  state.workspaceEditorKind = kind;
  els.workspaceEditor.hidden = false;
  setWorkspaceEditorPlainMode(kind === 'agents');
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
    if (els.workspaceEditorAgentsSystem) {
      els.workspaceEditorAgentsSystem.hidden = false;
    }
    const agentId = els.workspaceEditorAgentsSystemSelect?.value || 'claude';
    const editorKind = agentId === 'cursor' ? 'cursor' : 'agents';
    const payload = await api(`/api/projects/${project.id}/editor?kind=${editorKind}`);
    els.workspaceEditorInput.value = payload.content || (agentId === 'cursor' ? '# Cursor Project Context\n\n- Add project-specific notes here.\n' : '# Claude Project Context\n\n- Add project-specific notes here.\n');
    moveEditorToLine(options.line);
  } else if (kind === 'docs') {
    els.workspaceEditorTitle.textContent = 'DOCS';
    els.workspaceEditorDocsFileWrap.hidden = false;
    const preferredDocsFile = String(options.docsFile || '').trim();
    const current = preferredDocsFile || String(els.workspaceEditorDocsFile.value || '').trim();
    const filesPayload = await api(`/api/projects/${project.id}/editor?kind=docs-files`);
    setDocsFileOptions(filesPayload.files || [], current || 'README.md');
    const relativePath = els.workspaceEditorDocsFile.value;
    await loadDocsEditorFile(project.id, relativePath);
    moveEditorToLine(options.line);
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

function parseDocsPathWithLine(value) {
  const text = String(value || '').trim();
  if (!text) {
    return { relativePath: '', line: null };
  }
  let next = text;
  let line = null;
  const hashLineMatch = next.match(/#L(\d+)$/i);
  if (hashLineMatch) {
    line = Number(hashLineMatch[1]);
    next = next.slice(0, -hashLineMatch[0].length);
  }
  const colonLineMatch = next.match(/:(\d+)$/);
  if (colonLineMatch) {
    line = Number(colonLineMatch[1]);
    next = next.slice(0, -colonLineMatch[0].length);
  }
  return {
    relativePath: normalizeDocsRelativePath(next),
    line: Number.isFinite(line) && line > 0 ? Math.trunc(line) : null
  };
}

function stripTerminalLinkPunctuation(value) {
  return String(value || '')
    .trim()
    .replace(/^[<([{"']+/, '')
    .replace(/[>.,;:!?)\]}"]+$/, '');
}

function parseInternalMarkdownLinkTarget(rawLink, projectId) {
  const project = projectById(projectId);
  if (!project) {
    return null;
  }

  let cleaned = stripTerminalLinkPunctuation(rawLink);
  if (!cleaned || /^https?:\/\//i.test(cleaned)) {
    return null;
  }

  let line = null;
  const hashLineMatch = cleaned.match(/#L(\d+)$/i);
  if (hashLineMatch) {
    line = Number(hashLineMatch[1]);
    cleaned = cleaned.slice(0, -hashLineMatch[0].length);
  }
  const colonLineMatch = cleaned.match(/:(\d+)$/);
  if (colonLineMatch) {
    line = Number(colonLineMatch[1]);
    cleaned = cleaned.slice(0, -colonLineMatch[0].length);
  }

  const normalized = cleaned.replace(/\\/g, '/').replace(/\/+$/, '');
  const projectPath = String(project.path || '').replace(/\\/g, '/').replace(/\/+$/, '');
  let relative = normalized.replace(/^\.\/+/, '');
  if (projectPath && relative.startsWith(`${projectPath}/`)) {
    relative = relative.slice(projectPath.length + 1);
  }

  if (relative === 'AGENTS.md' || relative === 'CLAUDE.md') {
    return { kind: 'agents', line };
  }
  if (relative.startsWith('docs/') && relative.toLowerCase().endsWith('.md')) {
    return {
      kind: 'docs',
      relativePath: normalizeDocsRelativePath(relative.slice('docs/'.length)),
      line
    };
  }

  return null;
}

async function openTerminalInternalMarkdownLink(rawLink, session) {
  const target = parseInternalMarkdownLinkTarget(rawLink, session?.projectId || state.activeProjectId);
  if (!target) {
    return false;
  }
  if (target.kind === 'agents') {
    await openWorkspaceEditor('agents', { line: target.line });
    return true;
  }
  if (!target.relativePath) {
    return false;
  }
  await openWorkspaceEditor('docs', { docsFile: target.relativePath, line: target.line });
  if (Number.isFinite(target.line) && target.line > 0) {
    showToast(`Opened ${target.relativePath} at line ${target.line}`);
  }
  return true;
}

function registerTerminalInternalMarkdownLinks(term, session) {
  return term.registerLinkProvider({
    provideLinks(y, callback) {
      const line = term.buffer.active.getLine(y - 1);
      if (!line) {
        callback([]);
        return;
      }
      const text = line.translateToString(true);
      INTERNAL_MARKDOWN_LINK_RE.lastIndex = 0;
      const links = [];
      let match;
      while ((match = INTERNAL_MARKDOWN_LINK_RE.exec(text))) {
        const raw = String(match[0] || '');
        if (!parseInternalMarkdownLinkTarget(raw, session?.projectId || state.activeProjectId)) {
          continue;
        }
        const startX = match.index + 1;
        const endX = startX + raw.length - 1;
        links.push({
          range: {
            start: { x: startX, y },
            end: { x: endX, y }
          },
          text: raw,
          activate: (event, textFromLink) => {
            event?.preventDefault?.();
            void openTerminalInternalMarkdownLink(textFromLink || raw, session)
              .catch(() => showToast('Unable to open markdown link'));
          }
        });
      }
      callback(links);
    }
  });
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

  const parsed = parseDocsPathWithLine(relativePath);
  relativePath = parsed.relativePath;
  if (!relativePath) {
    await modalMessage('docs file path is required.', { title: 'Missing file path' });
    return;
  }

  await openWorkspaceEditor('docs', { docsFile: relativePath, line: parsed.line });
}

function closeWorkspaceEditor() {
  state.workspaceEditorKind = null;
  setWorkspaceEditorPlainMode(false);
  els.workspaceEditor.hidden = true;
  els.workspaceEditorInput.hidden = false;
  if (els.workspaceEditorAgentsSystem) {
    els.workspaceEditorAgentsSystem.hidden = true;
  }
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
    const agentId = els.workspaceEditorAgentsSystemSelect?.value || 'claude';
    await api(`/api/projects/${projectId}/agents`, {
      method: 'POST',
      body: JSON.stringify({ content, agentId })
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
  const orchestrator = normalizeSkillTarget(selectedSkill.target);

  try {
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
  } catch (error) {
    if (error.code === 'MISSING_CLI') {
      const tool = orchestrator === 'codex' ? 'Codex' : 'Claude';
      await modalMessage(`${tool} is not installed. Install it and ensure it is on PATH, then retry.`, { title: `${tool} Missing` });
    } else {
      await modalMessage(error.message || 'Failed to launch skill session.', { title: 'Launch failed' });
    }
    return false;
  }
}

async function startNewSkillBuilderSession(projectId, orchestrator) {
  try {
    const launched = await api(`/api/projects/${projectId}/skills/authoring-session`, {
      method: 'POST',
      body: JSON.stringify({
        mode: 'add',
        orchestrator
      })
    });
    state.highlightedSessionId = launched.session?.id || null;
    await loadDashboard();
  } catch (error) {
    if (error.code === 'MISSING_CLI') {
      const tool = orchestrator === 'codex' ? 'Codex' : 'Claude';
      await modalMessage(`${tool} is not installed. Install it and ensure it is on PATH, then retry.`, { title: `${tool} Missing` });
    } else {
      await modalMessage(error.message || 'Failed to create skill session.', { title: 'Launch failed' });
    }
  }
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
      const createOption = document.createElement('option');
      createOption.value = '__new__';
      createOption.textContent = '+ Create new skill';
      skillSelect.appendChild(createOption);
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
  if (skillId === '__new__') {
    const targetResult = await openModalBase({
      title: 'New Skill Target',
      submitLabel: 'Create',
      cancelLabel: 'Cancel',
      bodyBuilder: (body) => {
        const label = document.createElement('label');
        label.textContent = 'Target';
        const select = document.createElement('select');
        const codexOpt = document.createElement('option');
        codexOpt.value = 'codex';
        codexOpt.textContent = 'Codex';
        select.appendChild(codexOpt);
        const claudeOpt = document.createElement('option');
        claudeOpt.value = 'claude';
        claudeOpt.textContent = 'Claude';
        select.appendChild(claudeOpt);
        label.appendChild(select);
        body.appendChild(label);
        controls._targetSelect = select;
      }
    });
    if (targetResult !== 'submit') return;
    await startNewSkillBuilderSession(projectId, controls._targetSelect.value);
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
  saveActiveProjectId(projectId);
  els.workspace.hidden = false;
  document.body.classList.add('workspace-open');
  document.body.style.overflow = 'hidden';
  if (pushHistory && window.location.pathname !== workspacePath(projectId)) {
    window.history.pushState({ projectId }, '', workspacePath(projectId));
  }
  try {
    await api('/api/alerts/ack-project', {
      method: 'POST',
      body: JSON.stringify({ projectId })
    });
  } catch {
    // Ignore ack failures and continue opening workspace.
  }
  await loadDashboard({ mode: 'switch' });
}

function closeWorkspace(options = {}) {
  const { pushHistory = true } = options;
  els.workspace.hidden = true;
  closeWorkspaceEditor();
  closeWorkspaceLogs({ refresh: false });
  document.body.classList.remove('workspace-open');
  document.body.style.overflow = '';
  state.activeProjectId = null;
  saveActiveProjectId(null);
  closeMcpDropdownMenu();
  teardownAllTerminals();
  els.terminalGrid.innerHTML = '';
  els.terminalGridEmpty.hidden = false;
  if (pushHistory && window.location.pathname.startsWith('/projects/')) {
    window.history.pushState({}, '', '/');
  }
}

async function loadDashboard(options = {}) {
  const mode = String(options?.mode || '').trim().toLowerCase();
  const query = mode === 'switch' ? '?mode=switch' : '';
  const data = await api(`/api/dashboard${query}`);
  state.dashboard = data;
  state.projectFolders = Array.isArray(data.projectFolders) ? data.projectFolders : [];
  state.projectFolderByProject = data.projectFolderByProject && typeof data.projectFolderByProject === 'object'
    ? data.projectFolderByProject
    : {};
  state.activeFolderId = data.activeFolderId || null;
  state.sessionSizeByProject = data.sessionTileSizesByProject && typeof data.sessionTileSizesByProject === 'object'
    ? data.sessionTileSizesByProject
    : state.sessionSizeByProject;
  reconcileFolderState(state.dashboard.projects || []);
  els.homePath.textContent = '';
  renderProjects();
  renderRouletteToggle();
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
  if (state.rouletteModeEnabled) {
    if (kind !== 'tmux') {
      showToast('Focus mode only allows tmux.');
      return;
    }
  }
  const project = projectById(projectId);
  if (!project) {
    return;
  }
  let workspace = { mode: 'main' };
  if (project.workspaceContext?.type === 'provider' && project.workspaceContext?.provider?.id) {
    try {
      const contextPayload = await api(`/api/projects/${projectId}/workspace-context`);
      const provider = contextPayload?.context?.provider || project.workspaceContext.provider;
      const providerName = provider?.name || provider?.id || 'custom workspace';
      const views = Array.isArray(contextPayload?.views) ? contextPayload.views : [];
      let selectedValue = 'main';
      let existingViewInput = null;
      let createViewInput = null;
      const result = await openModalBase({
        title: `Start ${kind}`,
        submitLabel: 'Start',
        cancelLabel: 'Cancel',
        bodyBuilder: (body) => {
          const desc = document.createElement('p');
          desc.textContent = `Choose launch location for ${providerName}.`;
          body.appendChild(desc);

          const picker = document.createElement('div');
          picker.className = 'workspace-picker';
          const pickerItems = [
            { value: 'main', name: 'Default path', detail: project.path, icon: 'home' },
            { value: 'provider-view', name: 'Use existing view', detail: views.length ? `${views.length} discovered` : 'Enter view name', icon: 'branch' },
            { value: 'provider-create', name: 'Create new view', detail: 'Create and use a new ADE view', icon: 'plus' }
          ];

          const wpIcons = {
            home: '<svg class="wp-icon" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
            branch: '<svg class="wp-icon" viewBox="0 0 24 24"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>',
            plus: '<svg class="wp-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>'
          };

          for (const pi of pickerItems) {
            const opt = document.createElement('div');
            opt.className = 'workspace-picker-option' + (pi.value === selectedValue ? ' selected' : '');
            opt.dataset.value = pi.value;
            opt.innerHTML = `
              ${wpIcons[pi.icon] || ''}
              <div class="wp-body">
                <div class="wp-name">${pi.name}</div>
                <div class="wp-detail">${pi.detail}</div>
              </div>
              <div class="wp-check"></div>
            `;
            opt.addEventListener('click', () => {
              selectedValue = pi.value;
              for (const el of picker.querySelectorAll('.workspace-picker-option')) {
                el.classList.toggle('selected', el.dataset.value === pi.value);
              }
              if (existingViewInput) {
                existingViewInput.parentElement.hidden = selectedValue !== 'provider-view';
              }
              if (createViewInput) {
                createViewInput.parentElement.hidden = selectedValue !== 'provider-create';
              }
            });
            picker.appendChild(opt);
          }
          body.appendChild(picker);

          const existingLabel = document.createElement('label');
          existingLabel.textContent = 'Existing view name';
          existingViewInput = document.createElement('input');
          existingViewInput.type = 'text';
          existingViewInput.placeholder = 'joshuabr_main';
          if (views.length) {
            const list = document.createElement('datalist');
            list.id = 'workspace-provider-views-list';
            for (const view of views) {
              const option = document.createElement('option');
              option.value = String(view);
              list.appendChild(option);
            }
            body.appendChild(list);
            existingViewInput.setAttribute('list', 'workspace-provider-views-list');
            existingViewInput.value = String(views[0] || '');
          }
          existingLabel.hidden = true;
          existingLabel.appendChild(existingViewInput);
          body.appendChild(existingLabel);

          const createLabel = document.createElement('label');
          createLabel.textContent = 'New view name';
          createViewInput = document.createElement('input');
          createViewInput.type = 'text';
          createViewInput.placeholder = 'my_new_view';
          createLabel.hidden = true;
          createLabel.appendChild(createViewInput);
          body.appendChild(createLabel);
        }
      });
      if (result !== 'submit') {
        return;
      }
      if (selectedValue === 'provider-view') {
        const name = String(existingViewInput?.value || '').trim();
        if (!name) {
          await modalMessage('View name is required.', { title: 'Missing field' });
          return;
        }
        workspace = { mode: 'provider-view', name };
      } else if (selectedValue === 'provider-create') {
        const name = String(createViewInput?.value || '').trim();
        if (!name) {
          await modalMessage('New view name is required.', { title: 'Missing field' });
          return;
        }
        workspace = { mode: 'provider-create', name };
      }
    } catch (error) {
      await modalMessage(error.message, { title: 'Workspace options unavailable' });
      return;
    }
  } else if (project.isGit) {
    try {
      const payload = await api(`/api/projects/${projectId}/worktrees`);
      const worktrees = Array.isArray(payload?.worktrees) ? payload.worktrees : [];
      let refs = ['HEAD', 'main', 'master', 'develop'];
      try {
        const refsPayload = await api(`/api/projects/${projectId}/git-refs`);
        if (Array.isArray(refsPayload?.refs)) {
          refs = refs.concat(refsPayload.refs);
        }
      } catch {
        // Keep launch flow available even when refs autocomplete is unavailable.
      }
      for (const item of worktrees) {
        const branch = String(item?.branch || '').trim();
        if (branch) {
          refs.push(branch);
        }
      }
      refs = [...new Set(refs.map((ref) => String(ref || '').trim()).filter(Boolean))];
      const pickerItems = [{ value: 'main', name: 'Main workspace', detail: 'Project root', icon: 'home' }];
      for (const item of worktrees) {
        if (!item || item.id === 'main') {
          continue;
        }
        const branch = String(item.branch || '').trim();
        pickerItems.push({ value: item.name, name: item.name, detail: branch || 'worktree', icon: 'branch' });
      }
      pickerItems.push({ value: '__create__', name: 'New worktree', detail: 'Create isolated branch workspace', icon: 'plus' });

      const wpIcons = {
        home: '<svg class="wp-icon" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
        branch: '<svg class="wp-icon" viewBox="0 0 24 24"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>',
        plus: '<svg class="wp-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>'
      };

      let selectedValue = 'main';
      let createFieldsContainer = null;
      let newWorktreeInput = null;
      let baseRefInput = null;

      const result = await openModalBase({
        title: `Start ${kind}`,
        submitLabel: 'Start',
        cancelLabel: 'Cancel',
        bodyBuilder: (body) => {
          const desc = document.createElement('p');
          desc.textContent = 'Choose launch location.';
          body.appendChild(desc);

          const picker = document.createElement('div');
          picker.className = 'workspace-picker';

          function selectOption(value) {
            selectedValue = value;
            for (const el of picker.querySelectorAll('.workspace-picker-option')) {
              el.classList.toggle('selected', el.dataset.value === value);
            }
            if (createFieldsContainer) {
              createFieldsContainer.hidden = value !== '__create__';
            }
          }

          for (const pi of pickerItems) {
            const opt = document.createElement('div');
            opt.className = 'workspace-picker-option' + (pi.value === selectedValue ? ' selected' : '');
            opt.dataset.value = pi.value;
            opt.innerHTML = `
              ${wpIcons[pi.icon] || ''}
              <div class="wp-body">
                <div class="wp-name">${pi.name}</div>
                <div class="wp-detail">${pi.detail}</div>
              </div>
              <div class="wp-check"></div>
            `;
            opt.addEventListener('click', () => selectOption(pi.value));
            picker.appendChild(opt);
          }
          body.appendChild(picker);

          createFieldsContainer = document.createElement('div');
          createFieldsContainer.className = 'workspace-create-fields';
          createFieldsContainer.hidden = true;

          const nameLabel = document.createElement('label');
          nameLabel.textContent = 'Worktree name';
          newWorktreeInput = document.createElement('input');
          newWorktreeInput.type = 'text';
          newWorktreeInput.placeholder = 'feature-branch-name';
          nameLabel.appendChild(newWorktreeInput);
          createFieldsContainer.appendChild(nameLabel);

          const refLabel = document.createElement('label');
          refLabel.textContent = 'Base ref (branch/tag)';
          baseRefInput = document.createElement('input');
          baseRefInput.type = 'text';
          baseRefInput.value = 'HEAD';
          baseRefInput.placeholder = 'HEAD';
          if (refs.length > 0) {
            const datalist = document.createElement('datalist');
            datalist.id = 'workspace-refs-list';
            for (const ref of refs) {
              const refOpt = document.createElement('option');
              refOpt.value = ref;
              datalist.appendChild(refOpt);
            }
            body.appendChild(datalist);
            baseRefInput.setAttribute('list', 'workspace-refs-list');
          }
          refLabel.appendChild(baseRefInput);
          createFieldsContainer.appendChild(refLabel);

          body.appendChild(createFieldsContainer);
        }
      });

      if (result !== 'submit') {
        return;
      }
      const selectedWorkspace = selectedValue;
      if (selectedWorkspace === '__create__') {
        const newWorktree = String(newWorktreeInput?.value || '').trim();
        if (!newWorktree) {
          await modalMessage('New worktree name is required when creating.', { title: 'Missing field' });
          return;
        }
        workspace = {
          mode: 'create',
          name: newWorktree,
          baseRef: String(baseRefInput?.value || 'HEAD').trim() || 'HEAD'
        };
      } else if (selectedWorkspace && selectedWorkspace !== 'main') {
        workspace = { mode: 'worktree', name: selectedWorkspace };
      }
    } catch (error) {
      await modalMessage(error.message, { title: 'Worktree options unavailable' });
      return;
    }
  }
  try {
    await api(`/api/projects/${projectId}/sessions`, {
      method: 'POST',
      body: JSON.stringify({ kind, workspace })
    });
    await loadDashboard();
  } catch (error) {
    if (error.code === 'MISSING_CLI') {
      const docsByKind = {
        codex: { tool: 'Codex', url: 'https://github.com/openai/codex' },
        claude: { tool: 'Claude', url: 'https://docs.anthropic.com/en/docs/claude-code/quickstart' },
        cursor: { tool: 'Cursor CLI', url: 'https://cursor.com/cli' },
        opencode: { tool: 'OpenCode', url: 'https://opencode.ai/' }
      };
      const docs = docsByKind[kind] || { tool: 'CLI tool', url: '' };
      const openDocs = await modalConfirm(
        `${docs.tool} is not installed. Open download/setup instructions?`,
        { title: `${docs.tool} Missing`, confirmLabel: 'Open docs' }
      );
      if (openDocs && docs.url) {
        window.open(docs.url, '_blank', 'noopener,noreferrer');
      }
      await modalMessage(error.message, { title: 'Launch failed' });
      return;
    }
    await modalMessage(error.message, { title: 'Launch failed' });
  }
}

function agentsEditCommand() {
  return [
    'if [ -n "$EDITOR" ]; then "$EDITOR" AGENTS.md',
    'elif command -v nvim >/dev/null 2>&1; then nvim AGENTS.md',
    'elif command -v vim >/dev/null 2>&1; then vim AGENTS.md',
    'elif command -v vi >/dev/null 2>&1; then vi AGENTS.md',
    'elif command -v nano >/dev/null 2>&1; then nano AGENTS.md',
    'else echo "No terminal editor found for AGENTS.md."',
    'fi',
    'exec "${SHELL:-zsh}"'
  ].join('; ');
}

async function launchAgentsSession(projectId) {
  if (!projectId) {
    return;
  }
  try {
    const result = await api(`/api/projects/${projectId}/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        kind: 'tmux',
        command: agentsEditCommand()
      })
    });
    state.highlightedSessionId = result?.session?.id || null;
    await loadDashboard();
  } catch (error) {
    await modalMessage(error.message || 'Failed to launch AGENTS session.', { title: 'Launch failed' });
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

    // Step 1: pick automation
    const anyHasParams = automations.some((a) => Array.isArray(a.params) && a.params.length);
    const pickerFields = [
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
      submitLabel: anyHasParams ? 'Next' : 'Run',
      fields: pickerFields
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

    // Step 2: collect input params if the automation declares any
    const params = Array.isArray(chosen.params) ? chosen.params : [];
    let inputParams = {};
    if (params.length) {
      const paramFields = params.map((p) => ({
        id: p.name,
        label: p.label || p.name,
        type: 'text',
        value: p.default || '',
        placeholder: p.required ? 'required' : 'optional',
        required: p.required
      }));
      const paramValues = await modalForm({
        title: `${chosen.name} — Parameters`,
        submitLabel: 'Run',
        fields: paramFields
      });
      if (!paramValues) {
        return;
      }
      inputParams = paramValues;
    }

    const runResult = await api(`/api/projects/${projectId}/automations/run`, {
      method: 'POST',
      body: JSON.stringify({ automationId: chosen.id, inputParams })
    });
    await loadDashboard();
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

async function addMcpRepositoryFromMainMenu(projectIdOverride = '') {
  const projects = (state.dashboard?.projects || []).slice();
  if (!projects.length) {
    await modalMessage('Add a project first, then configure an MCP repository for it.', { title: 'No projects' });
    return;
  }
  const override = String(projectIdOverride || '').trim();
  const hasOverride = Boolean(override && projects.some((project) => project.id === override));
  const sortedProjects = projects
    .slice()
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  const defaultProjectId = hasOverride
    ? override
    : (projectById(state.activeProjectId) ? state.activeProjectId : sortedProjects[0].id);
  const fields = [];
  if (!hasOverride) {
    fields.push({
      id: 'projectId',
      label: 'Project',
      type: 'select',
      value: defaultProjectId,
      options: sortedProjects.map((project) => ({ value: project.id, label: String(project.name || project.id) })),
      required: true
    });
  }
  fields.push(
    {
      id: 'source',
      label: 'Source',
      type: 'select',
      value: 'github',
      options: [
        { value: 'github', label: 'GitHub repo URL' },
        { value: 'local', label: 'Local project MCP' }
      ],
      required: true
    },
    { id: 'gitUrl', label: 'GitHub repo URL', type: 'text', value: '', required: false, placeholder: defaultMcpGithubRepoPlaceholder() }
  );
  const values = await modalForm({
    title: 'Configure Project MCP Source',
    submitLabel: 'Add',
    description: 'Choose a project and source. Use GitHub URL for repository sync, or Local project MCP to have Codex discover and configure a local server.',
    fields
  });
  if (!values) {
    return;
  }
  const projectId = hasOverride ? override : String(values.projectId || '').trim();
  if (!projectId) {
    await modalMessage('Project is required.', { title: 'Missing field' });
    return;
  }
  const source = ['github', 'local'].includes(String(values.source || '').trim().toLowerCase())
    ? String(values.source || '').trim().toLowerCase()
    : 'github';
  if (source === 'local') {
    const response = await api(`/api/projects/${projectId}/mcp/repositories`, {
      method: 'POST',
      body: JSON.stringify({
        source: 'local'
      })
    });
    await loadDashboard();
    if (response?.session?.id) {
      state.highlightedSessionId = response.session.id;
      showToast('Started local MCP setup session.', 3200);
      return;
    }
    const skippedCount = Array.isArray(response?.skipped) ? response.skipped.length : 0;
    showToast(`Local MCP setup requested. Sessions launched: 0, skipped: ${skippedCount}.`, 4200);
    return;
  }
  let gitUrl = String(values.gitUrl || '').trim();
  if (!gitUrl) {
    await modalMessage('GitHub repo URL is required.', { title: 'Missing field' });
    return;
  }
  const sshCount = (gitUrl.match(/git@github\.com:/g) || []).length;
  const httpsCount = (gitUrl.match(/https:\/\/github\.com\//g) || []).length;
  if (sshCount > 1 || httpsCount > 1) {
    await modalMessage(
      'The repo URL looks duplicated. Use a single URL, for example: git@github.com:cascade-labs/lean-mcp.git',
      { title: 'Invalid MCP repo URL' }
    );
    return;
  }
  const response = await api(`/api/projects/${projectId}/mcp/repositories`, {
    method: 'POST',
    body: JSON.stringify({
      source: 'github',
      gitUrl
    })
  });
  await loadDashboard();
  if (response?.session?.id) {
    state.highlightedSessionId = response.session.id;
  }
  const repoName = String(response?.repository?.name || response?.repository?.id || gitUrl).trim();
  const tools = Array.isArray(response?.repository?.tools) ? response.repository.tools : [];
  if (!tools.length) {
    await modalMessage(
      `Repository "${repoName}" was added. Apropos launched a Codex session to inspect it and derive local MCP config entries for Claude and Codex.\n\nNo catalog tools were auto-discovered yet, so the session will set up project config directly.`,
      { title: 'Repository added (0 tools)' }
    );
    return;
  }
  showToast(
    `Added ${repoName} (${tools.length} MCP tool${tools.length === 1 ? '' : 's'}).${response?.session?.id ? ' Codex inspection session started.' : ''}`,
    3600
  );
}

function mcpToolOptionLabel(tool) {
  const name = String(tool?.name || tool?.id || '').trim() || 'tool';
  const id = String(tool?.id || '').trim();
  return id ? `${name} (${id})` : name;
}

function configuredMcpToolsForProject(project) {
  const tools = Array.isArray(project?.mcpTools) ? project.mcpTools : [];
  const seenIds = new Set();
  const configured = [];
  for (const tool of tools) {
    const id = String(tool?.id || '').trim();
    if (!id || seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);
    configured.push(tool);
  }
  return configured;
}

function availableMcpToolsForProject(project) {
  const catalog = Array.isArray(project?.mcpCatalog) ? project.mcpCatalog : [];
  const configured = new Set((project?.mcpTools || []).map((tool) => String(tool?.id || '').trim()));
  const seenIds = new Set();
  const available = [];
  for (const tool of catalog) {
    const id = String(tool?.id || '').trim();
    const command = String(tool?.command || '').trim();
    if (!id || !command || configured.has(id) || seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);
    available.push(tool);
  }
  return available;
}

function closeMcpDropdownMenu() {
  if (els.workspaceMcpDropdown) {
    els.workspaceMcpDropdown.open = false;
  }
}

function renderMcpDropdownMenu() {
  const project = projectById(state.activeProjectId);
  if (!project || !els.workspaceMcpDropdown || !els.workspaceMcpMenu) {
    return;
  }
  const configuredTools = configuredMcpToolsForProject(project);
  const availableTools = availableMcpToolsForProject(project);
  els.workspaceMcpMenu.innerHTML = '';

  if (!configuredTools.length) {
    const noneConfigured = document.createElement('button');
    noneConfigured.type = 'button';
    noneConfigured.className = 'small alt mcp-dropdown-item';
    noneConfigured.disabled = true;
    noneConfigured.textContent = 'Configured: none';
    els.workspaceMcpMenu.appendChild(noneConfigured);
  } else {
    for (const tool of configuredTools) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'small alt mcp-dropdown-item';
      button.dataset.mcpAction = 'remove';
      button.dataset.toolId = String(tool.id || '');
      button.textContent = `Remove ${mcpToolOptionLabel(tool)}`;
      els.workspaceMcpMenu.appendChild(button);
    }
  }

  if (availableTools.length) {
    for (const tool of availableTools) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'small alt mcp-dropdown-item';
      button.dataset.mcpAction = 'setup';
      button.dataset.toolId = String(tool.id || '');
      button.textContent = `Add ${mcpToolOptionLabel(tool)}`;
      els.workspaceMcpMenu.appendChild(button);
    }
  }

  const addRepoButton = document.createElement('button');
  addRepoButton.type = 'button';
  addRepoButton.className = 'small alt mcp-dropdown-item';
  addRepoButton.dataset.mcpAction = 'add-repo';
  addRepoButton.textContent = 'Configure MCP source';
  els.workspaceMcpMenu.appendChild(addRepoButton);

  const createButton = document.createElement('button');
  createButton.type = 'button';
  createButton.className = 'small alt mcp-dropdown-item';
  createButton.dataset.mcpAction = 'create';
  createButton.textContent = 'Create new MCP server';
  els.workspaceMcpMenu.appendChild(createButton);
}

async function setupMcpToolForProject(projectId, toolId) {
  const project = projectById(projectId);
  if (!project) {
    return;
  }
  const result = await api(`/api/projects/${projectId}/mcp-tools/setup`, {
    method: 'POST',
    body: JSON.stringify({ toolId: String(toolId || '').trim() })
  });
  await loadDashboard();
  const launchedCount = Array.isArray(result.launched) ? result.launched.length : 0;
  const skippedCount = Array.isArray(result.skipped) ? result.skipped.length : 0;
  showToast(`Configured ${toolId}. Setup launched ${launchedCount}, skipped ${skippedCount}.`, 3000);
}

async function removeMcpToolForProject(projectId, toolId) {
  const project = projectById(projectId);
  if (!project) {
    return;
  }
  await api(`/api/projects/${projectId}/mcp-tools/remove`, {
    method: 'POST',
    body: JSON.stringify({ toolId: String(toolId || '').trim() })
  });
  await loadDashboard();
  showToast(`Removed ${toolId} from ${project.name}.`, 2500);
}

async function startMcpServerDraftSession(projectId) {
  const launched = await api(`/api/projects/${projectId}/mcp-tools/draft-server-session`, {
    method: 'POST'
  });
  state.highlightedSessionId = launched.session?.id || null;
  await loadDashboard();
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
  const result = await openModalBase({
    title: 'Add Project',
    hideSubmit: true,
    hideCancel: true,
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
      localCard.addEventListener('click', () => closeActiveModal({ mode: 'local' }));
      remoteCard.addEventListener('click', () => closeActiveModal({ mode: 'remote' }));
      picker.append(localCard, remoteCard);
      body.appendChild(picker);
    }
  });

  if (!result || !result.mode) {
    return null;
  }

  if (result.mode === 'local') {
    return { mode: 'local' };
  }

  const remoteValues = await modalForm({
    title: 'Add Remote Project',
    submitLabel: 'Add Project',
    fields: [
      { id: 'sshHost', label: 'SSH host', type: 'text', value: '', required: true, placeholder: 'devbox or user@devbox' },
      { id: 'projectPath', label: 'Remote project path', type: 'text', value: '', required: true, placeholder: '/home/user/code/my-project' },
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

els.mobileContextToggle?.addEventListener('click', (event) => {
  event.stopPropagation();
  setMobileContextOpen(!state.mobileContextOpen);
});

els.rouletteModeToggle?.addEventListener('change', async (event) => {
  const enabled = Boolean(event.target?.checked);
  setRouletteModeEnabled(enabled);
  if (state.activeProjectId && projectById(state.activeProjectId)) {
    renderWorkspace();
  }
  showToast(enabled ? 'Focus mode enabled.' : 'Focus mode disabled.');
});

els.notificationDismissAll?.addEventListener('click', async () => {
  await api('/api/alerts', { method: 'DELETE' });
  await loadDashboard();
});

els.projectSwitcherTrigger?.addEventListener('click', (event) => {
  event.stopPropagation();
  setProjectSwitcherOpen(!state.projectSwitcherOpen);
});

els.projectSwitcherMenu?.addEventListener('click', async (event) => {
  const option = event.target.closest('button[data-project-switcher-option]');
  if (!option) {
    return;
  }
  const nextProjectId = String(option.dataset.projectSwitcherOption || '').trim();
  setProjectSwitcherOpen(false);
  if (!nextProjectId || nextProjectId === state.activeProjectId) {
    return;
  }
  await openWorkspace(nextProjectId);
});

document.addEventListener('click', (event) => {
  const insideShell = Boolean(event.target.closest('.notification-shell'));
  if (state.projectSwitcherOpen && !event.target.closest('[data-project-switcher]')) {
    setProjectSwitcherOpen(false);
  }
  if (isMobileViewport() && state.mobileContextOpen && !insideShell) {
    setMobileContextOpen(false);
  }
  if (!state.notificationsOpen) {
    return;
  }
  if (insideShell) {
    return;
  }
  setNotificationsOpen(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.projectSwitcherOpen) {
    setProjectSwitcherOpen(false);
  }
  if (event.key === 'Escape' && state.mobileContextOpen) {
    setMobileContextOpen(false);
  }
  if (event.key === 'Escape' && state.notificationsOpen) {
    setNotificationsOpen(false);
  }
});

window.addEventListener('resize', () => {
  if (!isMobileViewport() && state.mobileContextOpen) {
    setMobileContextOpen(false);
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
  const rouletteButton = event.target.closest('button[data-roulette-nav]');
  if (rouletteButton) {
    if (!state.rouletteModeEnabled) {
      return;
    }
    if (rouletteButton.dataset.rouletteNav === 'prev') {
      retreatFocusModeSelection();
    } else {
      advanceFocusModeSelection();
    }
    renderWorkspace();
    return;
  }
  const resizeButton = event.target.closest('button[data-resize-session]');
  if (resizeButton && state.activeProjectId) {
    event.stopPropagation();
    const sessionId = resizeButton.dataset.resizeSession;
    const session = sessionById(sessionId);
    const projectId = session?.projectId || state.activeProjectId;
    const axis = resizeButton.dataset.axis;
    const delta = Number(resizeButton.dataset.delta || 0);
    const current = getSessionTileSize(projectId, sessionId);
    const next = {
      width: axis === 'x' ? current.width + delta : current.width,
      height: axis === 'y' ? current.height + delta : current.height
    };
    setSessionTileSize(projectId, sessionId, next);
    renderWorkspace();
    return;
  }
  const refreshButton = event.target.closest('button[data-refresh-session]');
  if (refreshButton) {
    event.stopPropagation();
    const refreshed = refreshSessionTerminalConnection(refreshButton.dataset.refreshSession);
    if (refreshed) {
      showToast('Terminal connection refreshed.', 1500);
    } else {
      await loadDashboard();
    }
    return;
  }
  const stopButton = event.target.closest('button[data-stop-session]');
  if (stopButton) {
    await api(`/api/sessions/${stopButton.dataset.stopSession}`, { method: 'DELETE' });
    await loadDashboard();
  }
});

els.terminalGridSplit?.addEventListener('click', async (event) => {
  const rouletteButton = event.target.closest('button[data-roulette-nav]');
  if (rouletteButton) {
    if (!state.rouletteModeEnabled) {
      return;
    }
    if (rouletteButton.dataset.rouletteNav === 'prev') {
      retreatFocusModeSelection();
    } else {
      advanceFocusModeSelection();
    }
    renderWorkspace();
    return;
  }
  const stopButton = event.target.closest('button[data-stop-session]');
  if (stopButton) {
    await api(`/api/sessions/${stopButton.dataset.stopSession}`, { method: 'DELETE' });
    await loadDashboard();
    return;
  }
  const refreshButton = event.target.closest('button[data-refresh-session]');
  if (refreshButton) {
    event.stopPropagation();
    const refreshed = refreshSessionTerminalConnection(refreshButton.dataset.refreshSession);
    if (refreshed) {
      showToast('Terminal connection refreshed.', 1500);
    } else {
      await loadDashboard();
    }
    return;
  }
  const resizeButton = event.target.closest('button[data-resize-session]');
  if (resizeButton && state.activeProjectId) {
    event.stopPropagation();
    const sessionId = resizeButton.dataset.resizeSession;
    const session = sessionById(sessionId);
    const projectId = session?.projectId || state.activeProjectId;
    const axis = resizeButton.dataset.axis;
    const delta = Number(resizeButton.dataset.delta || 0);
    const current = getSessionTileSize(projectId, sessionId);
    const next = {
      width: axis === 'x' ? current.width + delta : current.width,
      height: axis === 'y' ? current.height + delta : current.height
    };
    setSessionTileSize(projectId, sessionId, next);
    renderWorkspace();
  }
});

function captureSessionTileRects(gridRoot) {
  const rects = new Map();
  for (const tile of gridRoot.querySelectorAll('[data-session-id]')) {
    rects.set(tile.dataset.sessionId, tile.getBoundingClientRect());
  }
  return rects;
}

function animateSessionTileReflow(gridRoot, beforeRects, { excludeSessionId = '' } = {}) {
  for (const tile of gridRoot.querySelectorAll('[data-session-id]')) {
    const sessionId = tile.dataset.sessionId;
    if (!sessionId || sessionId === excludeSessionId) {
      continue;
    }
    const before = beforeRects.get(sessionId);
    if (!before) {
      continue;
    }
    const after = tile.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
      continue;
    }
    tile.classList.add('reordering');
    tile.style.transition = 'none';
    tile.style.transform = `translate(${dx}px, ${dy}px)`;
    // Force layout so the initial FLIP transform is committed.
    void tile.offsetWidth;
    requestAnimationFrame(() => {
      tile.style.transition = 'transform 170ms cubic-bezier(0.22, 1, 0.36, 1)';
      tile.style.transform = 'translate(0, 0)';
      const finalize = () => {
        tile.style.transition = '';
        tile.style.transform = '';
        tile.classList.remove('reordering');
        tile.removeEventListener('transitionend', finalize);
      };
      tile.addEventListener('transitionend', finalize, { once: true });
    });
  }
}

function swapSessionTiles(gridRoot, firstTile, secondTile) {
  if (!gridRoot || !firstTile || !secondTile || firstTile === secondTile) {
    return;
  }
  const placeholder = document.createElement('div');
  gridRoot.insertBefore(placeholder, firstTile);
  gridRoot.insertBefore(firstTile, secondTile);
  gridRoot.insertBefore(secondTile, placeholder);
  placeholder.remove();
}

function attachSessionGridDragAndDrop(gridRoot) {
  if (!gridRoot) {
    return;
  }

  gridRoot.addEventListener('dragstart', (event) => {
    if (state.rouletteModeEnabled) {
      event.preventDefault();
      return;
    }
    if (event.target.closest('.terminal-instance')) {
      event.preventDefault();
      return;
    }
    if (event.target.closest('button')) {
      return;
    }
    const tile = event.target.closest('[data-session-id]');
    if (!tile || tile.getAttribute('draggable') !== 'true') {
      return;
    }
    state.draggingSessionId = tile.dataset.sessionId;
    gridRoot.classList.add('drag-active');
    tile.classList.add('dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', state.draggingSessionId);
    }
  });

  gridRoot.addEventListener('dragover', (event) => {
    if (!state.draggingSessionId) {
      return;
    }
    const draggingTile = gridRoot.querySelector(`[data-session-id="${state.draggingSessionId}"]`);
    const targetTile = event.target.closest('[data-session-id]');
    if (!draggingTile || !targetTile || draggingTile === targetTile) {
      return;
    }
    event.preventDefault();
    const targetSessionId = targetTile.dataset.sessionId;
    if (targetSessionId && state.dragHoverSessionId === targetSessionId) {
      return;
    }
    const now = Date.now();
    if (now - state.dragLastSwapAt < 65) {
      return;
    }
    state.dragLastSwapAt = now;
    state.dragHoverSessionId = targetSessionId || '';
    targetTile.classList.add('shuffle-target');
    setTimeout(() => {
      targetTile.classList.remove('shuffle-target');
    }, 170);
    const beforeRects = captureSessionTileRects(gridRoot);
    swapSessionTiles(gridRoot, draggingTile, targetTile);
    animateSessionTileReflow(gridRoot, beforeRects, { excludeSessionId: state.draggingSessionId });
  });

  gridRoot.addEventListener('drop', (event) => {
    if (!state.draggingSessionId) {
      return;
    }
    event.preventDefault();
    const dragged = gridRoot.querySelector(`[data-session-id="${state.draggingSessionId}"]`);
    if (dragged) {
      dragged.classList.remove('dragging');
      dragged.classList.remove('snap-locked');
      dragged.style.transition = 'none';
      dragged.style.transform = 'none';
      // Force immediate visual reset at drop release.
      void dragged.offsetWidth;
      dragged.style.transition = '';
      dragged.style.transform = '';
    }
    gridRoot.classList.remove('drag-active');
    state.draggingSessionId = null;
    state.dragHoverSessionId = '';
    state.dragLastSwapAt = 0;
    persistOrderFromGrid(gridRoot);
  });

  gridRoot.addEventListener('dragend', () => {
    for (const grid of document.querySelectorAll('.terminal-grid.drag-active')) {
      grid.classList.remove('drag-active');
    }
    for (const tile of document.querySelectorAll('.terminal-tile.dragging')) {
      tile.classList.remove('dragging');
    }
    state.draggingSessionId = null;
    state.dragHoverSessionId = '';
    state.dragLastSwapAt = 0;
  });
}

attachSessionGridDragAndDrop(els.terminalGrid);
attachSessionGridDragAndDrop(els.terminalGridSplit);

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
    state.mcpLogEvents = [];
    if (state.logsView === 'mcp') {
      renderWorkspaceLogsOutput();
    }
    return;
  }

  const logsFilterButton = event.target.closest('button[data-logs-filter]');
  if (logsFilterButton) {
    cycleMcpLogsFilter();
    if (state.logsView === 'mcp') {
      renderWorkspaceLogsOutput();
    } else {
      renderLogsViewActions();
    }
    return;
  }

  const logsRefreshButton = event.target.closest('button[data-logs-refresh]');
  if (logsRefreshButton) {
    await loadDiffLogs();
    return;
  }

  const logsViewButton = event.target.closest('button[data-logs-view]');
  if (logsViewButton) {
    setLogsView(logsViewButton.dataset.logsView);
    return;
  }

  const mcpActionButton = event.target.closest('button[data-mcp-action]');
  if (mcpActionButton && state.activeProjectId) {
    const action = String(mcpActionButton.dataset.mcpAction || '').trim();
    closeMcpDropdownMenu();
    if (action === 'add-repo') {
      try {
        await addMcpRepositoryFromMainMenu(state.activeProjectId);
      } catch (error) {
        await modalMessage(error.message, { title: 'Add repo failed' });
      }
      return;
    }
    if (action === 'create') {
      await startMcpServerDraftSession(state.activeProjectId);
      return;
    }
    if (action === 'remove') {
      const toolId = String(mcpActionButton.dataset.toolId || '').trim();
      if (!toolId) {
        return;
      }
      const confirmed = await modalConfirm(`Remove MCP server "${toolId}" from this project?`, {
        title: 'Remove MCP Server',
        confirmLabel: 'Remove'
      });
      if (!confirmed) {
        return;
      }
      try {
        await removeMcpToolForProject(state.activeProjectId, toolId);
      } catch (error) {
        await modalMessage(error.message, { title: 'MCP remove failed' });
      }
      return;
    }
    if (action === 'setup') {
      const toolId = String(mcpActionButton.dataset.toolId || '').trim();
      if (!toolId) {
        return;
      }
      try {
        await setupMcpToolForProject(state.activeProjectId, toolId);
      } catch (error) {
        await modalMessage(error.message, { title: 'MCP setup failed' });
      }
      return;
    }
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
    if (workspaceAction === 'agents') {
      await launchAgentsSession(state.activeProjectId);
      return;
    }
  }

  const launchButton = event.target.closest('button[data-workspace-launch]');
  if (!launchButton || !state.activeProjectId) {
    return;
  }
  await spawnSession(state.activeProjectId, launchButton.dataset.workspaceLaunch);
});

els.workspaceEditorAgentsSystemSelect?.addEventListener('change', async () => {
  if (!state.activeProjectId || state.workspaceEditorKind !== 'agents') {
    return;
  }
  const project = projectById(state.activeProjectId);
  if (!project) {
    return;
  }
  const agentId = String(els.workspaceEditorAgentsSystemSelect?.value || 'claude').trim();
  const editorKind = agentId === 'cursor' ? 'cursor' : 'agents';
  try {
    const payload = await api(`/api/projects/${project.id}/editor?kind=${editorKind}`);
    els.workspaceEditorInput.value = payload.content ?? '';
  } catch {
    els.workspaceEditorInput.value = agentId === 'cursor' ? '# Cursor Project Context\n\n- Add project-specific notes here.\n' : '# Claude Project Context\n\n- Add project-specific notes here.\n';
  }
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
    const fromSlug = projectIdFromSlug(slug);
    if (fromSlug) {
      await openWorkspace(fromSlug, { pushHistory: false });
      return;
    }
    const savedProjectId = loadActiveProjectId();
    if (savedProjectId && projectById(savedProjectId)) {
      await openWorkspace(savedProjectId, { pushHistory: false });
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
