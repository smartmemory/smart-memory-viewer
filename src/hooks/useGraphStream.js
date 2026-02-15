import { useState, useEffect, useRef, useCallback } from 'react';
import { MEMORY_TYPE_SET } from '../lib/graphColors';

const DEFAULT_WS_URL = import.meta.env.VITE_INSIGHTS_WS_URL
  || (import.meta.env.DEV ? 'ws://localhost:9002/events' : 'wss://insights.smartmemory.ai/events');

/**
 * Classify a raw WebSocket event into a graph-relevant operation.
 * Returns null for events that should be ignored.
 */
export function classifyEvent(raw) {
  if (!raw || raw.type !== 'new_event') return null;

  const { component, operation, name, data, trace_id } = raw;
  const memoryId = data?.memory_id || data?.item_id || null;
  const base = { id: raw.event_id, timestamp: raw.timestamp || new Date().toISOString(), traceId: trace_id, meta: raw };

  // Graph mutations
  if (component === 'graph') {
    if (operation === 'add_node' || operation === 'add_nodes_bulk') {
      return { ...base, category: 'node_added', label: `Node "${data?.label || memoryId || 'unknown'}" added`, nodeId: memoryId };
    }
    if (operation === 'add_edge' || operation === 'add_edges_bulk') {
      const src = data?.source_id || data?.source || '';
      const tgt = data?.target_id || data?.target || '';
      const edgeId = data?.edge_id || (src && tgt ? `${src}->${tgt}` : null);
      return { ...base, category: 'edge_added', label: `Edge "${data?.edge_type || 'RELATES_TO'}"`, nodeId: src || null, edgeId };
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
    const resultCount = data?.result_count || data?.top_k || 0;
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
  const id = data.memory_id || data.item_id || data.node_id;
  if (!id) return null;
  const type = data.memory_type || data.type || 'semantic';
  const label = data.label || data.title || data.content?.substring(0, 40) || id.substring(0, 12);
  const category = MEMORY_TYPE_SET.has(type) ? 'memory' : 'entity';
  return { group: 'nodes', data: { id, label, type, category, content: data.content || '' } };
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
  return {
    group: 'edges',
    data: { id: `${src}->${tgt}:${edgeType}`, source: src, target: tgt, label: edgeType, type: edgeType },
  };
}

/**
 * React hook for real-time graph event streaming via Insights WebSocket.
 *
 * @param {Object} options
 * @param {string} [options.wsUrl] - WebSocket URL (default: Insights at :9002/events)
 * @param {boolean} [options.enabled=true] - Toggle connection
 * @param {number} [options.bufferSize=100] - Ring buffer capacity
 * @param {Function} [options.onNodeAdded] - Callback with array of Cytoscape node elements (batched)
 * @param {Function} [options.onEdgeAdded] - Callback with array of Cytoscape edge elements (batched)
 * @param {Function} [options.onSearchHighlight] - Callback with array of matching node IDs
 * @param {Function} [options.onPipelineProgress] - Callback with { nodeId, stage, durationMs }
 */
export function useGraphStream(options = {}) {
  const {
    wsUrl = DEFAULT_WS_URL,
    enabled = true,
    bufferSize = 100,
    onNodeAdded,
    onEdgeAdded,
    onSearchHighlight,
    onPipelineProgress,
  } = options;

  const [status, setStatus] = useState('disconnected');
  const [operations, setOperations] = useState([]);
  const [opsPerSecond, setOpsPerSecond] = useState(0);
  const isPausedRef = useRef(false);
  const [isPaused, setIsPaused] = useState(false);

  // Refs for callbacks (avoid stale closures)
  const callbacksRef = useRef({ onNodeAdded, onEdgeAdded, onSearchHighlight, onPipelineProgress });
  callbacksRef.current = { onNodeAdded, onEdgeAdded, onSearchHighlight, onPipelineProgress };

  // Batch window: collect events, flush every 200ms
  const batchRef = useRef([]);
  const batchTimerRef = useRef(null);
  const opsTimestampsRef = useRef([]); // timestamps for ops/sec calculation
  const unmountedRef = useRef(false);

  const flushBatch = useCallback(() => {
    if (unmountedRef.current) return; // guard against post-unmount flush
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
    const nodesToAdd = [];
    const edgesToAdd = [];
    const searchIds = [];

    for (const op of batch) {
      if (op.category === 'node_added') {
        const el = eventToNodeElement(op.meta?.data);
        if (el) nodesToAdd.push(el);
      } else if (op.category === 'edge_added') {
        const el = eventToEdgeElement(op.meta?.data);
        if (el) edgesToAdd.push(el);
      } else if (op.category === 'search_highlight' && op.matchIds?.length) {
        searchIds.push(...op.matchIds);
      } else if (op.category === 'pipeline_stage' && cbs.onPipelineProgress) {
        cbs.onPipelineProgress({ nodeId: op.nodeId, stage: op.meta?.operation, durationMs: op.meta?.duration_ms });
      }
    }

    // Call addElements once per batch — not per element
    if (nodesToAdd.length > 0 && cbs.onNodeAdded) {
      cbs.onNodeAdded(nodesToAdd);
    }
    if (edgesToAdd.length > 0 && cbs.onEdgeAdded) {
      cbs.onEdgeAdded(edgesToAdd);
    }
    if (searchIds.length > 0 && cbs.onSearchHighlight) {
      cbs.onSearchHighlight([...new Set(searchIds)]);
    }
  }, [bufferSize]);

  // WebSocket connection
  useEffect(() => {
    if (!enabled) {
      setStatus('disconnected');
      return;
    }

    let ws = null;
    let reconnectTimer = null;
    let reconnectDelay = 1000;
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      setStatus('connecting');

      try {
        ws = new WebSocket(wsUrl);
      } catch {
        setStatus('disconnected');
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        if (unmounted) return;
        setStatus('connected');
        reconnectDelay = 1000; // reset backoff
      };

      ws.onmessage = (event) => {
        if (unmounted || isPausedRef.current) return;
        try {
          const raw = JSON.parse(event.data);
          const classified = classifyEvent(raw);
          if (!classified) return;

          batchRef.current.push(classified);

          // Start batch timer if not running
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
  }, [wsUrl, enabled, flushBatch]);

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

  return { status, operations, opsPerSecond, isPaused, pause, resume };
}
