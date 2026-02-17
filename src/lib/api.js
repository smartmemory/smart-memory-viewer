const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:9001' : 'https://api.smartmemory.ai');

let authToken = null;
let teamId = null;

// Connection status listener — set by useConnectionStatus hook
let _onConnectionChange = null;
export function onConnectionChange(cb) { _onConnectionChange = cb; }

export function setAuth(token, team) {
  authToken = token;
  teamId = team;
}

export function getAuthToken() {
  return authToken;
}

async function request(method, path, body = null) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  if (teamId) {
    headers['X-Team-Id'] = teamId;
  }

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, opts);
  } catch (err) {
    // Network error — API unreachable
    _onConnectionChange?.(false);
    throw err;
  }

  if (res.status >= 500) {
    _onConnectionChange?.(false);
  } else {
    _onConnectionChange?.(true);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

export async function listMemories(limit = 2000, offset = 0) {
  return request('GET', `/memory/list?limit=${limit}&offset=${offset}`);
}

export async function getMemory(id) {
  return request('GET', `/memory/${encodeURIComponent(id)}`);
}

export async function getNeighbors(itemId) {
  return request('GET', `/memory/${encodeURIComponent(itemId)}/neighbors`);
}

export async function getLinks(itemId) {
  return request('GET', `/memory/${encodeURIComponent(itemId)}/links`);
}

export async function findPath(startId, endId, maxHops = 5) {
  return request('GET', `/memory/graph/path?start_id=${encodeURIComponent(startId)}&end_id=${encodeURIComponent(endId)}&max_hops=${maxHops}`);
}

export async function searchMemories(query, topK = 20) {
  return request('POST', '/memory/search', { query, top_k: topK, enable_hybrid: true });
}

export async function getEdgesBulk(nodeIds) {
  return request('POST', '/memory/graph/edges', { node_ids: nodeIds });
}

export async function getTemporalSnapshot(timestamp, limit = 2000) {
  return request('GET', `/memory/temporal/at/${encodeURIComponent(timestamp)}?limit=${limit}`);
}

export async function getFullGraph(limit = 5000) {
  return request('GET', `/memory/graph/full?limit=${limit}`);
}

// --- Ontology pattern CRUD (feeds into EntityRuler self-learning) ---

export async function createOntologyPattern(name, entityType, confidence = 1.0) {
  return request('POST', '/memory/ontology/patterns', {
    name,
    entity_type: entityType,
    confidence,
  });
}

export async function deleteOntologyPattern(name, entityType) {
  return request('DELETE', `/memory/ontology/patterns/${encodeURIComponent(name)}?entity_type=${encodeURIComponent(entityType)}`);
}

// --- Wikipedia search (direct API, bypasses enricher for reliable shape) ---

export async function searchWikipedia(entityName) {
  // Use Wikipedia's REST API for search + summary
  const encoded = encodeURIComponent(entityName);
  const searchRes = await fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encoded}&limit=5&format=json&origin=*`);
  const [, titles, , urls] = await searchRes.json();

  if (!titles || titles.length === 0) return [];

  // Fetch summaries for top results
  const results = await Promise.all(
    titles.slice(0, 5).map(async (title, i) => {
      try {
        const summaryRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
        if (!summaryRes.ok) return { title, url: urls[i], summary: '', categories: [] };
        const data = await summaryRes.json();
        return {
          title: data.title || title,
          summary: data.extract || '',
          url: data.content_urls?.desktop?.page || urls[i],
          categories: [],
          description: data.description || '',
        };
      } catch {
        return { title, url: urls[i], summary: '', categories: [] };
      }
    })
  );

  return results;
}

// --- Graph node mutations ---

export async function updateEntityNode(nodeId, updates) {
  return request('PATCH', `/memory/graph/nodes/${encodeURIComponent(nodeId)}`, updates);
}

export async function getGroundingStatus(nodeId) {
  return request('GET', `/memory/graph/nodes/${encodeURIComponent(nodeId)}/grounding`);
}

export async function removeGrounding(nodeId) {
  return request('DELETE', `/memory/graph/nodes/${encodeURIComponent(nodeId)}/grounding`);
}
