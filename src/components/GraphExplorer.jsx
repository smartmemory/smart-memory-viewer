import { useState, useEffect, useCallback, useRef } from 'react';
import CytoscapeCanvas from './CytoscapeCanvas';
import Toolbar from './Toolbar';
import FilterPanel from './FilterPanel';
import DetailPanel from './DetailPanel';
import SearchBar from './SearchBar';
import { useGraphData } from '../hooks/useGraphData';
import { useGraphFilters } from '../hooks/useGraphFilters';
import { useCytoscape } from '../hooks/useCytoscape';
import { findPath } from '../lib/api';

export default function GraphExplorer() {
  const containerRef = useRef(null);
  const { elements, loading, error, stats, refresh } = useGraphData();
  const filters = useGraphFilters(elements);
  const cytoscape = useCytoscape(containerRef);

  const [selectedNode, setSelectedNode] = useState(null);
  const [layout, setLayout] = useState('cose-bilkent');
  const [filterPanelOpen, setFilterPanelOpen] = useState(true);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [pathMode, setPathMode] = useState(false);
  const [pathNodes, setPathNodes] = useState([]);
  const [pathResult, setPathResult] = useState(null);

  // Load elements into Cytoscape when data arrives
  useEffect(() => {
    if (elements.length > 0) {
      cytoscape.setElements(elements);
      cytoscape.runLayout(layout);
    }
  }, [elements, cytoscape.setElements, cytoscape.runLayout, layout]);

  // Apply filters whenever they change
  useEffect(() => {
    cytoscape.applyFilter(filters.visibleNodeIds);
  }, [filters.visibleNodeIds, cytoscape.applyFilter]);

  // Handle node click from Cytoscape
  const handleNodeClick = useCallback((nodeData) => {
    setSelectedNode(nodeData);
    setDetailPanelOpen(true);
    cytoscape.selectNode(nodeData.id);

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
  }, [pathMode, cytoscape]);

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
            onClose={() => {
              setDetailPanelOpen(false);
              setSelectedNode(null);
            }}
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
