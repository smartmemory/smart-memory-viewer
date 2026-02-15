const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:9001' : 'https://api.smartmemory.ai');

let authToken = null;
let teamId = null;

export function setAuth(token, team) {
  authToken = token;
  teamId = team;
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

  const res = await fetch(`${API_URL}${path}`, opts);
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
