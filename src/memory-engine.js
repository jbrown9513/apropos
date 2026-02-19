import { addProjectMemory, listProjectMemories, removeProjectMemory } from './memory.js';

const DEFAULT_DRAIN_INTERVAL_MS = 700;
const DEFAULT_BATCH_SIZE = 20;

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeLimit(value, fallback = 8, max = 100) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.max(1, Math.min(max, parsed));
}

function tokenize(value) {
  return normalizeString(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
}

function jaccardScore(queryTokens, textTokens) {
  if (!queryTokens.length || !textTokens.length) {
    return 0;
  }
  const q = new Set(queryTokens);
  const t = new Set(textTokens);
  let overlap = 0;
  for (const token of q) {
    if (t.has(token)) {
      overlap += 1;
    }
  }
  const union = new Set([...q, ...t]).size || 1;
  return overlap / union;
}

function recencyBoost(memory) {
  const ts = Date.parse(memory?.updatedAt || memory?.createdAt || '');
  if (!Number.isFinite(ts)) {
    return 0;
  }
  const ageMinutes = Math.max(0, (Date.now() - ts) / 60000);
  if (ageMinutes <= 10) {
    return 0.2;
  }
  if (ageMinutes <= 60) {
    return 0.1;
  }
  if (ageMinutes <= 24 * 60) {
    return 0.04;
  }
  return 0;
}

function memoryTextForScoring(memory) {
  return [
    memory?.content || '',
    Array.isArray(memory?.tags) ? memory.tags.join(' ') : '',
    memory?.type || '',
    memory?.agentKind || ''
  ].join(' ');
}

class NoopVectorAdapter {
  async upsert(_memory, settings = {}) {
    return {
      provider: normalizeString(settings?.vectorStore?.provider) || 'local',
      ok: true,
      skipped: true,
      reason: 'No vector embedding pipeline configured yet.'
    };
  }

  async search(_params) {
    return [];
  }
}

export function createMemoryEngine(options = {}) {
  const drainIntervalMs = Number(options?.drainIntervalMs) > 0 ? Number(options.drainIntervalMs) : DEFAULT_DRAIN_INTERVAL_MS;
  const batchSize = Number(options?.batchSize) > 0 ? Number(options.batchSize) : DEFAULT_BATCH_SIZE;
  const getSettings = typeof options?.getSettings === 'function' ? options.getSettings : (() => ({}));
  const onIngested = typeof options?.onIngested === 'function' ? options.onIngested : null;
  const onError = typeof options?.onError === 'function' ? options.onError : null;
  const vectorAdapter = options?.vectorAdapter || new NoopVectorAdapter();

  const queue = [];
  let draining = false;
  let timer = null;
  let processedCount = 0;
  let failedCount = 0;
  let lastDrainAt = null;
  let lastError = null;

  async function ingest(input = {}) {
    const projectId = normalizeString(input.projectId);
    if (!projectId) {
      throw new Error('projectId is required');
    }
    const content = normalizeString(input.content);
    if (!content) {
      throw new Error('content is required');
    }

    const memory = await addProjectMemory(projectId, {
      type: input.type || 'fact',
      content,
      tags: Array.isArray(input.tags) ? input.tags : [],
      source: input.source || 'manual',
      agentKind: input.agentKind || 'unknown',
      sessionId: input.sessionId || null,
      confidence: input.confidence,
      visibility: input.visibility || 'project'
    });

    let vector = null;
    try {
      vector = await vectorAdapter.upsert(memory, getSettings());
    } catch (error) {
      vector = {
        ok: false,
        skipped: false,
        reason: error.message
      };
    }

    const result = { memory, vector };
    if (onIngested) {
      await onIngested(result);
    }
    return result;
  }

  function mapEventToMemoryInput(event = {}) {
    const eventType = normalizeString(event.type).toLowerCase();
    const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
    const summary = normalizeString(event.summary) || normalizeString(payload.summary);
    const tags = Array.isArray(event.tags) ? event.tags : (Array.isArray(payload.tags) ? payload.tags : []);

    if (eventType === 'tool_call.failed' || eventType === 'tool_call.succeeded' || eventType === 'tool_call.started') {
      const tool = normalizeString(payload.toolId || payload.method || 'tool');
      const status = normalizeString(payload.status || eventType.split('.').at(-1) || 'unknown');
      const duration = payload.durationMs != null ? ` duration=${payload.durationMs}ms` : '';
      return {
        type: 'tool_observation',
        content: summary || `Tool call ${tool} status=${status}${duration}`,
        tags: [tool, status, ...tags].filter(Boolean),
        source: normalizeString(event.source) || 'event-ingest',
        sessionId: event.sessionId || payload.sessionId || null,
        agentKind: event.agentKind || payload.agentKind || 'unknown',
        confidence: event.confidence
      };
    }

    if (eventType === 'decision.made') {
      return {
        type: 'decision',
        content: summary || normalizeString(payload.decision) || 'Decision captured.',
        tags,
        source: normalizeString(event.source) || 'event-ingest',
        sessionId: event.sessionId || payload.sessionId || null,
        agentKind: event.agentKind || payload.agentKind || 'unknown',
        confidence: event.confidence
      };
    }

    if (eventType === 'preference.learned') {
      return {
        type: 'preference',
        content: summary || normalizeString(payload.preference) || 'Preference captured.',
        tags,
        source: normalizeString(event.source) || 'event-ingest',
        sessionId: event.sessionId || payload.sessionId || null,
        agentKind: event.agentKind || payload.agentKind || 'unknown',
        confidence: event.confidence
      };
    }

    return {
      type: event.typeHint || 'task_context',
      content: summary || normalizeString(payload.content) || normalizeString(payload.message) || 'Event captured.',
      tags: [eventType, ...tags].filter(Boolean),
      source: normalizeString(event.source) || 'event-ingest',
      sessionId: event.sessionId || payload.sessionId || null,
      agentKind: event.agentKind || payload.agentKind || 'unknown',
      confidence: event.confidence
    };
  }

  async function drain() {
    if (draining || !queue.length) {
      return;
    }
    draining = true;
    try {
      while (queue.length) {
        const batch = queue.splice(0, batchSize);
        for (const item of batch) {
          try {
            const result = await ingest(item.input);
            processedCount += 1;
            item.resolve(result);
          } catch (error) {
            failedCount += 1;
            lastError = {
              message: error.message,
              at: new Date().toISOString()
            };
            if (onError) {
              try {
                await onError(error, item.input);
              } catch {
                // Ignore observer errors.
              }
            }
            item.reject(error);
          }
        }
      }
    } finally {
      draining = false;
      lastDrainAt = new Date().toISOString();
    }
  }

  function enqueueIngest(input = {}) {
    return new Promise((resolve, reject) => {
      queue.push({ input, resolve, reject });
      if (queue.length >= batchSize) {
        void drain();
      }
    });
  }

  function enqueueEventIngest(event = {}) {
    const projectId = normalizeString(event.projectId);
    if (!projectId) {
      return Promise.reject(new Error('projectId is required'));
    }
    const mapped = mapEventToMemoryInput(event);
    return enqueueIngest({
      ...mapped,
      projectId
    });
  }

  async function recall(params = {}) {
    const projectId = normalizeString(params.projectId);
    if (!projectId) {
      throw new Error('projectId is required');
    }
    const query = normalizeString(params.query);
    if (!query) {
      throw new Error('query is required');
    }

    const limit = normalizeLimit(params.limit, 8, 50);
    const sessionId = normalizeString(params.sessionId);
    const tagFilter = normalizeString(params.tag).toLowerCase();
    const memories = await listProjectMemories(projectId, { limit: 500 });
    const queryTokens = tokenize(query);

    const ranked = memories
      .filter((memory) => {
        if (tagFilter && !memory.tags.some((tag) => String(tag || '').toLowerCase() === tagFilter)) {
          return false;
        }
        return true;
      })
      .map((memory) => {
        const textTokens = tokenize(memoryTextForScoring(memory));
        const lexical = jaccardScore(queryTokens, textTokens);
        const sessionBoost = sessionId && String(memory.sessionId || '') === sessionId ? 0.15 : 0;
        const score = lexical + recencyBoost(memory) + sessionBoost;
        return { memory, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    const vectorResults = await vectorAdapter.search({
      projectId,
      query,
      limit,
      settings: getSettings()
    }).catch(() => []);
    const vectorById = new Map(vectorResults.map((item) => [String(item?.id || ''), Number(item?.score || 0)]));

    const merged = ranked.map((entry) => {
      const vectorBonus = vectorById.get(String(entry.memory.id || '')) || 0;
      return {
        memory: entry.memory,
        score: Number((entry.score + vectorBonus).toFixed(4)),
        lexicalScore: Number(entry.score.toFixed(4)),
        vectorScore: Number(vectorBonus.toFixed(4))
      };
    }).sort((a, b) => b.score - a.score);

    return {
      query,
      count: Math.min(limit, merged.length),
      results: merged.slice(0, limit)
    };
  }

  async function consolidate(params = {}) {
    const projectId = normalizeString(params.projectId);
    if (!projectId) {
      throw new Error('projectId is required');
    }

    const limit = normalizeLimit(params.limit, 500, 2000);
    const memories = await listProjectMemories(projectId, { limit });
    const sorted = memories.slice().sort((a, b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0));

    const seen = new Set();
    let removed = 0;
    for (const memory of sorted) {
      const key = `${normalizeString(memory.type).toLowerCase()}|${normalizeString(memory.content).toLowerCase()}`;
      if (!key || key === '|') {
        continue;
      }
      if (seen.has(key)) {
        await removeProjectMemory(projectId, memory.id);
        removed += 1;
        continue;
      }
      seen.add(key);
    }

    return {
      projectId,
      removed,
      retained: sorted.length - removed
    };
  }

  function start() {
    if (timer) {
      return;
    }
    timer = setInterval(() => {
      void drain();
    }, drainIntervalMs);
  }

  async function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    await drain();
  }

  async function flush(timeoutMs = 5000) {
    const start = Date.now();
    while (queue.length || draining) {
      await drain();
      if (!queue.length && !draining) {
        break;
      }
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Memory engine flush timed out after ${timeoutMs}ms`);
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return getStats();
  }

  function getStats() {
    return {
      running: Boolean(timer),
      draining,
      queueDepth: queue.length,
      processedCount,
      failedCount,
      lastDrainAt,
      lastError
    };
  }

  return {
    start,
    stop,
    flush,
    getStats,
    ingest,
    enqueueIngest,
    enqueueEventIngest,
    recall,
    consolidate
  };
}
