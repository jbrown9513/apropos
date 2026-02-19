const EMBEDDING_DIM = 256;
const MAX_SAFE_POINT_ID = 9007199254740991; // Number.MAX_SAFE_INTEGER

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeEndpoint(settings = {}) {
  const endpoint = normalizeString(settings?.endpoint);
  if (endpoint) {
    return endpoint.replace(/\/+$/, '');
  }
  const port = Number.parseInt(String(settings?.dockerPort || 6333), 10) || 6333;
  return `http://127.0.0.1:${port}`;
}

function normalizeCollection(settings = {}) {
  return normalizeString(settings?.collection) || 'apropos_memory';
}

function normalizeProvider(settings = {}) {
  const provider = normalizeString(settings?.provider).toLowerCase();
  return provider || 'local';
}

function stableTokenHash(token) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stablePointId(text) {
  // Deterministically map arbitrary IDs to a Qdrant-safe unsigned integer.
  let hash = 0;
  const input = normalizeString(text);
  for (let index = 0; index < input.length; index += 1) {
    hash = (Math.imul(31, hash) + input.charCodeAt(index)) >>> 0;
  }
  const asNumber = Number(hash) || 1;
  return Math.max(1, Math.min(MAX_SAFE_POINT_ID, asNumber));
}

function tokenize(text) {
  return normalizeString(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
}

function normalizeVector(vector) {
  let sumSquares = 0;
  for (const value of vector) {
    sumSquares += value * value;
  }
  const norm = Math.sqrt(sumSquares) || 1;
  return vector.map((value) => value / norm);
}

function embedText(text) {
  const tokens = tokenize(text);
  const vector = new Array(EMBEDDING_DIM).fill(0);
  for (const token of tokens) {
    const hash = stableTokenHash(token);
    const index = hash % EMBEDDING_DIM;
    const sign = (hash & 1) === 0 ? 1 : -1;
    vector[index] += sign;
  }
  return normalizeVector(vector);
}

async function httpJson(url, method, body = null) {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body == null ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!response.ok) {
    const details = typeof parsed === 'object' ? JSON.stringify(parsed) : String(parsed || '');
    throw new Error(`Vector store request failed (${response.status}): ${details}`);
  }
  return parsed;
}

async function ensureQdrantCollection(endpoint, collection) {
  const url = `${endpoint}/collections/${encodeURIComponent(collection)}`;
  const existing = await fetch(url, { method: 'GET' });
  if (existing.ok) {
    return;
  }
  await httpJson(url, 'PUT', {
    vectors: {
      size: EMBEDDING_DIM,
      distance: 'Cosine'
    }
  });
}

export function createVectorAdapter() {
  return {
    async upsert(memory, settings = {}) {
      const vectorSettings = settings?.vectorStore || {};
      const provider = normalizeProvider(vectorSettings);
      if (provider !== 'qdrant') {
        return {
          provider,
          ok: true,
          skipped: true,
          reason: 'Provider is not qdrant; vector upsert skipped.'
        };
      }

      const endpoint = normalizeEndpoint(vectorSettings);
      const collection = normalizeCollection(vectorSettings);
      const content = normalizeString(memory?.content);
      if (!content) {
        return {
          provider,
          ok: true,
          skipped: true,
          reason: 'Memory content is empty; vector upsert skipped.'
        };
      }

      await ensureQdrantCollection(endpoint, collection);
      const vector = embedText([
        memory?.content || '',
        Array.isArray(memory?.tags) ? memory.tags.join(' ') : '',
        memory?.type || '',
        memory?.agentKind || ''
      ].join(' '));

      await httpJson(
        `${endpoint}/collections/${encodeURIComponent(collection)}/points?wait=true`,
        'PUT',
        {
          points: [
            {
              id: stablePointId(`${memory.projectId}:${memory.id}`),
              vector,
              payload: {
                id: String(memory.id),
                projectId: String(memory.projectId || ''),
                sessionId: memory.sessionId || null,
                type: String(memory.type || ''),
                source: String(memory.source || ''),
                agentKind: String(memory.agentKind || ''),
                createdAt: String(memory.createdAt || ''),
                updatedAt: String(memory.updatedAt || ''),
                tags: Array.isArray(memory.tags) ? memory.tags : []
              }
            }
          ]
        }
      );

      return {
        provider,
        ok: true,
        skipped: false,
        collection,
        endpoint
      };
    },

    async search(params = {}) {
      const settings = params?.settings || {};
      const vectorSettings = settings?.vectorStore || {};
      const provider = normalizeProvider(vectorSettings);
      if (provider !== 'qdrant') {
        return [];
      }
      const query = normalizeString(params?.query);
      const projectId = normalizeString(params?.projectId);
      if (!query || !projectId) {
        return [];
      }

      const endpoint = normalizeEndpoint(vectorSettings);
      const collection = normalizeCollection(vectorSettings);
      await ensureQdrantCollection(endpoint, collection);

      const limit = Number.parseInt(String(params?.limit || 8), 10) || 8;
      const vector = embedText(query);

      const result = await httpJson(
        `${endpoint}/collections/${encodeURIComponent(collection)}/points/search`,
        'POST',
        {
          vector,
          limit: Math.max(1, Math.min(50, limit)),
          with_payload: true,
          filter: {
            must: [
              {
                key: 'projectId',
                match: { value: projectId }
              }
            ]
          }
        }
      );

      const points = Array.isArray(result?.result) ? result.result : [];
      return points.map((point) => ({
        id: String(point?.payload?.id || point?.id || ''),
        score: Number(point?.score || 0),
        payload: point?.payload || {}
      })).filter((item) => item.id);
    },

    async health(settings = {}) {
      const vectorSettings = settings?.vectorStore || {};
      const provider = normalizeProvider(vectorSettings);
      if (provider !== 'qdrant') {
        return {
          provider,
          ok: true,
          configured: true,
          reachable: false,
          reason: 'Vector provider is not qdrant.'
        };
      }

      const endpoint = normalizeEndpoint(vectorSettings);
      const collection = normalizeCollection(vectorSettings);
      try {
        const info = await httpJson(`${endpoint}/collections`, 'GET');
        return {
          provider,
          ok: true,
          configured: true,
          reachable: true,
          endpoint,
          collection,
          collectionsCount: Array.isArray(info?.result?.collections) ? info.result.collections.length : 0
        };
      } catch (error) {
        return {
          provider,
          ok: false,
          configured: true,
          reachable: false,
          endpoint,
          collection,
          error: error.message
        };
      }
    }
  };
}
