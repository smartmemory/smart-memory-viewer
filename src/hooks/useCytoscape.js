import { useRef, useEffect, useCallback } from 'react';
import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import dagre from 'cytoscape-dagre';
// NOTE: Skip elk for now — it requires a complex async import setup
import { getCytoscapeStyles } from '../lib/cytoscapeStyles';

// Register layout extensions once
let registered = false;
if (!registered) {
  cytoscape.use(coseBilkent);
  cytoscape.use(dagre);
  registered = true;
}

export function useCytoscape(containerRef) {
  const cyRef = useRef(null);

  // Initialize Cytoscape when container mounts
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: getCytoscapeStyles(),
      elements: [],
      layout: { name: 'preset' },
      minZoom: 0.1,
      maxZoom: 5,
      wheelSensitivity: 0.3,
      boxSelectionEnabled: false,
      autounselectify: false,
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- containerRef is a stable useRef, runs once on mount
  }, []);

  // Set elements (nodes + edges) — batch update
  const setElements = useCallback((elements) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().remove();
      cy.add(elements);
    });
  }, []);

  // Run a layout algorithm
  const runLayout = useCallback((layoutName = 'cose-bilkent', options = {}) => {
    const cy = cyRef.current;
    if (!cy || cy.nodes().length === 0) return;

    const layoutDefaults = {
      'cose-bilkent': {
        name: 'cose-bilkent',
        quality: 'default',
        animate: 'end',
        animationDuration: 500,
        nodeDimensionsIncludeLabels: true,
        idealEdgeLength: 100,
        edgeElasticity: 0.45,
        nestingFactor: 0.1,
        gravity: 0.25,
        numIter: 2500,
        tile: true,
        randomize: true,
      },
      dagre: {
        name: 'dagre',
        rankDir: 'TB',
        animate: true,
        animationDuration: 500,
        nodeSep: 50,
        rankSep: 80,
      },
      circle: {
        name: 'circle',
        animate: true,
        animationDuration: 500,
      },
      concentric: {
        name: 'concentric',
        animate: true,
        animationDuration: 500,
        concentric: (node) => node.degree(),
        levelWidth: () => 2,
      },
      grid: {
        name: 'grid',
        animate: true,
        animationDuration: 500,
        condense: true,
      },
    };

    const config = { ...(layoutDefaults[layoutName] || { name: layoutName }), ...options };
    cy.layout(config).run();
  }, []);

  // Zoom controls
  const zoomIn = useCallback(() => {
    const cy = cyRef.current;
    if (cy) cy.zoom({ level: cy.zoom() * 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }, []);

  const zoomOut = useCallback(() => {
    const cy = cyRef.current;
    if (cy) cy.zoom({ level: cy.zoom() / 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }, []);

  const fitToScreen = useCallback(() => {
    const cy = cyRef.current;
    if (cy) cy.fit(cy.elements(':visible'), 50);
  }, []);

  // Highlight/dim for filtering
  const applyFilter = useCallback((visibleNodeIds) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.nodes().forEach((node) => {
        if (visibleNodeIds.has(node.id())) {
          node.removeClass('dimmed');
        } else {
          node.addClass('dimmed');
        }
      });
      cy.edges().forEach((edge) => {
        const srcVisible = visibleNodeIds.has(edge.source().id());
        const tgtVisible = visibleNodeIds.has(edge.target().id());
        if (srcVisible && tgtVisible) {
          edge.removeClass('dimmed');
        } else {
          edge.addClass('dimmed');
        }
      });
    });
  }, []);

  // Clear all highlights
  const clearHighlights = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass('highlighted dimmed neighbor');
    });
  }, []);

  // Highlight specific elements (search results, path)
  const highlightElements = useCallback((nodeIds, edgeIds = []) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass('highlighted');
      nodeIds.forEach((id) => {
        const node = cy.getElementById(id);
        if (node.length) node.addClass('highlighted');
      });
      edgeIds.forEach((id) => {
        const edge = cy.getElementById(id);
        if (edge.length) edge.addClass('highlighted');
      });
    });
  }, []);

  // Add elements (nodes + edges) without removing existing ones
  const addElements = useCallback((newElements) => {
    const cy = cyRef.current;
    if (!cy) return 0;
    let addedCount = 0;
    cy.batch(() => {
      for (const el of newElements) {
        const id = el.data?.id;
        if (id && !cy.getElementById(id).length) {
          cy.add(el);
          addedCount++;
        }
      }
    });
    return addedCount;
  }, []);

  // Select a node and highlight its neighbors
  const selectNode = useCallback((nodeId) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass('neighbor');
      const node = cy.getElementById(nodeId);
      if (node.length) {
        node.select();
        node.neighborhood().nodes().addClass('neighbor');
      }
    });
  }, []);

  // Get edges connected to a node (for detail panel)
  const getConnectedEdges = useCallback((nodeId) => {
    const cy = cyRef.current;
    if (!cy) return [];
    const node = cy.getElementById(nodeId);
    if (!node.length) return [];
    return node.connectedEdges().map((e) => e.data());
  }, []);

  // LOD clustering — group nodes by type into compound parents when node count exceeds threshold
  const LOD_THRESHOLD = 200;

  const removeClustering = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.nodes().forEach((n) => n.move({ parent: null }));
      cy.nodes('.lod-cluster').remove();
    });
  }, []);

  const applyClustering = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const visibleNodes = cy.nodes(':visible').not(':parent');
    if (visibleNodes.length <= LOD_THRESHOLD) {
      removeClustering();
      return;
    }

    // Group visible nodes by type
    const groups = {};
    visibleNodes.forEach((node) => {
      const type = node.data('type') || 'unknown';
      if (!groups[type]) groups[type] = [];
      groups[type].push(node);
    });

    cy.batch(() => {
      // Step 1: Unparent all children from existing clusters
      cy.nodes().forEach((n) => {
        if (n.parent().hasClass('lod-cluster')) {
          n.move({ parent: null });
        }
      });
      // Step 2: Remove old cluster parents
      cy.nodes('.lod-cluster').remove();

      // Step 3: Create new clusters and parent nodes into them
      for (const [type, nodes] of Object.entries(groups)) {
        // Only cluster groups with 5+ nodes
        if (nodes.length < 5) continue;

        const clusterId = `__cluster_${type}`;
        cy.add({
          group: 'nodes',
          data: {
            id: clusterId,
            label: `${type} (${nodes.length})`,
            type,
            category: 'cluster',
          },
          classes: 'lod-cluster',
        });

        for (const node of nodes) {
          node.move({ parent: clusterId });
        }
      }
    });
  }, [removeClustering]);

  return {
    cy: cyRef,
    setElements,
    addElements,
    runLayout,
    zoomIn,
    zoomOut,
    fitToScreen,
    applyFilter,
    clearHighlights,
    highlightElements,
    selectNode,
    getConnectedEdges,
    applyClustering,
    removeClustering,
  };
}
