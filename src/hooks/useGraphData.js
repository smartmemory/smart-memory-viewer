import { useState, useEffect, useCallback } from 'react';
import { getFullGraph, listMemories, getEdgesBulk, getLinks } from '../lib/api';
import { MEMORY_TYPE_SET } from '../lib/graphColors';
import { coalesceElements } from './useGraphStream';

/**
 * Transform the /graph/full response into Cytoscape elements.
 */
function transformFullGraph(graphData) {
  const nodes = [];
  const edges = [];
  const seenEdges = new Set();

  for (const node of graphData.nodes || []) {
    const id = node.item_id;
    if (!id) continue;
    // Skip Wikipedia grounding nodes — they are metadata, not visible graph elements
    if (id.startsWith('wikipedia:')) continue;
    const type = node.memory_type || 'semantic';
    const label = node.label || id.substring(0, 12);
    const category = node.category || (MEMORY_TYPE_SET.has(type) ? 'memory' : 'entity');

    nodes.push({
      group: 'nodes',
      data: {
        id,
        label,
        type,
        category,
        content: node.content || '',
        confidence: node.confidence,
        created_at: node.created_at,
      },
    });
  }

  const nodeIds = new Set(nodes.map((n) => n.data.id));

  for (const edge of graphData.edges || []) {
    const src = edge.source_id;
    const tgt = edge.target_id;
    if (!src || !tgt) continue;
    // Only include edges where both endpoints exist
    if (!nodeIds.has(src) || !nodeIds.has(tgt)) continue;
    const edgeType = edge.edge_type || 'RELATES_TO';
    // Skip GROUNDED_IN edges and edges to/from Wikipedia nodes
    if (edgeType === 'GROUNDED_IN') continue;
    if (src.startsWith('wikipedia:') || tgt.startsWith('wikipedia:')) continue;
    const edgeKey = `${src}->${tgt}:${edgeType}`;
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);

    edges.push({
      group: 'edges',
      data: {
        id: edgeKey,
        source: src,
        target: tgt,
        label: edgeType,
        type: edgeType,
      },
    });
  }

  return [...nodes, ...edges];
}

/**
 * Fallback: transform memory list + edges into Cytoscape elements.
 * Used when /graph/full is unavailable.
 */
function transformToCytoscapeElements(memories, linksByNode) {
  const nodes = [];
  const edges = [];
  const seenEdges = new Set();

  for (const item of memories) {
    const id = item.item_id || item.id;
    const type = item.memory_type || item.type || 'semantic';
    const label = item.title || item.content?.substring(0, 40) || id.substring(0, 12);
    const category = MEMORY_TYPE_SET.has(type) ? 'memory' : 'entity';

    nodes.push({
      group: 'nodes',
      data: { id, label, type, category, content: item.content || '' },
    });

    const links = linksByNode[id] || [];
    for (const link of links) {
      const sourceId = link.source_id || link.source;
      const targetId = link.target_id || link.target;
      const edgeType = link.link_type || link.relation_type || link.type || 'RELATES_TO';
      const edgeKey = `${sourceId}->${targetId}:${edgeType}`;
      if (!seenEdges.has(edgeKey)) {
        seenEdges.add(edgeKey);
        edges.push({
          group: 'edges',
          data: { id: edgeKey, source: sourceId, target: targetId, label: edgeType, type: edgeType },
        });
      }
    }
  }

  const nodeIds = new Set(nodes.map((n) => n.data.id));
  const validEdges = edges.filter((e) => nodeIds.has(e.data.source) && nodeIds.has(e.data.target));
  return [...nodes, ...validEdges];
}

export function useGraphData() {
  const [elements, setElements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({ nodes: 0, edges: 0, types: {} });

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Primary path: use /graph/full endpoint (returns ALL graph nodes + edges)
      let cyElements;
      try {
        const graphData = await getFullGraph();
        cyElements = transformFullGraph(graphData);
      } catch {
        // Fallback: use memory list + edge bulk (only shows memory nodes)
        const memoriesRes = await listMemories(2000);
        const rawMemories = memoriesRes?.items || memoriesRes?.memories || memoriesRes || [];
        const memories = Array.isArray(rawMemories)
          ? rawMemories.filter((m) => {
              const id = m.item_id || m.id || '';
              return !id.startsWith('version_');
            })
          : [];

        if (memories.length === 0) {
          setElements([]);
          setStats({ nodes: 0, edges: 0, types: {} });
          setLoading(false);
          return;
        }

        const nodeIds = memories.map((m) => m.item_id || m.id);
        const linksByNode = {};
        try {
          const edgesRes = await getEdgesBulk(nodeIds);
          for (const edge of edgesRes?.edges || []) {
            const link = { source_id: edge.source_id, target_id: edge.target_id, link_type: edge.edge_type };
            if (!linksByNode[edge.source_id]) linksByNode[edge.source_id] = [];
            linksByNode[edge.source_id].push(link);
          }
        } catch {
          // Per-node fallback
          const results = await Promise.allSettled(
            memories.slice(0, 100).map((m) => {
              const id = m.item_id || m.id;
              return getLinks(id).then((links) => ({ id, links }));
            })
          );
          for (const result of results) {
            if (result.status === 'fulfilled') {
              const { id, links } = result.value;
              linksByNode[id] = Array.isArray(links) ? links : links?.links || [];
            }
          }
        }
        cyElements = transformToCytoscapeElements(memories, linksByNode);
      }

      // Coalesce duplicate entities and merge reciprocal edge pairs (CONTAINS_ENTITY + MENTIONED_IN → RELATED_ENTITY)
      const rawNodes = cyElements.filter((e) => e.group === 'nodes');
      const rawEdges = cyElements.filter((e) => e.group === 'edges');
      const { nodes: coalescedNodes, edges: coalescedEdges } = coalesceElements(rawNodes, rawEdges, {});
      cyElements = [...coalescedNodes, ...coalescedEdges];

      // Calculate stats
      const nodeCount = cyElements.filter((e) => e.group === 'nodes').length;
      const edgeCount = cyElements.filter((e) => e.group === 'edges').length;
      const typeCounts = {};
      for (const el of cyElements) {
        if (el.group === 'nodes') {
          const t = el.data.type;
          typeCounts[t] = (typeCounts[t] || 0) + 1;
        }
      }

      setElements(cyElements);
      setStats({ nodes: nodeCount, edges: edgeCount, types: typeCounts });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  const incrementStats = useCallback((addedNodes, addedEdges) => {
    const nodeArr = Array.isArray(addedNodes) ? addedNodes : [];
    const edgeNum = typeof addedEdges === 'number' ? addedEdges : 0;
    if (nodeArr.length === 0 && edgeNum === 0) return;
    setStats((prev) => {
      const types = { ...prev.types };
      for (const el of nodeArr) {
        const t = el.data?.type || 'semantic';
        types[t] = (types[t] || 0) + 1;
      }
      return { nodes: prev.nodes + nodeArr.length, edges: prev.edges + edgeNum, types };
    });
  }, []);

  return { elements, loading, error, stats, refresh: fetchGraph, incrementStats };
}
