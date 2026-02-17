import { useRef, useEffect, useCallback, useState } from 'react';
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
  // Track the container element so we can re-run when it becomes available
  const [containerReady, setContainerReady] = useState(false);
  const [cyReady, setCyReady] = useState(false);

  // Autofit: when enabled, cy.fit() runs on every container resize
  const [autoFit, setAutoFit] = useState(true);
  const autoFitRef = useRef(true);
  useEffect(() => { autoFitRef.current = autoFit; }, [autoFit]);

  // Stable ref for event callbacks — avoids re-registering events on every render
  const onNodeClickRef = useRef(null);
  const onNodeDblClickRef = useRef(null);
  const onNodeHoverRef = useRef(null);
  const onNodeHoverOutRef = useRef(null);
  const onBgClickRef = useRef(null);

  // Use a ref callback to detect when the container element mounts
  const setContainerRef = useCallback((node) => {
    containerRef.current = node;
    setContainerReady(!!node);
  }, [containerRef]);

  // Initialize Cytoscape when container is available
  useEffect(() => {
    if (!containerRef.current) return;

    // Already initialized on this container
    if (cyRef.current) return;

    const container = containerRef.current;
    // Clean up any leftover DOM (StrictMode double-mount safety)
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const cy = cytoscape({
      container,
      style: getCytoscapeStyles(),
      elements: [],
      layout: { name: 'preset' },
      minZoom: 0.1,
      maxZoom: 5,
      wheelSensitivity: 0.3,
      boxSelectionEnabled: false,
      autounselectify: false,
    });

    // Register events immediately — they delegate through refs so
    // the actual callback can be updated without re-registering.
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      if (node !== cy && node.isNode() && onNodeClickRef.current) {
        onNodeClickRef.current(node.data());
      }
    });
    cy.on('dbltap', 'node', (evt) => {
      const node = evt.target;
      if (node !== cy && node.isNode() && onNodeDblClickRef.current) {
        onNodeDblClickRef.current(node.data());
      }
    });
    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      if (node !== cy && node.isNode() && onNodeHoverRef.current) {
        const pos = evt.renderedPosition || evt.position;
        onNodeHoverRef.current(node.data(), pos);
      }
    });
    cy.on('mouseout', 'node', () => {
      onNodeHoverOutRef.current?.();
    });
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        cy.elements().unselect();
        cy.elements().removeClass('neighbor');
        onBgClickRef.current?.();
      }
    });

    // Watch container resizes — when the detail panel opens/closes, the container
    // changes size and Cytoscape's internal hit-testing coordinates go stale.
    // cy.resize() forces Cytoscape to recalculate its viewport dimensions.
    // When autoFit is on, also fit the graph to the new viewport.
    const resizeObserver = new ResizeObserver(() => {
      cy.resize();
      if (autoFitRef.current && cy.nodes().length > 0) {
        cy.fit(cy.elements(':visible'), 50);
      }
    });
    resizeObserver.observe(container);

    console.log('[useCytoscape] Cytoscape initialized, tap handlers registered');
    cyRef.current = cy;
    setCyReady(true);

    return () => {
      resizeObserver.disconnect();
      cy.destroy();
      cyRef.current = null;
      setCyReady(false);
    };
  }, [containerReady, containerRef]);

  // Set elements (nodes + edges) — batch update
  const setElements = useCallback((elements) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().remove();
      cy.add(elements);
    });
  }, []);

  // Run a layout algorithm — first run is instant, subsequent runs animate
  const firstLayoutRef = useRef(true);

  const runLayout = useCallback((layoutName = 'cose-bilkent', options = {}) => {
    const cy = cyRef.current;
    if (!cy || cy.nodes().length === 0) return;

    const shouldAnimate = !firstLayoutRef.current;
    firstLayoutRef.current = false;

    const layoutDefaults = {
      'cose-bilkent': {
        name: 'cose-bilkent',
        quality: 'default',
        animate: shouldAnimate ? 'end' : false,
        animationDuration: 400,
        nodeDimensionsIncludeLabels: true,
        idealEdgeLength: 100,
        edgeElasticity: 0.45,
        nestingFactor: 0.1,
        gravity: 0.25,
        numIter: 2500,
        tile: true,
        randomize: shouldAnimate,
      },
      dagre: {
        name: 'dagre',
        rankDir: 'TB',
        animate: shouldAnimate,
        animationDuration: 400,
        nodeSep: 50,
        rankSep: 80,
      },
      circle: {
        name: 'circle',
        animate: shouldAnimate,
        animationDuration: 400,
      },
      concentric: {
        name: 'concentric',
        animate: shouldAnimate,
        animationDuration: 400,
        concentric: (node) => node.degree(),
        levelWidth: () => 2,
      },
      grid: {
        name: 'grid',
        animate: shouldAnimate,
        animationDuration: 400,
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

  // Highlight/dim for filtering (nodes by type, edges by type + endpoints)
  // When cascade=true, filtering a relation hides its target nodes (not sources)
  const applyFilter = useCallback((visibleNodeIds, visibleEdgeTypes, cascade = true) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      // Pass 1: determine which edges are visible, track targets of filtered edges
      const nodesWithVisibleEdge = new Set();
      const targetsOfFilteredEdges = new Set();
      cy.edges().forEach((edge) => {
        const srcTypeOk = visibleNodeIds.has(edge.source().id());
        const tgtTypeOk = visibleNodeIds.has(edge.target().id());
        const edgeTypeOk = !visibleEdgeTypes || visibleEdgeTypes.has(edge.data('type'));
        if (srcTypeOk && tgtTypeOk && edgeTypeOk) {
          edge.removeClass('dimmed');
          nodesWithVisibleEdge.add(edge.source().id());
          nodesWithVisibleEdge.add(edge.target().id());
        } else {
          edge.addClass('dimmed');
          // Track targets of edges filtered by relation type (not by node type)
          if (srcTypeOk && tgtTypeOk && !edgeTypeOk) {
            targetsOfFilteredEdges.add(edge.target().id());
          }
        }
      });

      // Pass 2: show/dim nodes
      cy.nodes().forEach((node) => {
        if (!visibleNodeIds.has(node.id())) {
          node.addClass('dimmed');
          return;
        }
        // Without cascade: just check node type filter
        if (!cascade) {
          node.removeClass('dimmed');
          return;
        }
        // With cascade: hide targets of filtered relations that have no other visible edges
        const isTargetOfFiltered = targetsOfFilteredEdges.has(node.id());
        const hasVisibleEdge = nodesWithVisibleEdge.has(node.id());
        if (isTargetOfFiltered && !hasVisibleEdge) {
          node.addClass('dimmed');
        } else {
          node.removeClass('dimmed');
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

  // Setters for event callbacks — called by consumer to wire up handlers
  const setOnNodeClick = useCallback((fn) => { onNodeClickRef.current = fn; }, []);
  const setOnNodeDblClick = useCallback((fn) => { onNodeDblClickRef.current = fn; }, []);
  const setOnNodeHover = useCallback((fn) => { onNodeHoverRef.current = fn; }, []);
  const setOnNodeHoverOut = useCallback((fn) => { onNodeHoverOutRef.current = fn; }, []);
  const setOnBgClick = useCallback((fn) => { onBgClickRef.current = fn; }, []);

  return {
    cy: cyRef,
    ready: cyReady,
    setContainerRef,
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
    setOnNodeClick,
    setOnNodeDblClick,
    setOnNodeHover,
    setOnNodeHoverOut,
    setOnBgClick,
    autoFit,
    setAutoFit,
  };
}
