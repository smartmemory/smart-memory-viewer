import { useState, useEffect, useCallback, useRef } from 'react';
import CytoscapeCanvas from './CytoscapeCanvas';
import Toolbar from './Toolbar';
import FilterPanel from './FilterPanel';
import DetailPanel from './DetailPanel';
import SearchBar from './SearchBar';
import { useGraphData } from '../hooks/useGraphData';
import { useGraphFilters } from '../hooks/useGraphFilters';
import { useCytoscape } from '../hooks/useCytoscape';
import { findPath, getNeighbors } from '../lib/api';

const MEMORY_TYPES = new Set(['semantic', 'episodic', 'procedural', 'working', 'zettel', 'decision', 'reasoning', 'opinion', 'observation']);

export default function GraphExplorer({ onLogout }) {
  const containerRef = useRef(null);
  const { elements, loading, error, stats, refresh } = useGraphData();
  const filters = useGraphFilters(elements);
  const cytoscape = useCytoscape(containerRef);

  const [selectedNode, setSelectedNode] = useState(null);
  const [connectedEdges, setConnectedEdges] = useState([]);
  const [layout, setLayout] = useState('cose-bilkent');
  const [filterPanelOpen, setFilterPanelOpen] = useState(true);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [pathMode, setPathMode] = useState(false);
  const [pathNodes, setPathNodes] = useState([]);
  const [pathResult, setPathResult] = useState(null);
  const [expanding, setExpanding] = useState(false);

  // Load elements into Cytoscape when data arrives
  // layout is intentionally excluded — layout changes are handled by handleLayoutChange
  useEffect(() => {
    if (elements.length > 0) {
      cytoscape.setElements(elements);
      cytoscape.runLayout(layout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, cytoscape.setElements, cytoscape.runLayout]);

  // Apply filters whenever they change
  useEffect(() => {
    cytoscape.applyFilter(filters.visibleNodeIds);
  }, [filters.visibleNodeIds, cytoscape.applyFilter]);

  // Handle node click from Cytoscape
  const handleNodeClick = useCallback((nodeData) => {
    setSelectedNode(nodeData);
    setDetailPanelOpen(true);
    cytoscape.selectNode(nodeData.id);
    setConnectedEdges(cytoscape.getConnectedEdges(nodeData.id));

    // Path mode: collect nodes for path finding
    if (pathMode) {
      setPathNodes((prev) => {
        const next = [...prev, nodeData.id];
        if (next.length === 2) {
          // Find path between two nodes
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
        const category = MEMORY_TYPES.has(type) ? 'memory' : 'entity';

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-slate-400">Loading knowledge graph...</p>
          <p className="text-slate-500 text-sm mt-2">Fetching nodes and relationships</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-center max-w-md">
          <div className="text-red-400 text-4xl mb-4">!</div>
          <p className="text-red-300 font-medium mb-2">Failed to load graph</p>
          <p className="text-slate-400 text-sm mb-4">{error}</p>
          <button
            onClick={refresh}
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
      <Toolbar
        layout={layout}
        onLayoutChange={handleLayoutChange}
        onZoomIn={cytoscape.zoomIn}
        onZoomOut={cytoscape.zoomOut}
        onFitToScreen={cytoscape.fitToScreen}
        onRefresh={refresh}
        onToggleFilters={() => setFilterPanelOpen((p) => !p)}
        onPathMode={handlePathMode}
        pathMode={pathMode}
        pathNodes={pathNodes}
        stats={stats}
        cy={cytoscape.cy}
        onLogout={onLogout}
      />

      <div className="flex-1 flex overflow-hidden relative">
        {filterPanelOpen && (
          <FilterPanel
            filters={filters}
            onClose={() => setFilterPanelOpen(false)}
          />
        )}

        <CytoscapeCanvas
          containerRef={containerRef}
          onNodeClick={handleNodeClick}
          cy={cytoscape.cy}
        />

        {detailPanelOpen && selectedNode && (
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
          />
        )}
      </div>

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
