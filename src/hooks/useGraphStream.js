import { useState, useEffect, useRef, useCallback } from 'react';
import { MEMORY_TYPE_SET } from '../lib/graphColors';
import { saveRecording } from '../lib/eventStore';

const DEFAULT_WS_URL = import.meta.env.VITE_INSIGHTS_WS_URL
  || (import.meta.env.DEV ? 'ws://localhost:9003/events' : 'wss://insights.smartmemory.ai/events');

/**
 * Classify a raw WebSocket event into a graph-relevant operation.
 * Returns null for events that should be ignored.
 */
export function classifyEvent(raw) {
  if (!raw || raw.type !== 'new_event') return null;

  const { component, operation, name, data, trace_id } = raw;
  const memoryId = data?.memory_id || data?.item_id || null;
  const id = raw.event_id || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const base = { id, timestamp: raw.timestamp || new Date().toISOString(), traceId: trace_id, meta: raw };

  // Graph mutations
  if (component === 'graph') {
    if (operation === 'add_node' || operation === 'add_nodes_bulk') {
      // Skip Wikipedia grounding nodes
      const nodeId = data?.item_id || memoryId;
      if (nodeId && nodeId.startsWith('wikipedia:')) return null;
      return { ...base, category: 'node_added', label: `Node "${data?.label || memoryId || 'unknown'}" added`, nodeId: memoryId };
    }
    if (operation === 'add_edge' || operation === 'add_edges_bulk') {
      const src = data?.source_id || data?.source || '';
      const tgt = data?.target_id || data?.target || '';
      const edgeType = data?.edge_type || 'RELATES_TO';
      // Convert GROUNDED_IN edge events into grounding flash events
      if (edgeType === 'GROUNDED_IN' || src.startsWith('wikipedia:') || tgt.startsWith('wikipedia:')) {
        // Flash the non-wikipedia endpoint (the entity that just got grounded)
        const groundedNodeId = src.startsWith('wikipedia:') ? tgt : src;
        // Extract a readable name from the wikipedia node ID (e.g. "wikipedia:ada_lovelace" → "Ada Lovelace")
        const wikiId = src.startsWith('wikipedia:') ? src : tgt;
        const wikiName = wikiId.replace('wikipedia:', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return { ...base, category: 'grounding_flash', label: `Grounded "${wikiName}"`, nodeId: groundedNodeId };
      }
      const edgeId = data?.edge_id || (src && tgt ? `${src}->${tgt}` : null);
      return { ...base, category: 'edge_added', label: `Edge "${edgeType}"`, nodeId: src || null, edgeId };
    }
    if (operation === 'clear_all') {
      const nuclear = data?.nuclear ? ' (nuclear)' : '';
      return { ...base, category: 'graph_cleared', label: `Graph cleared${nuclear}`, nodeId: null };
    }
    if (operation?.startsWith('delete')) {
      return { ...base, category: 'node_removed', label: `Removed ${memoryId || 'element'}`, nodeId: memoryId };
    }
  }

  // Pipeline stages
  if (component === 'pipeline' || (name && name.startsWith('pipeline.'))) {
    const stage = operation || name?.split('.').pop() || 'unknown';
    const durationStr = raw.duration_ms != null ? ` (${Math.round(raw.duration_ms)}ms)` : '';
    return { ...base, category: 'pipeline_stage', label: `Pipeline: ${stage}${durationStr}`, nodeId: memoryId };
  }

  // Search
  if (component === 'memory' && operation === 'search') {
    const query = data?.query || '';
    const resultCount = data?.result_count ?? data?.top_k ?? 0;
    const matchIds = data?.result_ids || [];
    return { ...base, category: 'search_highlight', label: `Search: ${resultCount} results for "${query.substring(0, 30)}"`, nodeId: null, matchIds };
  }

  // Ingest
  if (component === 'memory' && operation === 'ingest') {
    const preview = data?.content?.substring(0, 30) || memoryId || '';
    return { ...base, category: 'ingest_started', label: `Ingesting: "${preview}..."`, nodeId: memoryId };
  }

  return null;
}

/**
 * Build a Cytoscape node element from a graph event's data.
 */
export function eventToNodeElement(data) {
  if (!data) return null;
  const id = data.memory_id || data.item_id || data.node_id || data.id;
  if (!id) return null;
  // Skip internal nodes (version tracker artifacts, Wikipedia grounding nodes)
  if (id.startsWith('version_') || id.startsWith('wikipedia:')) return null;
  const label = data.label || data.title || data.content?.substring(0, 40) || id.substring(0, 12);
  // Determine category: explicit node_category wins, then check entity_type, then fall back to memory_type
  const isEntity = data.node_category === 'entity' || !!data.entity_type;
  const type = isEntity
    ? (data.entity_type || data.type || 'concept')
    : (data.memory_type || data.type || 'semantic');
  const category = isEntity ? 'entity' : (MEMORY_TYPE_SET.has(type) ? 'memory' : 'entity');
  return { group: 'nodes', data: { id, label, type, category, content: data.content || '', parentId: data.parent_memory_id || null } };
}

/**
 * Build a Cytoscape edge element from a graph event's data.
 */
export function eventToEdgeElement(data) {
  if (!data) return null;
  const src = data.source_id || data.source;
  const tgt = data.target_id || data.target;
  if (!src || !tgt) return null;
  const edgeType = data.edge_type || data.link_type || 'RELATES_TO';
  // Skip Wikipedia grounding edges — handled as metadata, not visible graph elements
  if (edgeType === 'GROUNDED_IN') return null;
  // Skip edges to/from Wikipedia nodes
  if (src.startsWith('wikipedia:') || tgt.startsWith('wikipedia:')) return null;
  return {
    group: 'edges',
    data: { id: `${src}->${tgt}:${edgeType}`, source: src, target: tgt, label: edgeType, type: edgeType },
  };
}

/**
 * Normalize an entity label for frontend deduplication.
 * Strips articles, lowercases, collapses whitespace.
 */
function normalizeLabel(label) {
  if (!label) return '';
  return label
    .toLowerCase()
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Reciprocal edge pairs that should be merged into a single bidirectional RELATED_ENTITY edge
const RECIPROCAL_PAIRS = new Set(['CONTAINS_ENTITY', 'MENTIONED_IN']);

/**
 * Coalesce duplicate entity nodes by normalized label, remap edges,
 * and merge reciprocal edge pairs (CONTAINS_ENTITY + MENTIONED_IN → RELATED_ENTITY).
 * Mutates canonicalMap in-place for cross-batch persistence.
 *
 * @param {Array} nodes - Cytoscape node elements
 * @param {Array} edges - Cytoscape edge elements
 * @param {Object} canonicalMap - normalizedLabel -> canonicalNodeId (mutable, persists across calls)
 * @returns {{ nodes, edges, idRemap }}
 */
export function coalesceElements(nodes, edges, canonicalMap = {}) {
  const idRemap = {};
  const dedupedNodes = [];

  for (const node of nodes) {
    const { id, label, category } = node.data;
    // Only coalesce entity nodes, not memory nodes
    if (category !== 'entity') {
      dedupedNodes.push(node);
      continue;
    }
    const key = normalizeLabel(label);
    if (!key) {
      dedupedNodes.push(node);
      continue;
    }
    if (canonicalMap[key] && canonicalMap[key] !== id) {
      idRemap[id] = canonicalMap[key];
    } else {
      canonicalMap[key] = id;
      dedupedNodes.push(node);
    }
  }

  // First pass: remap endpoints and collect edges
  const rawEdges = [];
  for (const edge of edges) {
    const src = idRemap[edge.data.source] || edge.data.source;
    const tgt = idRemap[edge.data.target] || edge.data.target;
    if (src === tgt) continue; // self-loop from merging
    rawEdges.push({
      ...edge,
      data: { ...edge.data, source: src, target: tgt },
    });
  }

  // Second pass: merge reciprocal CONTAINS_ENTITY + MENTIONED_IN into RELATED_ENTITY
  // Track node pairs that have reciprocal edges
  const reciprocalPairs = new Set(); // "nodeA||nodeB" (sorted)
  const reciprocalEdges = []; // edges that are part of a reciprocal pair
  const nonReciprocalEdges = [];

  for (const edge of rawEdges) {
    if (RECIPROCAL_PAIRS.has(edge.data.type)) {
      const pairKey = [edge.data.source, edge.data.target].sort().join('||');
      reciprocalEdges.push({ edge, pairKey });
      reciprocalPairs.add(pairKey);
    } else {
      nonReciprocalEdges.push(edge);
    }
  }

  // Emit one RELATED_ENTITY edge per pair, drop duplicates
  const seenEdges = new Set();
  const remappedEdges = [];

  for (const pairKey of reciprocalPairs) {
    const [a, b] = pairKey.split('||');
    const edgeKey = `${a}->${b}:RELATED_ENTITY`;
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);
    remappedEdges.push({
      group: 'edges',
      data: { id: edgeKey, source: a, target: b, label: 'RELATED_ENTITY', type: 'RELATED_ENTITY' },
    });
  }

  // Also emit unpaired reciprocal edges as-is (e.g. only CONTAINS_ENTITY without MENTIONED_IN)
  for (const { edge, pairKey } of reciprocalEdges) {
    if (reciprocalPairs.has(pairKey)) continue; // already merged
    const edgeKey = `${edge.data.source}->${edge.data.target}:${edge.data.type}`;
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);
    remappedEdges.push({
      ...edge,
      data: { ...edge.data, id: edgeKey },
    });
  }

  // Non-reciprocal edges pass through with dedup
  for (const edge of nonReciprocalEdges) {
    const edgeKey = `${edge.data.source}->${edge.data.target}:${edge.data.type}`;
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);
    remappedEdges.push({
      ...edge,
      data: { ...edge.data, id: edgeKey },
    });
  }

  return { nodes: dedupedNodes, edges: remappedEdges, idRemap };
}

