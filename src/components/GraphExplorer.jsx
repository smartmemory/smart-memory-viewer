import { useState, useEffect, useCallback, useRef } from 'react';
import CytoscapeCanvas from './CytoscapeCanvas';
import Toolbar from './Toolbar';
import FilterPanel from './FilterPanel';
import DetailPanel from './DetailPanel';
import SearchBar from './SearchBar';
import TimeTravelSlider from './TimeTravelSlider';
import { useGraphData } from '../hooks/useGraphData';
import { useGraphFilters } from '../hooks/useGraphFilters';
import { useCytoscape } from '../hooks/useCytoscape';
import { useGraphStream, coalesceElements } from '../hooks/useGraphStream';
import { useUrlState } from '../hooks/useUrlState';
import { findPath, getNeighbors, getTemporalSnapshot, getAuthToken } from '../lib/api';
import { MEMORY_TYPE_SET } from '../lib/graphColors';
import { getLastRecording } from '../lib/eventStore';
import OperationsBar from './OperationsBar';
import ReplayButton from './ReplayButton';

export default function GraphExplorer({ onLogout }) {
  const { elements, loading, error, stats, refresh, incrementStats } = useGraphData();
  const filters = useGraphFilters(elements);
  const containerRef = useRef(null);
  const cytoscape = useCytoscape(containerRef);
  const { urlState, saveToUrl, getShareableUrl } = useUrlState();

  const [selectedNode, setSelectedNode] = useState(null);
  const [connectedEdges, setConnectedEdges] = useState([]);
  const [layout, setLayout] = useState(urlState.layout || 'cose-bilkent');
  const [filterPanelOpen, setFilterPanelOpen] = useState(true);

  // Track whether user has manually zoomed/panned (disables auto-fit after final layout)
  const userInteractedRef = useRef(false);
  const relayoutTimerRef = useRef(null);

  // Animation speed control (ms between each element). Persisted in localStorage.
  const [dripInterval, setDripInterval] = useState(() => {
    const stored = localStorage.getItem('viewer:dripInterval');
    return stored ? Number(stored) : 200;
  });
  const dripIntervalRef = useRef(dripInterval);
  useEffect(() => {
    dripIntervalRef.current = dripInterval;
    localStorage.setItem('viewer:dripInterval', String(dripInterval));
  }, [dripInterval]);

  const GLOW_DURATION = 2500; // glow fades after 2.5s

  // Entity index counter for radial positioning around memory nodes
  const entityIndexRef = useRef(0);

  // Schedule a single layout after streaming goes quiet (no new elements for 3s).
  // This avoids jarring relayouts during streaming while still organizing the graph.
  const scheduleQuietLayout = useCallback(() => {
    if (relayoutTimerRef.current) clearTimeout(relayoutTimerRef.current);
    relayoutTimerRef.current = setTimeout(() => {
      relayoutTimerRef.current = null;
      cytoscape.runLayout(layout);
      if (!userInteractedRef.current) {
        const cy = cytoscape.cy.current;
        if (cy) cy.fit(cy.elements(':visible'), 50);
      }
    }, 3000);
  }, [cytoscape.runLayout, cytoscape.cy, layout]);

  // Position a node intelligently during streaming (no full layout needed).
  // Memory nodes: near center. Entity nodes: radially around their parent memory.
  const positionStreamedNode = useCallback((cy, el) => {
    if (el.group !== 'nodes') return;
    const node = cy.getElementById(el.data.id);
    if (!node.length) return;

    const parentId = el.data.parentId;
    if (parentId) {
      // Entity: position radially around the parent memory node
      const parent = cy.getElementById(parentId);
      if (parent.length) {
        const pos = parent.position();
        const idx = entityIndexRef.current++;
        const angle = (idx * 2.4); // golden angle in radians for even spread
        const radius = 120 + (idx > 6 ? 60 : 0); // second ring after 6 entities
        node.position({
          x: pos.x + radius * Math.cos(angle),
          y: pos.y + radius * Math.sin(angle),
        });
      }
    } else {
      // Memory node: place near center, offset by existing memory count
      const memoryNodes = cy.nodes().filter(n => n.data('category') === 'memory');
      const count = memoryNodes.length;
      const cx = cy.width() / 2;
      const cy2 = cy.height() / 2;
      node.position({ x: cx + (count - 1) * 200, y: cy2 });
      entityIndexRef.current = 0; // reset entity counter for this new memory
    }
  }, []);

  // Drip-feed queue: elements are queued and played one at a time in backend order.
  // No relayout during streaming — nodes are positioned relative to their parent.
  // One final layout runs after streaming goes quiet.
  const dripTimersRef = useRef([]);
  const dripQueueRef = useRef([]);

  const processNextDrip = useCallback(() => {
    const queue = dripQueueRef.current;
    if (queue.length === 0) {
      // Queue drained — schedule final layout after quiet period
      scheduleQuietLayout();
      return;
    }
    const el = queue.shift();
    const cy = cytoscape.cy.current;
    if (!cy) return;
    // Skip duplicates
    if (cy.getElementById(el.data.id).length > 0) {
      const timer = setTimeout(processNextDrip, 50);
      dripTimersRef.current.push(timer);
      return;
    }
    // Register with filter panel as this element hits the canvas
    filters.registerStreamedElements([el]);
    try {
      const added = cy.add(el);
      added.addClass('streaming-new');
      // Position node (no-op for edges)
      positionStreamedNode(cy, el);
      // Update stats
      if (el.group === 'nodes') incrementStats([el], 0);
      else incrementStats(0, 1);
      // Fade glow
      setTimeout(() => { if (added.inside()) added.removeClass('streaming-new'); }, GLOW_DURATION);
    } catch {
      // Edge endpoint missing — skip
    }
    // Auto-fit to keep everything visible (no relayout, just viewport adjustment)
    if (!userInteractedRef.current && el.group === 'nodes') {
      cy.fit(cy.elements(':visible'), 50);
    }
    // Schedule next element
    if (queue.length > 0) {
      const timer = setTimeout(processNextDrip, dripIntervalRef.current);
      dripTimersRef.current.push(timer);
    } else {
      // Queue drained — schedule final layout
      scheduleQuietLayout();
    }
  }, [cytoscape.cy, filters.registerStreamedElements, incrementStats, positionStreamedNode, scheduleQuietLayout]);

  // Live event stream from Insights WebSocket (pass JWT for auth)
  const wsToken = getAuthToken();
  const stream = useGraphStream({
    token: wsToken,
    onElementAdded: (el) => {
      const wasEmpty = dripQueueRef.current.length === 0;
      dripQueueRef.current.push(el);
      // Start processing if queue was empty (otherwise it's already draining)
      if (wasEmpty) {
        // Cancel any pending quiet layout — new elements arriving
        if (relayoutTimerRef.current) {
          clearTimeout(relayoutTimerRef.current);
          relayoutTimerRef.current = null;
        }
        const timer = setTimeout(processNextDrip, dripIntervalRef.current);
        dripTimersRef.current.push(timer);
      }
    },
    onSearchHighlight: (ids) => cytoscape.highlightElements(ids),
    onGroundingFlash: (nodeId) => {
      const cy = cytoscape.cy;
      if (!cy) return;
      const node = cy.getElementById(nodeId);
      if (node && node.length) {
        node.addClass('grounding-flash');
        setTimeout(() => node.removeClass('grounding-flash'), 2500);
      }
    },
    onGraphCleared: () => {
      dripTimersRef.current.forEach(clearTimeout);
      dripTimersRef.current = [];
      dripQueueRef.current = [];
      entityIndexRef.current = 0;
      userInteractedRef.current = false;
      if (relayoutTimerRef.current) { clearTimeout(relayoutTimerRef.current); relayoutTimerRef.current = null; }
      stream.clearOperations();
      refresh();
    },
    onReconnect: () => refresh(),
  });

  // Replay the last recording through the same interleaved drip-feed pipeline
  const [isReplaying, setIsReplaying] = useState(false);
  const replayRecording = useCallback(async (recording) => {
    if (!recording?.events?.length) return;
    // Clear canvas and drip queue for replay
    dripTimersRef.current.forEach(clearTimeout);
    dripTimersRef.current = [];
    dripQueueRef.current = [];
    entityIndexRef.current = 0;
    cytoscape.setElements([]);
    userInteractedRef.current = false;
    stream.clearOperations();
    setIsReplaying(true);

    // Coalesce but preserve interleaved order (same as live streaming)
    const rawNodes = recording.events.filter(e => e.category === 'node_added').map(e => e.element);
    const rawEdges = recording.events.filter(e => e.category === 'edge_added').map(e => e.element);
    const { nodes: coalescedNodes, edges: coalescedEdges, idRemap } = coalesceElements(rawNodes, rawEdges, {});

    // Rebuild interleaved order from the original recording sequence
    const coalescedNodeMap = Object.fromEntries(coalescedNodes.map(n => [n.data.id, n]));
    const emittedIds = new Set();
    const allItems = [];

    for (const evt of recording.events) {
      const el = evt.element;
      if (!el) continue;
      if (el.group === 'nodes') {
        if (idRemap[el.data.id]) continue; // duplicate
        if (coalescedNodeMap[el.data.id] && !emittedIds.has(el.data.id)) {
          allItems.push(coalescedNodeMap[el.data.id]);
          emittedIds.add(el.data.id);
        }
      } else {
        const src = idRemap[el.data.source] || el.data.source;
        const tgt = idRemap[el.data.target] || el.data.target;
        for (const ce of coalescedEdges) {
          if (emittedIds.has(ce.data.id)) continue;
          if ((ce.data.source === src && ce.data.target === tgt) || (ce.data.source === tgt && ce.data.target === src)) {
            allItems.push(ce);
            emittedIds.add(ce.data.id);
            break;
          }
        }
      }
    }
    // Catch remaining coalesced edges
    for (const ce of coalescedEdges) {
      if (!emittedIds.has(ce.data.id)) { allItems.push(ce); emittedIds.add(ce.data.id); }
    }

    if (allItems.length === 0) {
      setIsReplaying(false);
      return;
    }

    allItems.forEach((el, i) => {
      const timer = setTimeout(() => {
        const cy = cytoscape.cy.current;
        if (!cy) return;
        if (cy.getElementById(el.data.id).length > 0) return;
        // Progressive filter registration (same as live)
        filters.registerStreamedElements([el]);
        try {
          const added = cy.add(el);
          added.addClass('streaming-new');
          positionStreamedNode(cy, el);
          if (el.group === 'nodes') incrementStats([el], 0);
          else incrementStats(0, 1);
          setTimeout(() => { if (added.inside()) added.removeClass('streaming-new'); }, GLOW_DURATION);
          // Push breadcrumb into operations bar for timeline scrubbing
          const category = el.group === 'nodes' ? 'node_added' : 'edge_added';
          const label = el.group === 'nodes'
            ? `Node "${el.data.label || el.data.id}"`
            : `Edge "${el.data.label || el.data.type || 'link'}"`;
          stream.pushOperation({
            id: `replay-${i}-${el.data.id}`,
            timestamp: new Date().toISOString(),
            category,
            label,
            nodeId: el.group === 'nodes' ? el.data.id : el.data.source,
            meta: { data: el.data },
          });
        } catch {
          // Edge endpoint missing — skip silently
        }
        // Auto-fit viewport (no relayout)
        if (!userInteractedRef.current && el.group === 'nodes') {
          cy.fit(cy.elements(':visible'), 50);
        }
        // End replay indicator after last item
        if (i === allItems.length - 1) {
          scheduleQuietLayout();
          setTimeout(() => setIsReplaying(false), GLOW_DURATION);
        }
      }, i * dripIntervalRef.current);
      dripTimersRef.current.push(timer);
    });
  }, [cytoscape.cy, cytoscape.setElements, incrementStats, positionStreamedNode, scheduleQuietLayout, filters.registerStreamedElements, stream.clearOperations, stream.pushOperation]);

  // Cleanup drip-feed and relayout timers on unmount
  useEffect(() => () => {
    dripTimersRef.current.forEach(clearTimeout);
    if (relayoutTimerRef.current) clearTimeout(relayoutTimerRef.current);
  }, []);

  // Detect manual zoom/pan — marks userInteractedRef so auto-relayout stops
  useEffect(() => {
    const cy = cytoscape.cy.current;
    if (!cy) return;
    const markInteracted = () => { userInteractedRef.current = true; };
    cy.on('scrollzoom', markInteracted);
    cy.on('dragpan', markInteracted);
    return () => {
      cy.off('scrollzoom', markInteracted);
      cy.off('dragpan', markInteracted);
    };
  }, [cytoscape.cy, cytoscape.ready]);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [pathMode, setPathMode] = useState(false);
  const [pathNodes, setPathNodes] = useState([]);
  const [pathResult, setPathResult] = useState(null);
  const [expanding, setExpanding] = useState(false);
  const [timeTravelOpen, setTimeTravelOpen] = useState(!!urlState.asOfTime);
  const [asOfTime, setAsOfTime] = useState(urlState.asOfTime || null);
  const [timeTravelLoading, setTimeTravelLoading] = useState(false);

  // Load elements into Cytoscape when data arrives or cy becomes ready.
  // Includes a retry fallback: if Cytoscape ends up empty despite having data,
  // re-apply after a short delay (guards against React StrictMode / mount races).
  useEffect(() => {
    if (!cytoscape.ready) return;
    if (elements.length > 0) {
      cytoscape.setElements(elements);
      cytoscape.runLayout(layout);
      // Replay any WS events that arrived during the API fetch (deduped by addElements)
      const pending = stream.drainPending();
      if (pending.length > 0) {
        cytoscape.addElements(pending);
      }
      // Safety net: if cy is empty after setElements, retry once after a tick
      const retryTimer = setTimeout(() => {
        const cy = cytoscape.cy.current;
        if (cy && cy.nodes().length === 0 && elements.length > 0) {
          console.debug('[GraphExplorer] Retry: cy was empty after setElements, re-applying');
          cytoscape.setElements(elements);
          cytoscape.runLayout(layout);
        }
      }, 300);
      return () => clearTimeout(retryTimer);
    } else if (!loading) {
      // Clear canvas when server returns empty (e.g. after clear_all)
      cytoscape.setElements([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, cytoscape.ready, loading, cytoscape.setElements, cytoscape.runLayout]);

  // Apply filters whenever they change
  useEffect(() => {
    cytoscape.applyFilter(filters.visibleNodeIds, filters.activeEdgeTypes, filters.cascadeEdgeFilter);
  }, [filters.visibleNodeIds, filters.activeEdgeTypes, filters.cascadeEdgeFilter, cytoscape.applyFilter]);

  // Single click: select node + highlight neighbors (no panel)
  const handleNodeClick = useCallback((nodeData) => {
    setSelectedNode(nodeData);
    cytoscape.selectNode(nodeData.id);
    setConnectedEdges(cytoscape.getConnectedEdges(nodeData.id));

    // Path mode: collect nodes for path finding
    if (pathMode) {
      setPathNodes((prev) => {
        const next = [...prev, nodeData.id];
        if (next.length === 2) {
          findPath(next[0], next[1]).then((result) => {
            setPathResult(result);
            if (result?.path) {
              const nodeIds = result.path.map((n) => n.item_id || n.id);
              cytoscape.highlightElements(nodeIds);
            }
          }).catch(() => setPathResult({ error: 'Path not found' }));
          setPathMode(false);
          return [];
        }
        return next;
      });
    }
  }, [pathMode, cytoscape.selectNode, cytoscape.highlightElements, cytoscape.getConnectedEdges]);

  // Double-click: open overlay detail panel
  const handleNodeDblClick = useCallback((nodeData) => {
    setSelectedNode(nodeData);
    setDetailPanelOpen(true);
    cytoscape.selectNode(nodeData.id);
    setConnectedEdges(cytoscape.getConnectedEdges(nodeData.id));
  }, [cytoscape.selectNode, cytoscape.getConnectedEdges]);

  // Update a node's data in Cytoscape graph + local state after entity correction
  const handleNodeUpdate = useCallback((nodeId, updates) => {
    // Update Cytoscape node data in-place
    const cy = cytoscape.cy?.current;
    if (cy) {
      const cyNode = cy.$id(nodeId);
      if (cyNode.length) {
        if (updates.label) cyNode.data('label', updates.label);
        if (updates.type) cyNode.data('type', updates.type);
        if (updates.entity_type) cyNode.data('entity_type', updates.entity_type);
      }
    }
    // Update React state so DetailPanel re-renders
    setSelectedNode((prev) => prev ? { ...prev, ...updates } : prev);
  }, [cytoscape.cy]);

  // Wire event handlers into Cytoscape (via ref, not re-registration)
  useEffect(() => {
    cytoscape.setOnNodeClick(handleNodeClick);
  }, [handleNodeClick, cytoscape.setOnNodeClick]);

  useEffect(() => {
    cytoscape.setOnNodeDblClick(handleNodeDblClick);
  }, [handleNodeDblClick, cytoscape.setOnNodeDblClick]);

  // Expand neighbors — fetch from API and add to graph
  const handleExpand = useCallback(async (nodeId) => {
    setExpanding(true);
    try {
      const res = await getNeighbors(nodeId);
      // API returns { neighbors: [...], item_id: "..." }
      const neighbors = res?.neighbors || [];
      if (!Array.isArray(neighbors) || neighbors.length === 0) return;

      const newElements = [];

      for (const item of neighbors) {
        const id = item.item_id;
        if (!id) continue;
        const type = item.memory_type || 'semantic';
        const label = item.content?.substring(0, 40) || id.substring(0, 12);
        const category = MEMORY_TYPE_SET.has(type) ? 'memory' : 'entity';

        newElements.push({
          group: 'nodes',
          data: {
            id,
            label,
            type,
            category,
            content: item.content || '',
          },
        });

        // Add edge — link_type comes from the API response
        const edgeType = item.link_type || 'RELATES_TO';
        newElements.push({
          group: 'edges',
          data: {
            id: `${nodeId}-${id}:${edgeType}`,
            source: nodeId,
            target: id,
            label: edgeType,
            type: edgeType,
          },
        });
      }

      cytoscape.addElements(newElements);

      // Position new nodes radially around the expanded node
      const cy = cytoscape.cy.current;
      if (cy) {
        const origin = cy.getElementById(nodeId);
        if (origin.length) {
          const pos = origin.position();
          const newNodeIds = neighbors.map((n) => n.item_id).filter(Boolean);
          const count = newNodeIds.length || 1;
          const angle = (2 * Math.PI) / count;
          newNodeIds.forEach((nid, i) => {
            const node = cy.getElementById(nid);
            if (node.length) {
              // Only position if node doesn't already have a meaningful position
              const nodePos = node.position();
              if (nodePos.x === 0 && nodePos.y === 0) {
                node.position({
                  x: pos.x + 120 * Math.cos(angle * i),
                  y: pos.y + 120 * Math.sin(angle * i),
                });
              }
            }
          });
        }
      }

      // Update connected edges display
      setConnectedEdges(cytoscape.getConnectedEdges(nodeId));
    } catch (err) {
      console.error('Failed to expand neighbors:', err);
    } finally {
      setExpanding(false);
    }
  }, [cytoscape.addElements, cytoscape.cy, cytoscape.getConnectedEdges]);

  // Refresh — clear pending WS buffer before fetching so replay is clean
  const handleRefresh = useCallback(() => {
    userInteractedRef.current = false;
    stream.drainPending();
    refresh();
  }, [refresh, stream]);

  // Handle layout change
  const handleLayoutChange = useCallback((newLayout) => {
    setLayout(newLayout);
    cytoscape.runLayout(newLayout);
  }, [cytoscape.runLayout]);

  // Handle search highlight
  const handleSearch = useCallback((matchingIds) => {
    if (matchingIds.length > 0) {
      cytoscape.highlightElements(matchingIds);
    } else {
      cytoscape.clearHighlights();
    }
  }, [cytoscape.highlightElements, cytoscape.clearHighlights]);

  // Toggle path mode
  const handlePathMode = useCallback(() => {
    setPathMode((prev) => !prev);
    setPathNodes([]);
    setPathResult(null);
    cytoscape.clearHighlights();
  }, [cytoscape.clearHighlights]);

  // LOD clustering — apply when node count exceeds threshold after elements load
  useEffect(() => {
    if (elements.length > 200) {
      cytoscape.applyClustering();
    } else {
      cytoscape.removeClustering();
    }
  }, [elements.length, cytoscape.applyClustering, cytoscape.removeClustering]);

  // Time travel — fetch temporal snapshot and replace graph
  const handleTimeTravel = useCallback(async (isoTimestamp) => {
    if (!isoTimestamp) {
      // "Live" — reload current graph
      handleRefresh();
      setAsOfTime(null);
      return;
    }
    setTimeTravelLoading(true);
    setAsOfTime(isoTimestamp);
    try {
      const res = await getTemporalSnapshot(isoTimestamp);
      // Backend temporal.py returns { state: [...], count: N, timestamp: "..." }
      const items = res?.state || res?.items || res?.memories || [];
      if (Array.isArray(items) && items.length > 0) {
        // Re-use the same transform logic from useGraphData by rebuilding elements
        // For simplicity: build nodes only (edges are harder without a bulk call)
        const newElements = items.map((item) => ({
          group: 'nodes',
          data: {
            id: item.item_id || item.id,
            label: item.title || item.content?.substring(0, 40) || (item.item_id || item.id).substring(0, 12),
            type: item.memory_type || 'semantic',
            category: 'memory',
            content: item.content || '',
            confidence: item.confidence,
            created_at: item.created_at,
            updated_at: item.updated_at,
            metadata: item.metadata || {},
          },
        }));
        cytoscape.setElements(newElements);
        cytoscape.runLayout(layout);
      }
    } catch (err) {
      console.error('Time travel failed:', err);
    } finally {
      setTimeTravelLoading(false);
    }
  }, [handleRefresh, cytoscape.setElements, cytoscape.runLayout, layout]);

  // Copy shareable link to clipboard
  const handleCopyLink = useCallback(() => {
    const cy = cytoscape.cy.current;
    const state = {
      layout,
      selected: selectedNode?.id || null,
      filters: [...filters.activeMemoryTypes, ...filters.activeEntityTypes],
      zoom: cy?.zoom() || 1,
      pan: cy?.pan() || { x: 0, y: 0 },
      asOfTime,
    };
    const url = getShareableUrl(state);
    saveToUrl(state);
    navigator.clipboard.writeText(url).catch(() => {
      // Fallback for non-HTTPS contexts
      console.warn('Clipboard write failed — URL saved to address bar');
    });
  }, [layout, selectedNode, filters.activeMemoryTypes, filters.activeEntityTypes, asOfTime, cytoscape.cy, getShareableUrl, saveToUrl]);

  // Restore URL state on initial load (select node, zoom, pan, time-travel)
  const urlRestoredRef = useRef(false);
  useEffect(() => {
    if (urlRestoredRef.current) return;
    if (elements.length === 0 && !urlState.asOfTime) return;
    urlRestoredRef.current = true;

    // Restore time-travel (fetch temporal snapshot)
    if (urlState.asOfTime) {
      handleTimeTravel(urlState.asOfTime);
      return; // Time-travel replaces the graph — skip zoom/pan/select until it loads
    }

    const cy = cytoscape.cy.current;
    if (!cy || cy.nodes().length === 0) return;

    // Restore zoom/pan
    if (urlState.zoom) cy.zoom(urlState.zoom);
    if (urlState.pan) cy.pan(urlState.pan);

    // Restore selected node
    if (urlState.selected) {
      const node = cy.getElementById(urlState.selected);
      if (node.length) {
        handleNodeClick(node.data());
        cy.animate({ center: { eles: node }, duration: 300 });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements]); // Run once when elements first arrive

  if (error && elements.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-center max-w-md">
          <div className="text-red-400 text-4xl mb-4">!</div>
          <p className="text-red-300 font-medium mb-2">Failed to load graph</p>
          <p className="text-slate-400 text-sm mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-900 overflow-hidden">
      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/80 pointer-events-none">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
            <p className="text-slate-400">Loading knowledge graph...</p>
          </div>
        </div>
      )}
      <Toolbar
        layout={layout}
        onLayoutChange={handleLayoutChange}
        onZoomIn={cytoscape.zoomIn}
        onZoomOut={cytoscape.zoomOut}
        onFitToScreen={cytoscape.fitToScreen}
        onRefresh={handleRefresh}
        onToggleFilters={() => setFilterPanelOpen((p) => !p)}
        onPathMode={handlePathMode}
        pathMode={pathMode}
        stats={stats}
        cy={cytoscape.cy}
        onLogout={onLogout}
        onCopyLink={handleCopyLink}
        onToggleTimeTravelSlider={() => setTimeTravelOpen((p) => !p)}
        timeTravelActive={timeTravelOpen || !!asOfTime}
        autoFit={cytoscape.autoFit}
        onAutoFitChange={cytoscape.setAutoFit}
      />

      <div className="flex-1 flex overflow-hidden relative">
        {filterPanelOpen && (
          <FilterPanel
            filters={filters}
            onClose={() => setFilterPanelOpen(false)}
          />
        )}

        <CytoscapeCanvas
          setContainerRef={cytoscape.setContainerRef}
        />

        {/* Detail panel — absolute overlay (no container resize) */}
        {detailPanelOpen && selectedNode && (
          <div className="absolute right-0 top-0 bottom-0 z-30">
            <DetailPanel
              node={selectedNode}
              edges={connectedEdges}
              onClose={() => {
                setDetailPanelOpen(false);
                setSelectedNode(null);
                setConnectedEdges([]);
              }}
              onExpand={handleExpand}
              expanding={expanding}
              onNodeUpdate={handleNodeUpdate}
            />
          </div>
        )}
      </div>

      {timeTravelOpen && (
        <TimeTravelSlider
          onTimeChange={handleTimeTravel}
          onClose={() => {
            setTimeTravelOpen(false);
            if (asOfTime) {
              setAsOfTime(null);
              handleRefresh();
            }
          }}
        />
      )}

      {timeTravelLoading && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-purple-900/90 border border-purple-600 text-purple-200 px-4 py-2 rounded-lg text-sm z-50 flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          Loading temporal snapshot...
        </div>
      )}

      {asOfTime && !timeTravelLoading && (
        <div className="absolute top-16 right-4 bg-purple-900/80 border border-purple-600 text-purple-200 px-3 py-1.5 rounded-lg text-xs z-50">
          Viewing: {new Date(asOfTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>
      )}

      {/* Replay controls */}
      {isReplaying && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 bg-cyan-900/90 border border-cyan-700 text-cyan-200 px-4 py-1.5 rounded-full text-xs font-medium flex items-center gap-2">
          <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
          Replaying recording...
          <button
            onClick={() => {
              dripTimersRef.current.forEach(clearTimeout);
              dripTimersRef.current = [];
              setIsReplaying(false);
            }}
            className="ml-2 text-cyan-400 hover:text-cyan-200"
          >
            Stop
          </button>
        </div>
      )}
      <ReplayButton onReplay={replayRecording} disabled={isReplaying} />

      <OperationsBar
        status={stream.status}
        operations={stream.operations}
        opsPerSecond={stream.opsPerSecond}
        isPaused={stream.isPaused}
        onPause={stream.pause}
        onResume={stream.resume}
        dripInterval={dripInterval}
        onDripIntervalChange={setDripInterval}
        onOperationClick={(op) => {
          const cy = cytoscape.cy.current;
          if (!cy) return;

          // Graph events: scrub to that point in time (show state up to this event, no animation)
          if (op.category === 'node_added' || op.category === 'edge_added' || op.category === 'graph_cleared') {
            // Stop any ongoing drip-feed
            dripTimersRef.current.forEach(clearTimeout);
            dripTimersRef.current = [];

            if (op.category === 'graph_cleared') {
              cytoscape.setElements(elements);
            } else {
              const streamEls = stream.getStateUpTo(op.id);
              if (streamEls) {
                const baseIds = new Set(elements.map(e => e.data.id));
                const newEls = streamEls.filter(e => !baseIds.has(e.data.id));
                cytoscape.setElements([...elements, ...newEls]);
              }
            }
            cytoscape.runLayout(layout);
            stream.pause();
          }

          // Highlight affected nodes
          const ids = [];
          if (op.nodeId) ids.push(op.nodeId);
          if (op.matchIds?.length) ids.push(...op.matchIds);
          if (ids.length === 0) return;

          setTimeout(() => {
            cytoscape.highlightElements(ids);
            const primary = cy.getElementById(ids[0]);
            if (primary.length) {
              handleNodeClick(primary.data());
              cy.animate({ center: { eles: primary }, duration: 300 });
            }
          }, 50);
        }}
      />

      <SearchBar
        elements={elements}
        onSearch={handleSearch}
        onNodeSelect={(id) => {
          const cy = cytoscape.cy.current;
          if (cy) {
            const node = cy.getElementById(id);
            if (node.length) {
              handleNodeClick(node.data());
              cy.animate({ center: { eles: node }, duration: 300 });
            }
          }
        }}
      />

      {pathMode && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-amber-900/90 border border-amber-600 text-amber-200 px-4 py-2 rounded-lg text-sm z-50">
          {pathNodes.length === 0 ? 'Click the START node' : 'Click the END node'}
          <button onClick={handlePathMode} className="ml-3 text-amber-400 hover:text-amber-300 underline">Cancel</button>
        </div>
      )}

      {pathResult?.error && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-red-900/90 border border-red-600 text-red-200 px-4 py-2 rounded-lg text-sm z-50">
          {pathResult.error}
          <button onClick={() => setPathResult(null)} className="ml-3 text-red-400 hover:text-red-300 underline">Dismiss</button>
        </div>
      )}
    </div>
  );
}
