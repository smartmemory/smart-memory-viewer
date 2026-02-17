import { useState, useCallback, useMemo } from 'react';

export function useGraphFilters(elements) {
  // null = all types visible (default). Becomes a Set once user explicitly toggles.
  const [activeMemoryTypes, setActiveMemoryTypes] = useState(null);
  const [activeEntityTypes, setActiveEntityTypes] = useState(null);
  const [activeRelationTypes, setActiveRelationTypes] = useState(null);

  // Extra types and node IDs discovered from streaming events (not in the initial elements array).
  // This lets the filter panel and visibility filter update in real-time without touching the
  // `elements` state (which would trigger a full canvas re-render and kill drip-feed animation).
  const [streamedTypes, setStreamedTypes] = useState({ memory: new Set(), entity: new Set(), relation: new Set() });
  const [streamedNodeMap, setStreamedNodeMap] = useState(new Map()); // nodeId -> { type, category }
  const [cascadeEdgeFilter, setCascadeEdgeFilter] = useState(() => {
    const stored = localStorage.getItem('viewer:cascadeEdgeFilter');
    return stored !== null ? stored === 'true' : false;
  });

  // Register types and node IDs from streaming elements so the filter panel and
  // visibility filter stay in sync. Only updates state when new data is discovered.
  const registerStreamedElements = useCallback((els) => {
    if (!els || els.length === 0) return;

    // Track types
    setStreamedTypes((prev) => {
      let changed = false;
      const memory = new Set(prev.memory);
      const entity = new Set(prev.entity);
      const relation = new Set(prev.relation);
      for (const el of els) {
        if (el.group === 'nodes') {
          const type = el.data.type;
          if (el.data.category === 'memory' && !memory.has(type)) { memory.add(type); changed = true; }
          else if (el.data.category === 'entity' && !entity.has(type)) { entity.add(type); changed = true; }
        } else if (el.group === 'edges') {
          if (!relation.has(el.data.type)) { relation.add(el.data.type); changed = true; }
        }
      }
      return changed ? { memory, entity, relation } : prev;
    });

    // Track node IDs so visibleNodeIds includes streamed nodes
    setStreamedNodeMap((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const el of els) {
        if (el.group === 'nodes' && !next.has(el.data.id)) {
          next.set(el.data.id, { type: el.data.type, category: el.data.category });
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  // Extract available types from API data + streaming data
  const availableTypes = useMemo(() => {
    const memoryTypes = new Set(streamedTypes.memory);
    const entityTypes = new Set(streamedTypes.entity);
    const relationTypes = new Set(streamedTypes.relation);

    for (const el of elements) {
      if (el.group === 'nodes') {
        const type = el.data.type;
        if (el.data.category === 'memory') memoryTypes.add(type);
        else if (el.data.category === 'entity') entityTypes.add(type);
      } else if (el.group === 'edges') {
        relationTypes.add(el.data.type);
      }
    }

    return {
      memoryTypes: Array.from(memoryTypes).sort(),
      entityTypes: Array.from(entityTypes).sort(),
      relationTypes: Array.from(relationTypes).sort(),
    };
  }, [elements, streamedTypes]);

  // Resolve null (all) to the actual set from data
  const activeMemorySet = useMemo(() => {
    return activeMemoryTypes === null ? new Set(availableTypes.memoryTypes) : activeMemoryTypes;
  }, [activeMemoryTypes, availableTypes.memoryTypes]);

  const activeEntitySet = useMemo(() => {
    return activeEntityTypes === null ? new Set(availableTypes.entityTypes) : activeEntityTypes;
  }, [activeEntityTypes, availableTypes.entityTypes]);

  const activeEdgeTypes = useMemo(() => {
    return activeRelationTypes === null ? new Set(availableTypes.relationTypes) : activeRelationTypes;
  }, [activeRelationTypes, availableTypes.relationTypes]);

  // Compute visible node IDs based on active filters (includes both API and streamed nodes)
  const visibleNodeIds = useMemo(() => {
    const ids = new Set();

    // API-fetched nodes
    for (const el of elements) {
      if (el.group !== 'nodes') continue;
      const { type, category } = el.data;
      if (category === 'memory' && activeMemorySet.has(type)) {
        ids.add(el.data.id);
      } else if (category === 'entity' && activeEntitySet.has(type)) {
        ids.add(el.data.id);
      }
    }

    // Streamed nodes (not in elements array to avoid killing drip-feed animation)
    for (const [nodeId, { type, category }] of streamedNodeMap) {
      if (category === 'memory' && activeMemorySet.has(type)) {
        ids.add(nodeId);
      } else if (category === 'entity' && activeEntitySet.has(type)) {
        ids.add(nodeId);
      }
    }

    return ids;
  }, [elements, activeMemorySet, activeEntitySet, streamedNodeMap]);

  const toggleMemoryType = useCallback((type) => {
    setActiveMemoryTypes((prev) => {
      // If null (all), initialize from available and then remove the toggled one
      const current = prev === null ? new Set(availableTypes.memoryTypes) : new Set(prev);
      if (current.has(type)) current.delete(type);
      else current.add(type);
      return current;
    });
  }, [availableTypes.memoryTypes]);

  const toggleEntityType = useCallback((type) => {
    setActiveEntityTypes((prev) => {
      const current = prev === null ? new Set(availableTypes.entityTypes) : new Set(prev);
      if (current.has(type)) current.delete(type);
      else current.add(type);
      return current;
    });
  }, [availableTypes.entityTypes]);

  const toggleRelationType = useCallback((type) => {
    setActiveRelationTypes((prev) => {
      const current = prev === null ? new Set(availableTypes.relationTypes) : new Set(prev);
      if (current.has(type)) current.delete(type);
      else current.add(type);
      return current;
    });
  }, [availableTypes.relationTypes]);

  const selectAllMemoryTypes = useCallback(() => {
    setActiveMemoryTypes(null); // null = all
  }, []);

  const deselectAllMemoryTypes = useCallback(() => {
    setActiveMemoryTypes(new Set());
  }, []);

  const selectAllEntityTypes = useCallback(() => {
    setActiveEntityTypes(null); // null = all
  }, []);

  const deselectAllEntityTypes = useCallback(() => {
    setActiveEntityTypes(new Set());
  }, []);

  const selectAllRelationTypes = useCallback(() => {
    setActiveRelationTypes(null); // null = all
  }, []);

  const deselectAllRelationTypes = useCallback(() => {
    setActiveRelationTypes(new Set());
  }, []);

  return {
    // Expose resolved sets (never null) for consumers
    activeMemoryTypes: activeMemorySet,
    activeEntityTypes: activeEntitySet,
    activeRelationTypes,
    activeEdgeTypes,
    availableTypes,
    visibleNodeIds,
    toggleMemoryType,
    toggleEntityType,
    toggleRelationType,
    setActiveRelationTypes,
    selectAllMemoryTypes,
    deselectAllMemoryTypes,
    selectAllEntityTypes,
    deselectAllEntityTypes,
    selectAllRelationTypes,
    deselectAllRelationTypes,
    registerStreamedElements,
    cascadeEdgeFilter,
    toggleCascadeEdgeFilter: () =>
      setCascadeEdgeFilter((prev) => {
        const next = !prev;
        localStorage.setItem('viewer:cascadeEdgeFilter', String(next));
        return next;
      }),
  };
}