/**
 * React hook for real-time graph event streaming via Insights WebSocket.
 *
 * @param {Object} options
 * @param {string} [options.wsUrl] - WebSocket URL (default: Insights at :9003/events)
 * @param {boolean} [options.enabled=true] - Toggle connection
 * @param {number} [options.bufferSize=100] - Ring buffer capacity
 * @param {Function} [options.onElementAdded] - Callback with single Cytoscape element (node or edge), called in backend order
 * @param {Function} [options.onSearchHighlight] - Callback with array of matching node IDs
 * @param {Function} [options.onPipelineProgress] - Callback with { nodeId, stage, durationMs }
 */
export function useGraphStream(options = {}) {
  const {
    wsUrl = DEFAULT_WS_URL,
    token,
    enabled = true,
    bufferSize = 100,
    onElementAdded,
    onSearchHighlight,
    onPipelineProgress,
    onGraphCleared,
    onReconnect,
    onGroundingFlash,
  } = options;

  // Build authenticated WS URL
  const authenticatedWsUrl = token
    ? `${wsUrl}${wsUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
    : wsUrl;

  const [status, setStatus] = useState('disconnected');
  const [operations, setOperations] = useState([]);
  const [opsPerSecond, setOpsPerSecond] = useState(0);
  const isPausedRef = useRef(false);
  const [isPaused, setIsPaused] = useState(false);

  // Refs for callbacks (avoid stale closures)
  const callbacksRef = useRef({ onElementAdded, onSearchHighlight, onPipelineProgress, onGraphCleared, onReconnect, onGroundingFlash });
  callbacksRef.current = { onElementAdded, onSearchHighlight, onPipelineProgress, onGraphCleared, onReconnect, onGroundingFlash };

  // Batch window: collect events, flush every 200ms
  const batchRef = useRef([]);
  const batchTimerRef = useRef(null);
  const opsTimestampsRef = useRef([]); // timestamps for ops/sec calculation
  const unmountedRef = useRef(false);

  // Pending graph elements — accumulates WS node/edge elements for replay after refresh
  const pendingElementsRef = useRef([]);

  // Recording accumulator — groups graph elements by trace ID for offline replay
  const recordingBufferRef = useRef({}); // { [traceId]: { elements: [], label, timer } }
  const RECORDING_FLUSH_DELAY = 5000; // Save recording 5s after last event for a trace

  // Entity coalescing — persists across batches so cross-batch duplicates are caught
  const canonicalMapRef = useRef({});

  const flushBatch = useCallback(() => {
    if (unmountedRef.current || isPausedRef.current) return; // guard against post-unmount or post-pause flush
    const batch = batchRef.current;
    batchRef.current = [];
    if (batch.length === 0) return;

    const now = Date.now();
    opsTimestampsRef.current.push(...batch.map(() => now));
    // Keep only last 5 seconds
    const cutoff = now - 5000;
    opsTimestampsRef.current = opsTimestampsRef.current.filter((t) => t > cutoff);
    // Use actual elapsed time (not fixed 5s) to avoid inflated rates early on
    const timestamps = opsTimestampsRef.current;
    const elapsed = timestamps.length > 1 ? Math.max((now - timestamps[0]) / 1000, 1) : 1;
    const windowSec = Math.min(elapsed, 5);
    setOpsPerSecond(Math.round((timestamps.length / windowSec) * 10) / 10);

    // Update ring buffer
    setOperations((prev) => {
      const next = [...batch, ...prev];
      return next.length > bufferSize ? next.slice(0, bufferSize) : next;
    });

    // Fire callbacks for graph updates
    const cbs = callbacksRef.current;
    const searchIds = [];

    // Build interleaved element list preserving backend order (node → edges → node → edges ...)
    const rawElements = [];
    let graphCleared = false;
    for (const op of batch) {
      if (op.category === 'graph_cleared') {
        graphCleared = true;
      } else if (op.category === 'node_added') {
        const el = eventToNodeElement(op.meta?.data);
        if (el) rawElements.push(el);
      } else if (op.category === 'edge_added') {
        const el = eventToEdgeElement(op.meta?.data);
        if (el) rawElements.push(el);
      } else if (op.category === 'search_highlight' && op.matchIds?.length) {
        searchIds.push(...op.matchIds);
      } else if (op.category === 'pipeline_stage' && cbs.onPipelineProgress) {
        cbs.onPipelineProgress({ nodeId: op.nodeId, stage: op.meta?.operation, durationMs: op.meta?.duration_ms });
      } else if (op.category === 'grounding_flash' && op.nodeId && cbs.onGroundingFlash) {
        cbs.onGroundingFlash(op.nodeId);
      }
    }

    // If a clear event arrived, fire the callback and skip adding elements
    if (graphCleared && cbs.onGraphCleared) {
      pendingElementsRef.current = [];
      canonicalMapRef.current = {};
      cbs.onGraphCleared();
      return;
    }

    // Coalesce duplicate entity nodes and merge reciprocal edges,
    // preserving interleaved order for progressive drip-feed
    const rawNodes = rawElements.filter(el => el.group === 'nodes');
    const rawEdges = rawElements.filter(el => el.group === 'edges');
    const { nodes: coalescedNodes, edges: coalescedEdges, idRemap } = coalesceElements(
      rawNodes, rawEdges, canonicalMapRef.current
    );

    // Rebuild interleaved order: walk rawElements, emit coalesced version (skip remapped dupes)
    const coalescedNodeIds = new Set(coalescedNodes.map(n => n.data.id));
    const coalescedEdgeIds = new Set(coalescedEdges.map(e => e.data.id));
    const coalescedNodeMap = Object.fromEntries(coalescedNodes.map(n => [n.data.id, n]));
    const coalescedEdgeMap = Object.fromEntries(coalescedEdges.map(e => [e.data.id, e]));
    const emittedIds = new Set();
    const interleavedElements = [];

    for (const raw of rawElements) {
      if (raw.group === 'nodes') {
        // Skip nodes that were remapped (duplicates)
        if (idRemap[raw.data.id]) continue;
        if (coalescedNodeIds.has(raw.data.id) && !emittedIds.has(raw.data.id)) {
          interleavedElements.push(coalescedNodeMap[raw.data.id]);
          emittedIds.add(raw.data.id);
        }
      } else {
        // Edge: find its coalesced version by remapped source/target
        const src = idRemap[raw.data.source] || raw.data.source;
        const tgt = idRemap[raw.data.target] || raw.data.target;
        // Look for the coalesced edge (may have been merged to RELATED_ENTITY)
        for (const ce of coalescedEdges) {
          if (emittedIds.has(ce.data.id)) continue;
          const eSrc = ce.data.source;
          const eTgt = ce.data.target;
          // Match by endpoints (order-independent for merged edges)
          if ((eSrc === src && eTgt === tgt) || (eSrc === tgt && eTgt === src)) {
            interleavedElements.push(ce);
            emittedIds.add(ce.data.id);
            break;
          }
        }
      }
    }
    // Catch any coalesced edges not yet emitted (e.g. merged RELATED_ENTITY from 2 raw edges)
    for (const ce of coalescedEdges) {
      if (!emittedIds.has(ce.data.id)) {
        interleavedElements.push(ce);
        emittedIds.add(ce.data.id);
      }
    }

    // Accumulate for replay after refresh
    pendingElementsRef.current.push(...interleavedElements);

    // Record for offline replay (last-session only, overwritten each ingest)
    const batchKey = batch[0]?.traceId || `batch-${Date.now()}`;
    for (const op of batch) {
      const el = op.category === 'node_added' ? eventToNodeElement(op.meta?.data)
        : op.category === 'edge_added' ? eventToEdgeElement(op.meta?.data)
        : null;
      if (!el) continue;

      const groupKey = op.traceId || batchKey;
      const buf = recordingBufferRef.current;
      if (!buf[groupKey]) {
        buf[groupKey] = { elements: [], label: '', timer: null };
      }
      const rec = buf[groupKey];
      rec.elements.push({ category: op.category, element: el, timestamp: op.timestamp });
      if (!rec.label && op.category === 'node_added' && el.data?.content) {
        rec.label = el.data.content.substring(0, 60);
      }
      if (rec.timer) clearTimeout(rec.timer);
      const capturedKey = groupKey;
      rec.timer = setTimeout(() => {
        const finalRec = buf[capturedKey];
        if (finalRec && finalRec.elements.length > 0) {
          saveRecording({
            traceId: capturedKey,
            label: finalRec.label || `Recording ${new Date().toLocaleTimeString()}`,
            events: finalRec.elements,
          });
        }
        delete buf[capturedKey];
      }, RECORDING_FLUSH_DELAY);
    }

    // Dispatch interleaved elements one at a time to preserve backend order
    if (interleavedElements.length > 0 && cbs.onElementAdded) {
      for (const el of interleavedElements) {
        cbs.onElementAdded(el);
      }
    }
    if (searchIds.length > 0 && cbs.onSearchHighlight) {
      cbs.onSearchHighlight([...new Set(searchIds)]);
    }
  }, [bufferSize]);

  // WebSocket connection
  useEffect(() => {
    // Reset unmounted flag — critical for React StrictMode double-mount cycle
    unmountedRef.current = false;

    if (!enabled) {
      setStatus('disconnected');
      return;
    }

    let ws = null;
    let reconnectTimer = null;
    let reconnectDelay = 1000;
    let unmounted = false;
    let hasConnectedOnce = false;
    let failedAttempts = 0;
    const MAX_RETRIES = 3; // Stop retrying after 3 failures if never connected

    function connect() {
      if (unmounted) return;
      setStatus('connecting');

      try {
        ws = new WebSocket(authenticatedWsUrl);
      } catch {
        setStatus('disconnected');
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        if (unmounted) return;
        setStatus('connected');
        reconnectDelay = 1000;
        failedAttempts = 0;
        if (hasConnectedOnce && callbacksRef.current.onReconnect) {
          callbacksRef.current.onReconnect();
        }
        hasConnectedOnce = true;
      };

      ws.onmessage = (event) => {
        if (unmounted || isPausedRef.current) return;
        try {
          const raw = JSON.parse(event.data);
          const classified = classifyEvent(raw);
          if (!classified) return;

          batchRef.current.push(classified);

          if (!batchTimerRef.current) {
            batchTimerRef.current = setTimeout(() => {
              batchTimerRef.current = null;
              flushBatch();
            }, 200);
          }
        } catch {
          // Malformed message — ignore
        }
      };

      ws.onclose = () => {
        if (unmounted) return;
        setStatus('disconnected');
        failedAttempts++;
        // Give up if service was never reachable (avoids infinite reconnect to dead port)
        if (!hasConnectedOnce && failedAttempts >= MAX_RETRIES) {
          console.debug(`[GraphStream] Insights WS unreachable after ${MAX_RETRIES} attempts, giving up`);
          return;
        }
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after onerror
      };
    }

    function scheduleReconnect() {
      if (unmounted) return;
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        connect();
      }, reconnectDelay);
    }

    connect();

    return () => {
      unmounted = true;
      unmountedRef.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
      if (ws) {
        ws.onclose = null; // prevent reconnect on intentional close
        ws.close();
      }
    };
  }, [authenticatedWsUrl, enabled, flushBatch]);

  const pause = useCallback(() => {
    isPausedRef.current = true;
    setIsPaused(true);
    // Clear any pending batch so it doesn't flush while paused
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    batchRef.current = [];
  }, []);

  const resume = useCallback(() => {
    isPausedRef.current = false;
    setIsPaused(false);
  }, []);

  // Drain accumulated WS graph elements (for replay after refresh wipes the canvas)
  const drainPending = useCallback(() => {
    const elements = pendingElementsRef.current;
    pendingElementsRef.current = [];
    return elements;
  }, []);

  // Clear operations bar (called at the start of a new ingest run)
  const clearOperations = useCallback(() => {
    setOperations([]);
    setOpsPerSecond(0);
    opsTimestampsRef.current = [];
  }, []);

  // Push a synthetic operation into the bar (used by replay to create breadcrumbs)
  const pushOperation = useCallback((op) => {
    setOperations((prev) => {
      const next = [op, ...prev];
      return next.length > bufferSize ? next.slice(0, bufferSize) : next;
    });
  }, [bufferSize]);

  // Reconstruct coalesced graph state at a given operation (for timeline scrubbing)
  const getStateUpTo = useCallback((opId) => {
    const idx = operations.findIndex(o => o.id === opId);
    if (idx === -1) return null;
    // operations is newest-first: slice(idx) gives this event + all older events
    const relevant = operations.slice(idx);
    const nodes = [];
    const edges = [];
    for (const op of relevant) {
      if (op.category === 'node_added') {
        const el = eventToNodeElement(op.meta?.data);
        if (el) nodes.push(el);
      } else if (op.category === 'edge_added') {
        const el = eventToEdgeElement(op.meta?.data);
        if (el) edges.push(el);
      }
    }
    // Fresh coalescing (independent of live canonicalMap — scrubbing is a snapshot)
    const { nodes: cn, edges: ce } = coalesceElements(nodes, edges, {});
    return [...cn, ...ce];
  }, [operations]);

  return { status, operations, opsPerSecond, isPaused, pause, resume, drainPending, clearOperations, pushOperation, getStateUpTo, recordingBufferRef };
}
