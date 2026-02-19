import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { APROPOS_HOME } from './constants.js';

const MEMORY_DIR = path.join(APROPOS_HOME, 'memory');
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const ALLOWED_TYPES = new Set(['fact', 'preference', 'decision', 'task_context', 'tool_observation']);
const ALLOWED_VISIBILITY = new Set(['project']);

function memoryFilePath(projectId) {
  return path.join(MEMORY_DIR, `${projectId}.json`);
}

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }
  return [...new Set(tags.map((tag) => normalizeString(tag)).filter(Boolean))];
}

function normalizeConfidence(value) {
  if (value === undefined || value === null || value === '') {
    return 0.7;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.max(0, Math.min(1, numeric));
}

function normalizeLimit(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(MAX_LIMIT, parsed));
}

function normalizeType(value) {
  const normalized = normalizeString(value) || 'fact';
  if (!ALLOWED_TYPES.has(normalized)) {
    return null;
  }
  return normalized;
}

function normalizeVisibility(value) {
  const normalized = normalizeString(value) || 'project';
  if (!ALLOWED_VISIBILITY.has(normalized)) {
    return null;
  }
  return normalized;
}

function normalizeMemoryItem(item) {
  const content = normalizeString(item?.content);
  if (!content) {
    return null;
  }
  const type = normalizeType(item?.type);
  const visibility = normalizeVisibility(item?.visibility);
  const confidence = normalizeConfidence(item?.confidence);
  if (!type || !visibility || confidence === null) {
    return null;
  }
  return {
    id: normalizeString(item?.id) || nanoid(12),
    projectId: normalizeString(item?.projectId),
    sessionId: normalizeString(item?.sessionId) || null,
    agentKind: normalizeString(item?.agentKind) || 'unknown',
    type,
    content,
    tags: normalizeTags(item?.tags),
    visibility,
    confidence,
    source: normalizeString(item?.source) || 'manual',
    createdAt: normalizeString(item?.createdAt) || new Date().toISOString(),
    updatedAt: normalizeString(item?.updatedAt) || new Date().toISOString()
  };
}

async function ensureMemoryDir() {
  await fs.mkdir(MEMORY_DIR, { recursive: true });
}

async function readMemoryFile(projectId) {
  await ensureMemoryDir();
  try {
    const raw = await fs.readFile(memoryFilePath(projectId), 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => normalizeMemoryItem(item))
      .filter((item) => item && item.projectId === projectId);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeMemoryFile(projectId, memories) {
  await ensureMemoryDir();
  await fs.writeFile(memoryFilePath(projectId), JSON.stringify(memories, null, 2) + '\n', 'utf8');
}

export async function listProjectMemories(projectId, options = {}) {
  const normalizedProjectId = normalizeString(projectId);
  if (!normalizedProjectId) {
    throw new Error('projectId is required');
  }

  const typeFilter = options?.type ? normalizeType(options.type) : '';
  if (options?.type && !typeFilter) {
    throw new Error('Invalid memory type');
  }
  const tagFilter = normalizeString(options?.tag).toLowerCase();
  const limit = normalizeLimit(options?.limit);

  const memories = await readMemoryFile(normalizedProjectId);
  const filtered = memories.filter((item) => {
    if (typeFilter && item.type !== typeFilter) {
      return false;
    }
    if (tagFilter && !item.tags.some((tag) => tag.toLowerCase() === tagFilter)) {
      return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    const aTs = Date.parse(a.updatedAt || a.createdAt || '');
    const bTs = Date.parse(b.updatedAt || b.createdAt || '');
    return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
  });

  return filtered.slice(0, limit);
}

export async function addProjectMemory(projectId, input = {}) {
  const normalizedProjectId = normalizeString(projectId);
  if (!normalizedProjectId) {
    throw new Error('projectId is required');
  }

  const content = normalizeString(input?.content);
  if (!content) {
    throw new Error('content is required');
  }

  const type = normalizeType(input?.type);
  if (!type) {
    throw new Error('Invalid memory type');
  }
  const visibility = normalizeVisibility(input?.visibility);
  if (!visibility) {
    throw new Error('Invalid memory visibility');
  }
  const confidence = normalizeConfidence(input?.confidence);
  if (confidence === null) {
    throw new Error('Invalid memory confidence');
  }

  const now = new Date().toISOString();
  const entry = {
    id: nanoid(12),
    projectId: normalizedProjectId,
    sessionId: normalizeString(input?.sessionId) || null,
    agentKind: normalizeString(input?.agentKind) || 'unknown',
    type,
    content,
    tags: normalizeTags(input?.tags),
    visibility,
    confidence,
    source: normalizeString(input?.source) || 'manual',
    createdAt: now,
    updatedAt: now
  };

  const memories = await readMemoryFile(normalizedProjectId);
  memories.push(entry);
  await writeMemoryFile(normalizedProjectId, memories);
  return entry;
}

export async function updateProjectMemory(projectId, memoryId, patch = {}) {
  const normalizedProjectId = normalizeString(projectId);
  const normalizedMemoryId = normalizeString(memoryId);
  if (!normalizedProjectId) {
    throw new Error('projectId is required');
  }
  if (!normalizedMemoryId) {
    throw new Error('memoryId is required');
  }

  const memories = await readMemoryFile(normalizedProjectId);
  const index = memories.findIndex((item) => item.id === normalizedMemoryId);
  if (index === -1) {
    return null;
  }

  const current = memories[index];
  const next = { ...current };

  if (Object.prototype.hasOwnProperty.call(patch, 'content')) {
    const content = normalizeString(patch.content);
    if (!content) {
      throw new Error('content cannot be empty');
    }
    next.content = content;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'type')) {
    const type = normalizeType(patch.type);
    if (!type) {
      throw new Error('Invalid memory type');
    }
    next.type = type;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'visibility')) {
    const visibility = normalizeVisibility(patch.visibility);
    if (!visibility) {
      throw new Error('Invalid memory visibility');
    }
    next.visibility = visibility;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'confidence')) {
    const confidence = normalizeConfidence(patch.confidence);
    if (confidence === null) {
      throw new Error('Invalid memory confidence');
    }
    next.confidence = confidence;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'tags')) {
    next.tags = normalizeTags(patch.tags);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'source')) {
    next.source = normalizeString(patch.source) || current.source;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'agentKind')) {
    next.agentKind = normalizeString(patch.agentKind) || current.agentKind;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'sessionId')) {
    next.sessionId = normalizeString(patch.sessionId) || null;
  }

  next.updatedAt = new Date().toISOString();
  memories[index] = next;
  await writeMemoryFile(normalizedProjectId, memories);
  return next;
}

export async function removeProjectMemory(projectId, memoryId) {
  const normalizedProjectId = normalizeString(projectId);
  const normalizedMemoryId = normalizeString(memoryId);
  if (!normalizedProjectId) {
    throw new Error('projectId is required');
  }
  if (!normalizedMemoryId) {
    throw new Error('memoryId is required');
  }

  const memories = await readMemoryFile(normalizedProjectId);
  const index = memories.findIndex((item) => item.id === normalizedMemoryId);
  if (index === -1) {
    return null;
  }
  const [removed] = memories.splice(index, 1);
  await writeMemoryFile(normalizedProjectId, memories);
  return removed;
}

export async function clearProjectMemories(projectId) {
  const normalizedProjectId = normalizeString(projectId);
  if (!normalizedProjectId) {
    throw new Error('projectId is required');
  }
  try {
    await fs.unlink(memoryFilePath(normalizedProjectId));
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}
