import { useState, useEffect, useCallback } from 'react';
import { listMemories, getEdgesBulk, getLinks } from '../lib/api';

// Transform raw API data into Cytoscape elements
function transformToCytoscapeElements(memories, linksByNode) {
  const nodes = [];
  const edges = [];
  const seenEdges = new Set();

  for (const item of memories) {
    const id = item.item_id || item.id;
    const type = item.memory_type || item.type || 'semantic';
    const label = item.title || item.content?.substring(0, 40) || id.substring(0, 12);
    const category = ['semantic', 'episodic', 'procedural', 'working', 'zettel', 'decision', 'reasoning', 'opinion', 'observation'].includes(type) ? 'memory' : 'entity';

    nodes.push({
      group: 'nodes',
      data: {
        id,
        label,
        type,
        category,
        content: item.content || '',
        confidence: item.confidence,
        created_at: item.created_at,
        updated_at: item.updated_at,
        metadata: item.metadata || {},
      },
    });

    // Process links for this node
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
          data: {
            id: edgeKey,
            source: sourceId,
            target: targetId,
            label: edgeType,
            type: edgeType,
            weight: link.weight || 1,
            confidence: link.confidence,
          },
        });
      }
    }
  }

  // Filter edges to only include those where both endpoints exist
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
      // Fetch all memories
      const memoriesRes = await listMemories(2000);
      const memories = memoriesRes?.items || memoriesRes?.memories || memoriesRes || [];

      if (!Array.isArray(memories) || memories.length === 0) {
        setElements([]);
        setStats({ nodes: 0, edges: 0, types: {} });
        setLoading(false);
        return;
      }

      // Fetch all edges in a single bulk request (replaces N per-node calls)
      const nodeIds = memories.map((m) => m.item_id || m.id);
      const linksByNode = {};
      try {
        const edgesRes = await getEdgesBulk(nodeIds);
        const edges = edgesRes?.edges || [];
        for (const edge of edges) {
          const src = edge.source_id;
          const tgt = edge.target_id;
          const link = { source_id: src, target_id: tgt, link_type: edge.edge_type };
          if (!linksByNode[src]) linksByNode[src] = [];
          linksByNode[src].push(link);
        }
      } catch {
        // Bulk endpoint unavailable — fall back to per-node fetching
        const batchSize = 20;
        for (let i = 0; i < memories.length; i += batchSize) {
          const batch = memories.slice(i, i + batchSize);
          const results = await Promise.allSettled(
            batch.map((m) => {
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
      }

      const cyElements = transformToCytoscapeElements(memories, linksByNode);

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

  return { elements, loading, error, stats, refresh: fetchGraph };
}
